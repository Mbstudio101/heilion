// Audio Converter - Handles ffmpeg-based audio conversion for Whisper.cpp
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const os = require('os');

const execAsync = promisify(exec);

// Common ffmpeg installation paths
const FFMPEG_PATHS = [
  'ffmpeg', // In PATH
  '/usr/local/bin/ffmpeg', // Homebrew
  '/opt/homebrew/bin/ffmpeg', // Homebrew (Apple Silicon)
  path.join(process.env.HOME || '', 'bin', 'ffmpeg'), // User bin
  '/usr/bin/ffmpeg' // System install
];

let ffmpegPath = null;

async function findFFmpeg() {
  if (ffmpegPath && fs.existsSync(ffmpegPath)) {
    return ffmpegPath;
  }

  // Try to find ffmpeg in common locations
  for (const candidatePath of FFMPEG_PATHS) {
    try {
      // Check if file exists (for full paths)
      if (candidatePath.includes('/')) {
        if (fs.existsSync(candidatePath)) {
          // Test if it's actually ffmpeg
          try {
            const { stdout } = await execAsync(`"${candidatePath}" -version`, { timeout: 3000 });
            if (stdout.includes('ffmpeg version')) {
              ffmpegPath = candidatePath;
              return ffmpegPath;
            }
          } catch (error) {
            continue;
          }
        }
      } else {
        // Check if command exists in PATH
        try {
          const { stdout } = await execAsync(`which ${candidatePath}`, { timeout: 2000 });
          if (stdout.trim()) {
            const fullPath = stdout.trim();
            // Test if it's actually ffmpeg
            const { stdout: version } = await execAsync(`"${fullPath}" -version`, { timeout: 3000 });
            if (version.includes('ffmpeg version')) {
              ffmpegPath = fullPath;
              return ffmpegPath;
            }
          }
        } catch (error) {
          continue;
        }
      }
    } catch (error) {
      continue;
    }
  }

  return null;
}

async function checkFFmpegAvailable() {
  const foundPath = await findFFmpeg();
  return { available: !!foundPath, path: foundPath };
}

// Validate WAV file - check for RIFF/WAVE header
function validateWAVFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return { valid: false, error: 'File does not exist' };
    }

    const buffer = fs.readFileSync(filePath, { start: 0, end: 11 });
    const header = buffer.toString('ascii', 0, 4);
    const format = buffer.toString('ascii', 8, 12);

    if (header === 'RIFF' && format === 'WAVE') {
      return { valid: true };
    } else {
      return { 
        valid: false, 
        error: `Invalid WAV header: expected "RIFF...WAVE", got "${header}...${format}"` 
      };
    }
  } catch (error) {
    return { valid: false, error: error.message };
  }
}

// Convert audio file to Whisper-compatible WAV using ffmpeg
// Input: path to raw audio file (WebM/MP4/Opus/etc.)
// Output: path to converted WAV file (16kHz mono PCM 16-bit)
async function convertToWhisperWAV(inputPath, outputPath = null) {
  try {
    // Check if input file exists
    if (!fs.existsSync(inputPath)) {
      return { 
        success: false, 
        error: `Input file not found: ${inputPath}` 
      };
    }

    // Find ffmpeg
    const ffmpeg = await findFFmpeg();
    
    if (!ffmpeg) {
      return { 
        success: false, 
        error: 'ffmpeg not found. Please install ffmpeg to use local Whisper STT.',
        suggestion: 'Install ffmpeg: brew install ffmpeg'
      };
    }

    // Generate output path if not provided
    if (!outputPath) {
      const inputExt = path.extname(inputPath);
      const inputBase = path.basename(inputPath, inputExt);
      const outputDir = path.dirname(inputPath);
      outputPath = path.join(outputDir, `${inputBase}_converted.wav`);
    }

    // Convert using ffmpeg:
    // -y: overwrite output file
    // -i: input file
    // -ac 1: mono (1 audio channel)
    // -ar 16000: 16kHz sample rate
    // -c:a pcm_s16le: PCM 16-bit little-endian audio codec
    const command = `"${ffmpeg}" -y -i "${inputPath}" -ac 1 -ar 16000 -c:a pcm_s16le "${outputPath}"`;
    
    console.log(`Converting audio with ffmpeg: ${command}`);
    
    const { stdout, stderr } = await execAsync(command, {
      timeout: 30000, // 30 second timeout
      maxBuffer: 1024 * 1024 * 5 // 5MB buffer
    });

    // Check if output file was created
    if (!fs.existsSync(outputPath)) {
      return { 
        success: false, 
        error: 'ffmpeg conversion failed: output file was not created',
        stderr
      };
    }

    // Validate WAV file
    const validation = validateWAVFile(outputPath);
    if (!validation.valid) {
      // Clean up invalid file
      try {
        fs.unlinkSync(outputPath);
      } catch (error) {
        // Ignore cleanup errors
      }
      return { 
        success: false, 
        error: `Invalid WAV file created: ${validation.error}`,
        stderr
      };
    }

    return { 
      success: true, 
      filePath: outputPath,
      inputPath,
      outputPath
    };
  } catch (error) {
    return { 
      success: false, 
      error: error.message || 'ffmpeg conversion failed',
      stderr: error.stderr || ''
    };
  }
}

module.exports = {
  findFFmpeg,
  checkFFmpegAvailable,
  convertToWhisperWAV,
  validateWAVFile
};
