// Sidecar Manager - Handles wake word and TTS sidecar processes
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const WebSocket = require('ws');

let wakeWordProcess = null;
let wakeWordServer = null;
let wakeWordClients = new Set();

let sopranoProcess = null;
const sopranoPort = 8001;

let kokoroProcess = null;
const kokoroPort = 8880;

// Wake Word Sidecar
function startWakeWordSidecar() {
  const sidecarPath = path.join(__dirname, '..', 'wake-word-sidecar', 'wake_service.py');
  
  if (!fs.existsSync(sidecarPath)) {
    console.log('Wake word sidecar not found, will use push-to-talk mode');
    return false;
  }
  
  // Close existing server if it exists
  if (wakeWordServer) {
    try {
      wakeWordServer.close();
      wakeWordServer = null;
    } catch (e) {
      // Ignore errors when closing
    }
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
    // Start WebSocket server first (check if port is available)
    try {
      wakeWordServer = new WebSocket.Server({ port: 8765 });
      wakeWordServer.on('connection', (ws) => {
        wakeWordClients.add(ws);
        ws.on('close', () => {
          wakeWordClients.delete(ws);
        });
      });
      wakeWordServer.on('error', (error) => {
        if (error.code === 'EADDRINUSE') {
          console.log('Port 8765 already in use - wake word service may already be running');
          wakeWordServer = null;
        } else {
          console.error('Wake word WebSocket server error:', error);
        }
      });
      console.log('Wake word WebSocket server started on port 8765');
    } catch (serverError) {
      if (serverError.code === 'EADDRINUSE') {
        console.log('Port 8765 already in use - reusing existing server');
      } else {
        throw serverError;
      }
    }
    
    // Start Python sidecar process
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
    if (wakeWordServer) {
      try {
        wakeWordServer.close();
        wakeWordServer = null;
      } catch (e) {
        // Ignore errors
      }
    }
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
  if (wakeWordServer) {
    try {
      wakeWordServer.close(() => {
        wakeWordServer = null;
      });
    } catch (e) {
      wakeWordServer = null;
    }
  }
  wakeWordClients.clear();
}

function streamAudioToWake(audioData) {
  wakeWordClients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(audioData);
    }
  });
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
      if (output.includes('Uvicorn running on')) {
        console.log('✓ Soprano TTS sidecar started successfully');
        clearTimeout(startupTimeout);
      } else {
        console.log(`Soprano TTS: ${output}`);
      }
    });

    sopranoProcess.stderr.on('data', (data) => {
      const error = data.toString().trim();
      console.error(`Soprano TTS error: ${error}`);
      // If it contains "Error: Soprano TTS not found", don't treat as fatal
      if (error.includes('Soprano TTS not found')) {
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

module.exports = {
  startWakeWordSidecar,
  stopWakeWordSidecar,
  streamAudioToWake,
  startSopranoSidecar,
  stopSopranoSidecar,
  getSopranoPort,
  startKokoroSidecar,
  stopKokoroSidecar,
  getKokoroPort
};
