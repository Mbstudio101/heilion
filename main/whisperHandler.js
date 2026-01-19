// Whisper STT Handler - Handles local Whisper.cpp transcription
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');

const execAsync = promisify(exec);

// Common whisper.cpp installation paths
const WHISPER_PATHS = [
  'whisper.cpp', // In PATH
  'whisper-cli', // whisper-cli binary name (cmake build)
  './whisper.cpp', // Current directory
  path.join(process.env.HOME || '', 'whisper.cpp', 'whisper.cpp'), // Home directory symlink
  path.join(process.env.HOME || '', 'whisper.cpp', 'build', 'bin', 'whisper-cli'), // Home directory cmake build
  '/usr/local/bin/whisper.cpp', // System install
  path.join(__dirname, '..', 'whisper.cpp', 'whisper.cpp') // Project directory
];

let whisperPath = null;

async function findWhisperBinary() {
  if (whisperPath && fs.existsSync(whisperPath)) {
    return whisperPath;
  }

  // Try to find whisper.cpp in common locations
  for (const candidatePath of WHISPER_PATHS) {
    try {
      // Check if file exists (for full paths) or if command exists (for PATH commands)
      if (candidatePath.includes('/') || candidatePath.startsWith('.')) {
        if (fs.existsSync(candidatePath)) {
          whisperPath = candidatePath;
          return whisperPath;
        }
      } else {
        // Check if command exists in PATH
        const { stdout } = await execAsync(`which ${candidatePath}`, { timeout: 2000 });
        if (stdout.trim()) {
          whisperPath = stdout.trim();
          return whisperPath;
        }
      }
    } catch (error) {
      // Continue searching
      continue;
    }
  }

  return null;
}

async function checkWhisperAvailable() {
  const foundPath = await findWhisperBinary();
  return { available: !!foundPath, path: foundPath };
}

async function findModelPath(modelName = null) {
  // If model name is specified, try to find it first
  const preferredModelName = modelName || 'base.en';
  
  // Build model filename from settings (e.g., 'base.en' -> 'ggml-base.en.bin')
  const preferredFileName = `ggml-${preferredModelName}.bin`;
  
  // Try to find model files in common locations
  // Prioritize specified model, then normal models (base.en, small.en)
  // NEVER use test models - they are empty (no tensors loaded)
  const modelNames = [
    preferredFileName, // User-specified model first
    'ggml-base.en.bin', // Standard base model (preferred default)
    'ggml-small.en.bin', // Small model (alternative)
    'ggml-tiny.en.bin', // Tiny model (fallback)
    'ggml-medium.en.bin' // Medium model (if available)
    // Test models REMOVED - they are empty and don't work
  ];

  const modelDirs = [
    path.join(process.env.HOME || '', 'whisper.cpp', 'models'),
    path.join(__dirname, '..', 'whisper.cpp', 'models'),
    './models',
    'models'
  ];

  // Try to find any available model
  for (const modelDir of modelDirs) {
    for (const modelName of modelNames) {
      const modelPath = path.join(modelDir, modelName);
      if (fs.existsSync(modelPath)) {
        return modelPath;
      }
    }
  }

  return null;
}

async function runWhisperTranscription(audioPath, modelName = null) {
  try {
    // Check if audio file exists
    if (!fs.existsSync(audioPath)) {
      return { success: false, error: `Audio file not found: ${audioPath}` };
    }

    // Find whisper.cpp binary
    const whisperBin = await findWhisperBinary();
    
    if (!whisperBin) {
      return { 
        success: false, 
        error: '',
        suggestion: ''
      };
    }

    // Find model file (use modelName from settings if provided)
    const modelPath = await findModelPath(modelName);
    
    if (!modelPath) {
      return {
        success: false,
        error: 'Whisper model not found. Please download a model or use cloud STT.',
        suggestion: 'Download model: https://huggingface.co/ggerganov/whisper.cpp/tree/main or use cloud STT'
      };
    }

    // Run whisper.cpp transcription with model path
    // Command format: whisper-cli -f <audio_file> -m <model> -t <threads>
    const command = `"${whisperBin}" -f "${audioPath}" -m "${modelPath}" -t 4`;
    
    console.log(`Running whisper.cpp: ${command}`);
    
    const { stdout, stderr } = await execAsync(command, { 
      timeout: 60000, // 60 second timeout
      maxBuffer: 1024 * 1024 * 10 // 10MB buffer
    });

    // Parse whisper.cpp output (format depends on version)
    // Common output: text transcript on stdout
    const transcript = stdout.trim() || stderr.trim();
    
    if (transcript) {
      return { success: true, transcript };
    } else {
      return { 
        success: false, 
        error: 'Whisper.cpp returned empty transcript',
        stdout,
        stderr
      };
    }
  } catch (error) {
    console.error('Whisper.cpp transcription error:', error);
    
    // Provide helpful error messages
    if (error.code === 'ENOENT') {
      return { 
        success: false, 
        error: 'Whisper.cpp not found. Please install whisper.cpp or use cloud STT.',
        suggestion: 'Install whisper.cpp: https://github.com/ggerganov/whisper.cpp'
      };
    } else if (error.code === 'ETIMEDOUT' || error.signal === 'SIGTERM') {
      return { 
        success: false, 
        error: 'Whisper.cpp transcription timed out'
      };
    } else {
      return { 
        success: false, 
        error: error.message || 'Whisper.cpp transcription failed'
      };
    }
  }
}

module.exports = {
  checkWhisperAvailable,
  runWhisperTranscription,
  findWhisperBinary
};
