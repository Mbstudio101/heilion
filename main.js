const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const WebSocket = require('ws');
const Database = require('better-sqlite3');

// Set app name immediately (must be before app.whenReady)
// This shows "Heilion" in macOS Dock and menu bar instead of "Electron"
if (process.platform === 'darwin') {
  app.setName('Heilion');
}

// Database initialization
let db = null;

function initDatabase() {
  const dbPath = path.join(app.getPath('userData'), 'heilion.db');
  db = new Database(dbPath);
  
  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS decks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      file_path TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE TABLE IF NOT EXISTS slides (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      deck_id INTEGER NOT NULL,
      slide_number INTEGER NOT NULL,
      title TEXT,
      content TEXT,
      notes TEXT,
      FOREIGN KEY (deck_id) REFERENCES decks(id) ON DELETE CASCADE
    );
    
    CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      deck_id INTEGER NOT NULL,
      slide_id INTEGER,
      question_text TEXT NOT NULL,
      correct_answer TEXT,
      points INTEGER DEFAULT 100,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (deck_id) REFERENCES decks(id) ON DELETE CASCADE,
      FOREIGN KEY (slide_id) REFERENCES slides(id) ON DELETE CASCADE
    );
    
    CREATE TABLE IF NOT EXISTS attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question_id INTEGER NOT NULL,
      user_answer TEXT,
      transcript TEXT,
      score INTEGER,
      feedback TEXT,
      polished_answer TEXT,
      follow_up_question TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
    );
    
    CREATE TABLE IF NOT EXISTS mastery (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      deck_id INTEGER NOT NULL,
      slide_id INTEGER,
      concept TEXT,
      mastery_level REAL DEFAULT 0.0,
      last_practiced DATETIME,
      FOREIGN KEY (deck_id) REFERENCES decks(id) ON DELETE CASCADE,
      FOREIGN KEY (slide_id) REFERENCES slides(id) ON DELETE CASCADE,
      UNIQUE(deck_id, slide_id, concept)
    );
  `);
  
  return db;
}

// Wake word sidecar management
let wakeWordProcess = null;
let wakeWordServer = null;
let wakeWordClients = new Set();

// Soprano TTS sidecar management
let sopranoProcess = null;
let sopranoPort = 8001;

function startWakeWordSidecar() {
  const sidecarPath = path.join(__dirname, 'wake-word-sidecar', 'wake_service.py');
  
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
        // Port is in use, which means service might already be running
        // Continue without creating new server
      } else {
        throw serverError;
      }
    }
    
    // Start Python sidecar process
    wakeWordProcess = spawn('python3', [sidecarPath], {
      cwd: path.join(__dirname, 'wake-word-sidecar')
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

function startSopranoSidecar() {
  const sidecarPath = path.join(__dirname, 'tts-sidecar', 'soprano_server.py');
  
  if (!fs.existsSync(sidecarPath)) {
    console.log('Soprano TTS sidecar not found, will use Web Speech API');
    return false;
  }
  
  try {
    sopranoProcess = spawn('python3', [sidecarPath], {
      cwd: path.join(__dirname, 'tts-sidecar'),
      env: { ...process.env, SOPRANO_PORT: sopranoPort.toString() }
    });
    
    sopranoProcess.stdout.on('data', (data) => {
      console.log(`Soprano TTS: ${data}`);
    });
    
    sopranoProcess.stderr.on('data', (data) => {
      console.error(`Soprano TTS error: ${data}`);
    });
    
    sopranoProcess.on('close', (code) => {
      console.log(`Soprano TTS sidecar exited with code ${code}`);
      sopranoProcess = null;
    });
    
    console.log(`Soprano TTS sidecar started on port ${sopranoPort}`);
    return true;
  } catch (error) {
    console.error('Failed to start Soprano TTS sidecar:', error);
    return false;
  }
}

function stopSopranoSidecar() {
  if (sopranoProcess) {
    sopranoProcess.kill();
    sopranoProcess = null;
  }
}

// Stream audio to wake word sidecar
ipcMain.on('stream-audio-to-wake', (event, audioData) => {
  wakeWordClients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(audioData);
    }
  });
});

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    backgroundColor: '#000000',
    frame: true, // Use native window frame
    titleBarStyle: 'default', // Use native title bar
    transparent: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  // Set window title (shows in title bar)
  mainWindow.setTitle('Heilion');

  // Set app icon (macOS Dock and menu bar)
  // Try .icns first (macOS native format), then .png
  let iconPath = null;
  if (process.platform === 'darwin') {
    const icnsPath = path.join(__dirname, 'build', 'icons', 'icon.icns');
    const pngPath = path.join(__dirname, 'build', 'icons', 'icon.png');
    iconPath = fs.existsSync(icnsPath) ? icnsPath : (fs.existsSync(pngPath) ? pngPath : null);
  } else {
    iconPath = path.join(__dirname, 'build', 'icons', 'icon.png');
  }
  
  if (iconPath && fs.existsSync(iconPath)) {
    if (process.platform === 'darwin') {
      // macOS: set Dock icon - this must use app.dock.setIcon(), not app.setIcon()
      app.dock?.setIcon(iconPath);
    }
    mainWindow.setIcon(iconPath);
  } else {
    console.warn(`Icon file not found: ${iconPath || 'build/icons/icon.png'}`);
  }

  const isDev = process.env.NODE_ENV !== 'production';
  
  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, 'build', 'index.html'));
  }

  // Emit window state changes to renderer
  mainWindow.on('maximize', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('window-maximized', true);
    }
  });

  mainWindow.on('unmaximize', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('window-maximized', false);
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  
  return mainWindow;
}

app.whenReady().then(() => {
  initDatabase();
  
  // Request microphone permission on startup (macOS)
  if (process.platform === 'darwin') {
    const { systemPreferences } = require('electron');
    const micStatus = systemPreferences.getMediaAccessStatus('microphone');
    if (micStatus !== 'granted') {
      systemPreferences.askForMediaAccess('microphone').then((granted) => {
        if (granted) {
          console.log('Microphone permission granted');
        } else {
          console.log('Microphone permission denied - wake word and recording will not work');
        }
      });
    }
  }
  
  const wakeWordAvailable = startWakeWordSidecar();
  const sopranoAvailable = startSopranoSidecar();
  
  const mainWindow = createWindow();
  
  // Expose wake word availability
  mainWindow.webContents.once('did-finish-load', () => {
    mainWindow.webContents.send('wake-word-status', { available: wakeWordAvailable });
  });
  
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else if (mainWindow) {
      mainWindow.show();
    }
  });
});

// Window control IPC handlers
ipcMain.handle('window-minimize', () => {
  const window = mainWindow || BrowserWindow.getFocusedWindow();
  if (window) {
    window.minimize();
  }
  return { success: !!window };
});

ipcMain.handle('window-maximize', () => {
  const window = mainWindow || BrowserWindow.getFocusedWindow();
  if (window) {
    if (window.isMaximized()) {
      window.unmaximize();
    } else {
      window.maximize();
    }
    return { success: true, maximized: window.isMaximized() };
  }
  return { success: false };
});

ipcMain.handle('window-close', () => {
  const window = mainWindow || BrowserWindow.getFocusedWindow();
  if (window) {
    window.close();
  }
  return { success: !!window };
});

ipcMain.handle('window-is-maximized', () => {
  const window = mainWindow || BrowserWindow.getFocusedWindow();
  return window ? window.isMaximized() : false;
});

app.on('window-all-closed', () => {
  stopWakeWordSidecar();
  stopSopranoSidecar();
  // On macOS, apps typically stay open even when all windows are closed
  if (process.platform !== 'darwin') {
    app.quit();
  }
  if (db) {
    db.close();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  stopWakeWordSidecar();
  stopSopranoSidecar();
  if (db) {
    db.close();
  }
});

// IPC handlers
ipcMain.handle('import-pptx', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'PowerPoint', extensions: ['pptx'] }]
  });
  
  if (result.canceled) {
    return { success: false };
  }
  
  const filePath = result.filePaths[0];
  
  // Read file as buffer in main process
  try {
    const fs = require('fs');
    const fileBuffer = fs.readFileSync(filePath);
    // Convert Node.js Buffer to Array that can be sent via IPC
    const fileData = Array.from(new Uint8Array(fileBuffer));
    
    return { success: true, filePath, fileData };
  } catch (error) {
    console.error('Failed to read file:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db-query', (event, query, params = []) => {
  try {
    if (query.trim().toUpperCase().startsWith('SELECT')) {
      const stmt = db.prepare(query);
      return { success: true, data: stmt.all(...params) };
    } else {
      const stmt = db.prepare(query);
      const result = stmt.run(...params);
      return { success: true, data: result };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('check-ollama', async (event, url = null) => {
  // Auto-detect Ollama by trying common URLs
  const urlsToTry = url 
    ? [url] 
    : [
        'http://localhost:11434',
        'http://127.0.0.1:11434',
        'http://localhost:8080',
        'http://127.0.0.1:8080'
      ];

  const http = require('http');
  
  for (const baseUrl of urlsToTry) {
    try {
      const result = await new Promise((resolve) => {
        const apiUrl = `${baseUrl}/api/tags`;
        const req = http.get(apiUrl, { timeout: 2000 }, (res) => {
          if (res.statusCode === 200) {
            // Try to get models list
            let body = '';
            res.on('data', (chunk) => { body += chunk; });
            res.on('end', () => {
              try {
                const data = JSON.parse(body);
                const models = data.models?.map(m => m.name) || [];
                resolve({ available: true, url: baseUrl, models });
              } catch {
                resolve({ available: true, url: baseUrl, models: [] });
              }
            });
          } else {
            resolve({ available: false });
          }
        });
        
        req.on('error', () => resolve({ available: false }));
        req.on('timeout', () => {
          req.destroy();
          resolve({ available: false });
        });
      });

      if (result.available) {
        return result;
      }
    } catch (error) {
      // Try next URL
      continue;
    }
  }

  return { available: false };
});

ipcMain.handle('check-whisper', async () => {
  const { exec } = require('child_process');
  return new Promise((resolve) => {
    exec('which whisper.cpp', (error) => {
      resolve({ available: !error });
    });
  });
});

ipcMain.handle('run-whisper', async (event, audioPath) => {
  const { exec } = require('child_process');
  return new Promise((resolve) => {
    // This is a placeholder - actual whisper.cpp command will depend on installation
    exec(`whisper.cpp -f "${audioPath}"`, (error, stdout, stderr) => {
      if (error) {
        resolve({ success: false, error: error.message });
      } else {
        resolve({ success: true, transcript: stdout });
      }
    });
  });
});

ipcMain.handle('tts-speak', async (event, text, provider = 'web-speech') => {
  // Web Speech API is handled in renderer process
  // This handler is for Soprano TTS (server-based)
  if (provider === 'soprano') {
    const http = require('http');
    const url = require('url');
    
    return new Promise((resolve) => {
      const postData = JSON.stringify({
        input: text,
        model: 'soprano'
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
          const os = require('os');
          const tmpPath = path.join(os.tmpdir(), `heilion-tts-${Date.now()}.wav`);
          const fileStream = require('fs').createWriteStream(tmpPath);
          
          res.pipe(fileStream);
          
          fileStream.on('finish', () => {
            fileStream.close(() => {
              // Play audio file
              const { exec } = require('child_process');
              if (process.platform === 'darwin') {
                exec(`afplay "${tmpPath}"`, (error) => {
                  resolve({ success: !error });
                  // Clean up temp file after a delay
                  setTimeout(() => {
                    try { require('fs').unlinkSync(tmpPath); } catch {}
                  }, 5000);
                });
              } else {
                // For Linux/Windows, would need different player
                resolve({ success: false, error: 'Audio playback not implemented for this platform' });
              }
            });
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
  } else {
    // Fallback to macOS say for backwards compatibility
    const { exec } = require('child_process');
    return new Promise((resolve) => {
      exec(`say "${text.replace(/"/g, '\\"')}"`, (error) => {
        resolve({ success: !error });
      });
    });
  }
});

ipcMain.handle('get-mic-permission', async () => {
  // On macOS, check and request microphone permission
  const { systemPreferences } = require('electron');
  if (process.platform === 'darwin') {
    const status = systemPreferences.getMediaAccessStatus('microphone');
    if (status !== 'granted') {
      // Request permission (shows system dialog)
      const granted = await systemPreferences.askForMediaAccess('microphone');
      return { granted };
    }
    return { granted: true };
  }
  return { granted: true };
});

// API Key storage (keytar)
ipcMain.handle('save-api-key', async (event, provider, key) => {
  try {
    const keytar = require('keytar');
    const serviceName = 'Heilion';
    await keytar.setPassword(serviceName, provider, key);
    return { success: true };
  } catch (error) {
    console.error('Failed to save API key:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-api-key', async (event, provider) => {
  try {
    const keytar = require('keytar');
    const serviceName = 'Heilion';
    const key = await keytar.getPassword(serviceName, provider);
    return { success: true, key: key || null };
  } catch (error) {
    console.error('Failed to get API key:', error);
    return { success: false, error: error.message, key: null };
  }
});

// Audio recording (save to temp file)
let currentRecordingPath = null;

ipcMain.handle('start-audio-recording', async () => {
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  
  const tempDir = os.tmpdir();
  currentRecordingPath = path.join(tempDir, `heilion_recording_${Date.now()}.wav`);
  
  // In a real implementation, you'd start recording here
  // For now, return the path where the file will be saved
  return { success: true, filePath: currentRecordingPath };
});

ipcMain.handle('stop-audio-recording', async () => {
  // Stop recording and return file path
  const path = currentRecordingPath;
  currentRecordingPath = null;
  return { success: true, filePath: path };
});

// Save audio blob from renderer process to temp file
ipcMain.handle('save-audio-blob', async (event, arrayBuffer) => {
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  
  try {
    const tempDir = os.tmpdir();
    const filePath = path.join(tempDir, `heilion_recording_${Date.now()}.wav`);
    
    // Write array buffer to file
    fs.writeFileSync(filePath, Buffer.from(arrayBuffer));
    
    return { success: true, filePath };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-audio-file-path', () => {
  return { success: true, filePath: currentRecordingPath };
});
