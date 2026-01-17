// TTS Handler - Handles Soprano TTS sidecar communication
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

function getSopranoPreset(presetId) {
  const presets = {
    calm: { temperature: 0.7, top_p: 0.9, repetition_penalty: 1.1 },
    balanced: { temperature: 0.8, top_p: 0.95, repetition_penalty: 1.15 },
    expressive: { temperature: 0.9, top_p: 0.98, repetition_penalty: 1.2 }
  };
  return presets[presetId] || presets.balanced;
}

async function speakWithSoprano(text, voiceId, presetId, sopranoPort) {
  return new Promise((resolve) => {
    const preset = getSopranoPreset(presetId);
    
    const postData = JSON.stringify({
      input: text,
      model: voiceId || 'soprano-1.1-80m',
      temperature: preset.temperature,
      top_p: preset.top_p,
      repetition_penalty: preset.repetition_penalty
    });
    
    const options = {
      hostname: '127.0.0.1',
      port: sopranoPort,
      path: '/v1/audio/speech',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };
    
    const req = http.request(options, (res) => {
      if (res.statusCode === 200) {
        // Save audio to temp file and play it
        const tmpPath = path.join(os.tmpdir(), `heilion-tts-${Date.now()}.wav`);
        const fileStream = fs.createWriteStream(tmpPath);
        
        res.pipe(fileStream);
        
        fileStream.on('finish', () => {
          fileStream.close(() => {
            // Play audio file (macOS)
            if (process.platform === 'darwin') {
              exec(`afplay "${tmpPath}"`, (error) => {
                if (error) {
                  resolve({ success: false, error: error.message });
                } else {
                  resolve({ success: true });
                }
                // Clean up temp file after a delay
                setTimeout(() => {
                  try { fs.unlinkSync(tmpPath); } catch {}
                }, 5000);
              });
            } else {
              // For Linux/Windows, would need different player
              resolve({ success: false, error: 'Audio playback not implemented for this platform' });
            }
          });
        });
        
        fileStream.on('error', (error) => {
          resolve({ success: false, error: error.message });
        });
      } else {
        resolve({ success: false, error: `HTTP ${res.statusCode} - Soprano TTS service not available` });
      }
    });
    
    req.on('error', (error) => {
      // Connection refused means Soprano sidecar isn't running
      const errorMsg = error.code === 'ECONNREFUSED' 
        ? 'Soprano TTS service not available (sidecar not running or Python 3.10+ required)'
        : error.message;
      resolve({ success: false, error: errorMsg });
    });
  
    req.setTimeout(30000, () => {
      req.destroy();
      resolve({ success: false, error: 'Request timeout' });
    });
    
    req.write(postData);
    req.end();
  });
}

// Kokoro TTS handler (OpenAI-compatible API)
async function speakWithKokoro(text, voiceId, kokoroPort) {
  return new Promise((resolve) => {
    const postData = JSON.stringify({
      model: 'kokoro',
      voice: voiceId || 'af_sky',
      input: text
    });
    
    const options = {
      hostname: '127.0.0.1',
      port: kokoroPort,
      path: '/v1/audio/speech',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };
    
    const req = http.request(options, (res) => {
      if (res.statusCode === 200) {
        // Save audio to temp file and play it
        const tmpPath = path.join(os.tmpdir(), `heilion-kokoro-${Date.now()}.mp3`);
        const fileStream = fs.createWriteStream(tmpPath);
        
        res.pipe(fileStream);
        
        fileStream.on('finish', () => {
          fileStream.close(() => {
            // Play audio file (macOS)
            if (process.platform === 'darwin') {
              exec(`afplay "${tmpPath}"`, (error) => {
                if (error) {
                  resolve({ success: false, error: error.message });
                } else {
                  resolve({ success: true });
                }
                // Clean up temp file after a delay
                setTimeout(() => {
                  try { fs.unlinkSync(tmpPath); } catch {}
                }, 5000);
              });
            } else {
              // For Linux/Windows, would need different player
              resolve({ success: false, error: 'Audio playback not implemented for this platform' });
            }
          });
        });
        
        fileStream.on('error', (error) => {
          resolve({ success: false, error: error.message });
        });
      } else {
        resolve({ success: false, error: `HTTP ${res.statusCode} - Kokoro TTS service not available` });
      }
    });
    
    req.on('error', (error) => {
      // Connection refused means Kokoro sidecar isn't running
      const errorMsg = error.code === 'ECONNREFUSED' 
        ? 'Kokoro TTS service not available (service not running on port 8880)'
        : error.message;
      resolve({ success: false, error: errorMsg });
    });
  
    req.setTimeout(30000, () => {
      req.destroy();
      resolve({ success: false, error: 'Request timeout' });
    });
    
    req.write(postData);
    req.end();
  });
}

module.exports = {
  speakWithSoprano,
  speakWithKokoro
};
