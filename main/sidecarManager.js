// Sidecar Manager - Handles wake word and TTS sidecar processes
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const WebSocket = require('ws');

let wakeWordProcess = null;

let sopranoProcess = null;
const sopranoPort = 8001;

let kokoroProcess = null;
const kokoroPort = 8880;

let hubertLlamaProcess = null;
let hubertLlamaWebSocket = null;
const hubertLlamaPort = 8766;

// Wake Word Sidecar
function startWakeWordSidecar() {
  const sidecarPath = path.join(__dirname, '..', 'wake-word-sidecar', 'wake_service.py');
  
  if (!fs.existsSync(sidecarPath)) {
    console.log('Wake word sidecar not found, will use push-to-talk mode');
    return false;
  }
  
  // Kill existing process if it exists
  if (wakeWordProcess) {
    try {
      wakeWordProcess.kill();
      wakeWordProcess = null;
    } catch (e) {
      // Ignore errors when killing
    }
  }
  
  try {
    // Start Python sidecar process (it will create its own WebSocket server on port 8765)
    wakeWordProcess = spawn('python3', [sidecarPath], {
      cwd: path.join(__dirname, '..', 'wake-word-sidecar')
    });
    
    wakeWordProcess.stdout.on('data', (data) => {
      console.log(`Wake sidecar: ${data}`);
    });
    
    wakeWordProcess.stderr.on('data', (data) => {
      console.error(`Wake sidecar error: ${data}`);
    });
    
    wakeWordProcess.on('close', (code) => {
      console.log(`Wake sidecar exited with code ${code}`);
      wakeWordProcess = null;
    });
    
    return true;
  } catch (error) {
    console.error('Failed to start wake word sidecar:', error);
    return false;
  }
}

function stopWakeWordSidecar() {
  if (wakeWordProcess) {
    try {
      wakeWordProcess.kill();
    } catch (e) {
      // Ignore errors
    }
    wakeWordProcess = null;
  }
}

// Audio streaming is handled directly by the Python wake word service via PyAudio
// No need for streamAudioToWake - the Python service captures audio directly
function streamAudioToWake(audioData) {
  // No-op: Python service handles audio capture directly via PyAudio
}

// Soprano TTS Sidecar
// Tries two implementations:
// 1. soprano_transformers.py - Uses Transformers directly (simpler, recommended)
// 2. soprano_server.py - Uses soprano-tts package (full-featured)
function startSopranoSidecar() {
  // Try Transformers implementation first (simpler, no need for full soprano-tts package)
  const transformersPath = path.join(__dirname, '..', 'tts-sidecar', 'soprano_transformers.py');
  const packagePath = path.join(__dirname, '..', 'tts-sidecar', 'soprano_server.py');
  
  // Prefer Transformers implementation if it exists
  const sidecarPath = fs.existsSync(transformersPath) ? transformersPath : packagePath;

  if (!fs.existsSync(sidecarPath)) {
    console.warn('⚠ Soprano TTS sidecar script not found, will use Web Speech API fallback');
    return false;
  }

  try {
    console.log('🔄 Starting Soprano TTS sidecar...');
    sopranoProcess = spawn('python3', [sidecarPath], {
      cwd: path.join(__dirname, '..', 'tts-sidecar'),
      env: { ...process.env, SOPRANO_PORT: sopranoPort.toString() }
    });

    let startupTimeout = setTimeout(() => {
      console.warn('⚠ Soprano TTS sidecar startup timeout - will use Web Speech API fallback');
      if (sopranoProcess) {
        sopranoProcess.kill();
        sopranoProcess = null;
      }
    }, 10000); // 10 second timeout

    sopranoProcess.stdout.on('data', (data) => {
      const output = data.toString().trim();
      if (output.includes('Uvicorn running on') || output.includes('Application startup complete')) {
        console.log('✓ Soprano TTS sidecar started successfully');
        clearTimeout(startupTimeout);
      } else {
        console.log(`Soprano TTS: ${output}`);
      }
    });

    sopranoProcess.stderr.on('data', (data) => {
      const error = data.toString().trim();
      // Ignore port already in use errors (service might already be running)
      if (error.includes('address already in use')) {
        console.log('✓ Soprano TTS is already running on port', sopranoPort);
        clearTimeout(startupTimeout);
        return;
      }
      console.error(`Soprano TTS error: ${error}`);
      // If it contains "Error: Soprano TTS not found", don't treat as fatal
      if (error.includes('Soprano TTS not found') || error.includes('ModuleNotFoundError')) {
        console.warn('⚠ Soprano TTS package not available - using Web Speech API fallback');
        clearTimeout(startupTimeout);
      }
    });

    sopranoProcess.on('close', (code) => {
      console.log(`Soprano TTS sidecar exited with code ${code}`);
      sopranoProcess = null;
      clearTimeout(startupTimeout);
    });

    return true;
  } catch (error) {
    console.error('Failed to start Soprano TTS sidecar:', error);
    return false;
  }
}

function stopSopranoSidecar() {
  if (sopranoProcess) {
    try {
      sopranoProcess.kill();
    } catch (e) {
      // Ignore errors
    }
    sopranoProcess = null;
  }
}

function getSopranoPort() {
  return sopranoPort;
}

// Kokoro TTS Sidecar
function startKokoroSidecar() {
  // Check if Kokoro is available via Docker or local installation
  // For now, we'll check if Docker is available and if Kokoro container is running
  // Or check for local installation in kokoro-sidecar directory
  
  const kokoroSidecarPath = path.join(__dirname, '..', 'kokoro-sidecar');
  
  // Try to detect if Kokoro is running via Docker on port 8880
  // Or if there's a local installation script
  const dockerCheckPath = path.join(kokoroSidecarPath, 'docker-compose.yml');
  const localScriptPath = path.join(kokoroSidecarPath, 'start.sh');
  
  // For now, just check if port 8880 is responding (Kokoro might already be running)
  // In a full implementation, we'd start Docker or a local Python server
  console.log('🔄 Checking Kokoro TTS availability on port', kokoroPort);
  
  // Try to connect to check if it's already running
  const http = require('http');
  return new Promise((resolve) => {
    const testReq = http.get(`http://127.0.0.1:${kokoroPort}/health`, { timeout: 2000 }, (res) => {
      if (res.statusCode === 200 || res.statusCode === 404) {
        // Service is responding (404 is ok, means server is up)
        console.log('✓ Kokoro TTS is already running');
        resolve(true);
      } else {
        resolve(false);
      }
    });
    
    testReq.on('error', () => {
      // Service not running - would need to start it
      // For now, return false (user needs to start Kokoro manually or via Docker)
      console.log('⚠ Kokoro TTS not detected - please start Kokoro service manually');
      console.log('  Docker: docker run -d -p 8880:8880 remsky/kokoro-fastapi');
      console.log('  Or install locally and run start script');
      resolve(false);
    });
    
    testReq.on('timeout', () => {
      testReq.destroy();
      resolve(false);
    });
  }).then(available => {
    // If not available, we could try to start it here in the future
    // For now, just return the availability status
    return available;
  }).catch(() => {
    return false;
  });
}

function stopKokoroSidecar() {
  // If we started a process, kill it here
  if (kokoroProcess) {
    try {
      kokoroProcess.kill();
    } catch (e) {
      // Ignore errors
    }
    kokoroProcess = null;
  }
}

function getKokoroPort() {
  return kokoroPort;
}

// HuBERT + Llama 3 Sidecar
function startHubertLlamaSidecar() {
  const sidecarPath = path.join(__dirname, '..', 'hubert-llama-sidecar', 'hubert_llama_service.py');
  
  if (!fs.existsSync(sidecarPath)) {
    console.log('HuBERT + Llama 3 sidecar not found');
    return false;
  }
  
  // Kill existing process if it exists
  if (hubertLlamaProcess) {
    try {
      hubertLlamaProcess.kill();
      hubertLlamaProcess = null;
    } catch (e) {
      // Ignore errors
    }
  }
  
  // Close existing WebSocket connection
  if (hubertLlamaWebSocket) {
    try {
      hubertLlamaWebSocket.close();
      hubertLlamaWebSocket = null;
    } catch (e) {
      // Ignore errors
    }
  }
  
  try {
    // Start Python sidecar process
    hubertLlamaProcess = spawn('python3', [sidecarPath, hubertLlamaPort.toString()], {
      cwd: path.join(__dirname, '..', 'hubert-llama-sidecar'),
      env: {
        ...process.env,
        PYTHONUNBUFFERED: '1'
      }
    });
    
    hubertLlamaProcess.stdout.on('data', (data) => {
      console.log(`HuBERT+Llama sidecar: ${data}`);
    });
    
    hubertLlamaProcess.stderr.on('data', (data) => {
      console.error(`HuBERT+Llama sidecar error: ${data}`);
    });
    
    hubertLlamaProcess.on('close', (code) => {
      console.log(`HuBERT+Llama sidecar exited with code ${code}`);
      hubertLlamaProcess = null;
      hubertLlamaWebSocket = null;
    });
    
    // Connect to WebSocket after a short delay
    setTimeout(() => {
      connectHubertLlamaWebSocket();
    }, 2000);
    
    return true;
  } catch (error) {
    console.error('Failed to start HuBERT + Llama 3 sidecar:', error);
    return false;
  }
}

function connectHubertLlamaWebSocket() {
  if (hubertLlamaWebSocket && hubertLlamaWebSocket.readyState === WebSocket.OPEN) {
    return;
  }
  
  try {
    hubertLlamaWebSocket = new WebSocket(`ws://localhost:${hubertLlamaPort}`);
    
    hubertLlamaWebSocket.on('open', () => {
      console.log('Connected to HuBERT + Llama 3 service');
      // Request models to be loaded
      hubertLlamaWebSocket.send(JSON.stringify({ type: 'load_models' }));
    });
    
    hubertLlamaWebSocket.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        console.log('HuBERT+Llama message:', message.type);
      } catch (e) {
        // Ignore parse errors
      }
    });
    
    hubertLlamaWebSocket.on('error', (error) => {
      console.error('HuBERT+Llama WebSocket error:', error);
    });
    
    hubertLlamaWebSocket.on('close', () => {
      console.log('Disconnected from HuBERT + Llama 3 service');
      hubertLlamaWebSocket = null;
      // Try to reconnect after delay
      setTimeout(connectHubertLlamaWebSocket, 5000);
    });
  } catch (error) {
    console.error('Failed to connect to HuBERT + Llama 3 service:', error);
  }
}

function stopHubertLlamaSidecar() {
  if (hubertLlamaWebSocket) {
    try {
      hubertLlamaWebSocket.close();
      hubertLlamaWebSocket = null;
    } catch (e) {
      // Ignore errors
    }
  }
  
  if (hubertLlamaProcess) {
    try {
      hubertLlamaProcess.kill();
      hubertLlamaProcess = null;
    } catch (e) {
      // Ignore errors
    }
  }
}

async function transcribeWithHubertLlama(audioPath, context = '') {
  return new Promise((resolve, reject) => {
    if (!hubertLlamaWebSocket || hubertLlamaWebSocket.readyState !== WebSocket.OPEN) {
      // Try to connect
      connectHubertLlamaWebSocket();
      setTimeout(() => {
        if (!hubertLlamaWebSocket || hubertLlamaWebSocket.readyState !== WebSocket.OPEN) {
          resolve({
            success: false,
            error: 'HuBERT + Llama 3 service not available'
          });
          return;
        }
        sendTranscribeRequest(audioPath, context, resolve, reject);
      }, 1000);
    } else {
      sendTranscribeRequest(audioPath, context, resolve, reject);
    }
  });
}

function sendTranscribeRequest(audioPath, context, resolve, reject) {
  const messageHandler = (data) => {
    try {
      const response = JSON.parse(data.toString());
      if (response.type === 'result' || response.type === 'error') {
        hubertLlamaWebSocket.removeListener('message', messageHandler);
        if (response.type === 'error') {
          resolve({
            success: false,
            error: response.error
          });
        } else {
          resolve(response);
        }
      }
    } catch (e) {
      // Ignore parse errors
    }
  };
  
  hubertLlamaWebSocket.on('message', messageHandler);
  
  // Send transcribe request
  hubertLlamaWebSocket.send(JSON.stringify({
    type: 'transcribe',
    audio_path: audioPath,
    context: context
  }));
  
  // Timeout after 60 seconds
  setTimeout(() => {
    hubertLlamaWebSocket.removeListener('message', messageHandler);
    resolve({
      success: false,
      error: 'HuBERT + Llama 3 transcription timeout'
    });
  }, 60000);
}

async function checkHubertLlamaAvailable() {
  // Check if service is running
  return new Promise((resolve) => {
    if (hubertLlamaWebSocket && hubertLlamaWebSocket.readyState === WebSocket.OPEN) {
      resolve({ available: true, connected: true });
      return;
    }
    
    // Try to connect to check
    const testWs = new WebSocket(`ws://localhost:${hubertLlamaPort}`);
    
    testWs.on('open', () => {
      testWs.close();
      resolve({ available: true, connected: false });
    });
    
    testWs.on('error', () => {
      resolve({ available: false, connected: false });
    });
    
    setTimeout(() => {
      resolve({ available: false, connected: false });
    }, 2000);
  });
}

module.exports = {
  startWakeWordSidecar,
  stopWakeWordSidecar,
  streamAudioToWake,
  startSopranoSidecar,
  stopSopranoSidecar,
  getSopranoPort,
  startKokoroSidecar,
  stopKokoroSidecar,
  getKokoroPort,
  startHubertLlamaSidecar,
  stopHubertLlamaSidecar,
  transcribeWithHubertLlama,
  checkHubertLlamaAvailable
};
