// Set app name FIRST - before ANY requires or other code
// This MUST be done before Electron initializes to show "Heilion" in macOS Dock
const { app } = require('electron');
app.setName('Heilion');

// Now load the rest of Electron modules and other dependencies
const { BrowserWindow, ipcMain, dialog, systemPreferences } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');

// On macOS, also set the about panel info
if (process.platform === 'darwin') {
  app.setAboutPanelOptions({
    applicationName: 'Heilion',
    applicationVersion: app.getVersion(),
    copyright: '© 2026 Heilion'
  });
}

// Import separate modules
const { initDatabase, queryDatabase, closeDatabase } = require('./main/dbManager');
const { 
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
} = require('./main/sidecarManager');
const { 
  checkWhisperAvailable, 
  runWhisperTranscription 
} = require('./main/whisperHandler');
const { speakWithSoprano, speakWithKokoro } = require('./main/ttsHandler');
const { checkFFmpegAvailable, convertToWhisperWAV } = require('./main/audioConverter');
const { 
  setMainWindow,
  checkForUpdates,
  downloadUpdate,
  quitAndInstall,
  startPeriodicUpdateCheck,
  stopPeriodicUpdateCheck,
  getCurrentVersion
} = require('./main/updateManager');

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    backgroundColor: '#000000',
    frame: false, // Use frameless window - this removes ALL native chrome including traffic lights
    transparent: false,
    webPreferences: {
      // In production, if running from build/electron.js, preload.js is in same directory
      // Otherwise, it's at ./preload.js (same directory as main.js)
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      // Disable web security warnings in dev mode (not recommended for production)
      webSecurity: true
    }
  });

  // Set window title (shows in title bar)
  mainWindow.setTitle('Heilion');

  // Set app icon (macOS Dock and menu bar)
  // Try .icns first (macOS native format), then .svg, then .png
  let iconPath = null;
  if (process.platform === 'darwin') {
    const icnsPath = path.join(__dirname, 'build', 'icons', 'icon.icns');
    const svgPath = path.join(__dirname, 'build', 'icons', 'icon.svg');
    const pngPath = path.join(__dirname, 'build', 'icons', 'icon.png');
    
    // Check which icon file exists (prioritize SVG)
    if (fs.existsSync(svgPath)) {
      iconPath = svgPath;
    } else if (fs.existsSync(icnsPath)) {
      iconPath = icnsPath;
    } else if (fs.existsSync(pngPath)) {
      iconPath = pngPath;
    }
    
    // Set Dock icon (macOS only) - must be called before window creation
    if (iconPath && app.dock) {
      try {
        app.dock.setIcon(iconPath);
        console.log(`✓ Dock icon set to: ${iconPath}`);
      } catch (error) {
        console.error(`Failed to set Dock icon: ${error.message}`);
      }
    } else if (!iconPath) {
      console.warn(`⚠ Icon file not found at: ${svgPath}, ${icnsPath}, or ${pngPath}`);
    }
  } else {
    const svgPath = path.join(__dirname, 'build', 'icons', 'icon.svg');
    iconPath = fs.existsSync(svgPath) ? svgPath : path.join(__dirname, 'build', 'icons', 'icon.png');
  }
  
  // Set window icon (for all platforms)
  if (iconPath && fs.existsSync(iconPath)) {
    try {
      mainWindow.setIcon(iconPath);
      console.log(`✓ Window icon set to: ${iconPath}`);
    } catch (error) {
      console.error(`Failed to set window icon: ${error.message}`);
    }
  } else {
    console.warn(`⚠ Icon file not found: ${iconPath || '/Users/marvens/Desktop/Heilion/build/icons/icon.svg'}`);
  }

  const isDev = process.env.NODE_ENV !== 'production';
  
  // Wait for React dev server to be ready
  if (isDev) {
    mainWindow.loadURL('http://localhost:3000').catch((error) => {
      console.error('Failed to load React app:', error);
      // Retry after a short delay
      setTimeout(() => {
        mainWindow.loadURL('http://localhost:3000').catch((err) => {
          console.error('Retry failed:', err);
        });
      }, 2000);
    });
    
    // Open dev tools after page loads
    mainWindow.webContents.once('did-finish-load', () => {
      mainWindow.webContents.openDevTools();
    });
  } else {
    // In production, check if we're running from build/electron.js (packaged) or main.js (dev build)
    // When packaged, electron.js is at app.asar/build/electron.js and index.html is at app.asar/build/index.html
    // Try multiple possible paths
    const possiblePaths = [
      path.join(__dirname, 'index.html'),           // If in build/ directory
      path.join(__dirname, 'build', 'index.html'),  // If in root directory
      path.join(process.resourcesPath, 'app', 'build', 'index.html'), // Absolute path in asar
    ];
    
    console.log('Production mode - __dirname:', __dirname);
    console.log('Trying to load HTML from:', possiblePaths[0]);
    
    let loaded = false;
    for (const htmlPath of possiblePaths) {
      try {
        if (fs.existsSync(htmlPath)) {
          console.log('Found index.html at:', htmlPath);
          // Use loadURL with file:// protocol for better compatibility with asar
          const fileUrl = htmlPath.startsWith('/') 
            ? `file://${htmlPath}` 
            : `file://${path.resolve(htmlPath)}`;
          console.log('Loading URL:', fileUrl);
          mainWindow.loadURL(fileUrl).catch((error) => {
            console.error('Failed to load from', htmlPath, ':', error);
            // Fallback to loadFile
            mainWindow.loadFile(htmlPath).catch((err) => {
              console.error('loadFile also failed:', err);
            });
          });
          loaded = true;
          break;
        }
      } catch (err) {
        console.error('Error checking path', htmlPath, ':', err);
      }
    }
    
    if (!loaded) {
      console.error('Could not find index.html in any of these paths:', possiblePaths);
      // Open dev tools to see errors
      mainWindow.webContents.openDevTools();
    } else {
      // Open dev tools in production for debugging (remove this in final release)
      mainWindow.webContents.once('did-finish-load', () => {
        mainWindow.webContents.openDevTools();
        // Log any failed resource loads
        mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
          console.error('Failed to load resource:', validatedURL, errorCode, errorDescription);
        });
      });
    }
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

app.whenReady().then(async () => {
  // App name is already set at the top of the file
  // This ensures it's set before any windows are created

  try {
    initDatabase();
    console.log('✓ Database initialized');
  } catch (error) {
    console.error('✗ Database initialization failed:', error);
  }

  // Request microphone permission on startup (macOS)
  if (process.platform === 'darwin') {
    try {
      const micStatus = systemPreferences.getMediaAccessStatus('microphone');
      if (micStatus !== 'granted') {
        systemPreferences.askForMediaAccess('microphone').then((granted) => {
          if (granted) {
            console.log('✓ Microphone permission granted');
          } else {
            console.warn('⚠ Microphone permission denied - wake word and recording will not work');
          }
        });
      } else {
        console.log('✓ Microphone permission already granted');
      }
    } catch (error) {
      console.error('✗ Microphone permission check failed:', error);
    }
  }

  // Start sidecars (don't let failures crash the app)
  let wakeWordAvailable = false;
  let sopranoAvailable = false;
  let kokoroAvailable = false;

  try {
    wakeWordAvailable = startWakeWordSidecar();
  } catch (error) {
    console.error('✗ Wake word sidecar startup failed:', error);
  }

  try {
    sopranoAvailable = startSopranoSidecar();
  } catch (error) {
    console.error('✗ Soprano TTS sidecar startup failed:', error);
  }

  try {
    kokoroAvailable = await startKokoroSidecar();
  } catch (error) {
    console.error('✗ Kokoro TTS sidecar check failed:', error);
  }

  // Start HuBERT + Llama 3 sidecar (optional, only if configured)
  let hubertLlamaAvailable = false;
  try {
    // Only start if user has explicitly enabled it (check settings or environment)
    // For now, we'll make it opt-in via settings
    hubertLlamaAvailable = false; // Will be enabled when user configures it
    // hubertLlamaAvailable = startHubertLlamaSidecar();
  } catch (error) {
    console.error('✗ HuBERT + Llama 3 sidecar startup failed:', error);
  }

  // Create main window regardless of sidecar status
  let mainWindow;
  try {
    mainWindow = createWindow();
    console.log('✓ Main window created');
    
    // Set main window for update manager
    setMainWindow(mainWindow);
    
    // Start periodic update checks (check on startup, then every 24 hours)
    if (app.isPackaged) {
      startPeriodicUpdateCheck(24);
    }
  } catch (error) {
    console.error('✗ Failed to create main window:', error);
    app.quit();
    return;
  }

  // Expose sidecar availability to renderer
  mainWindow.webContents.once('did-finish-load', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('wake-word-status', { available: wakeWordAvailable });
      mainWindow.webContents.send('soprano-status', { available: sopranoAvailable });
      mainWindow.webContents.send('kokoro-status', { available: kokoroAvailable });
      console.log('✓ App fully loaded');
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
    } else {
      // Window was destroyed, create a new one
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  stopWakeWordSidecar();
  stopSopranoSidecar();
  stopKokoroSidecar();
  closeDatabase();
  // On macOS, apps typically stay open even when all windows are closed
  // unless the user explicitly quits (Cmd+Q)
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  stopWakeWordSidecar();
  stopSopranoSidecar();
  stopKokoroSidecar();
  stopPeriodicUpdateCheck();
  closeDatabase();
});

// Stream audio to wake word sidecar
ipcMain.on('stream-audio-to-wake', (event, audioData) => {
  streamAudioToWake(audioData);
});

// IPC Handlers

// Database queries
ipcMain.handle('db-query', (event, query, params = []) => {
  return queryDatabase(query, params);
});

// Shared course import logic
async function importCourseFromPath(sourcePath) {
  const { parsePPTXFromPath } = require('./main/pptxParserMain');
  
  try {
    // 1. Extract filename
    const fileName = path.basename(sourcePath, '.pptx') || 'Imported Course';
    
    // 2. Create course record first (get courseId)
    // Try courses table first, fallback to decks for compatibility
    let courseResult = queryDatabase(
      'INSERT INTO courses (name, file_path) VALUES (?, ?)',
      [fileName, sourcePath]
    );
    
    let usedDecksTable = false;
    // Fallback to decks table if courses insert failed
    if (!courseResult.success) {
      courseResult = queryDatabase(
        'INSERT INTO decks (name, file_path) VALUES (?, ?)',
        [fileName, sourcePath]
      );
      usedDecksTable = courseResult.success;
    }
    
    if (!courseResult.success) {
      return { success: false, error: `Failed to create course record: ${courseResult.error}` };
    }
    
    const courseId = courseResult.data?.lastInsertRowid;
    if (!courseId) {
      return { success: false, error: 'Failed to get course ID from database' };
    }
    
    // 3. Copy PPTX to app storage
    const appDataPath = app.getPath('userData');
    const coursesDir = path.join(appDataPath, 'Courses', courseId.toString());
    
    if (!fs.existsSync(coursesDir)) {
      fs.mkdirSync(coursesDir, { recursive: true });
    }
    
    const storedPath = path.join(coursesDir, 'source.pptx');
    fs.copyFileSync(sourcePath, storedPath);
    
    // Update DB with stored path (try courses first, fallback to decks)
    let updateResult = queryDatabase(
      'UPDATE courses SET file_path = ? WHERE id = ?',
      [storedPath, courseId]
    );
    if (!updateResult.success) {
      updateResult = queryDatabase(
        'UPDATE decks SET file_path = ? WHERE id = ?',
        [storedPath, courseId]
      );
    }
    
    // 4. Parse PPTX from disk (in main process)
    const parseResult = await parsePPTXFromPath(storedPath);
    
    if (!parseResult.success) {
      return { success: false, error: parseResult.error };
    }
    
    const slides = parseResult.slides;
    
    // 5. Save slides to database (FTS triggers will auto-populate)
    for (const slide of slides) {
      let slideResult;
      
      if (usedDecksTable) {
        // Course was created in decks table, so use deck_id
        slideResult = queryDatabase(
          'INSERT INTO slides (deck_id, slide_number, title, content, notes) VALUES (?, ?, ?, ?, ?)',
          [courseId, slide.slideNumber, slide.title, slide.content, slide.notes]
        );
      } else {
        // Course was created in courses table, try both for compatibility
        slideResult = queryDatabase(
          'INSERT INTO slides (course_id, deck_id, slide_number, title, content, notes) VALUES (?, ?, ?, ?, ?, ?)',
          [courseId, courseId, slide.slideNumber, slide.title, slide.content, slide.notes]
        );
        
        if (!slideResult.success) {
          slideResult = queryDatabase(
            'INSERT INTO slides (course_id, slide_number, title, content, notes) VALUES (?, ?, ?, ?, ?)',
            [courseId, slide.slideNumber, slide.title, slide.content, slide.notes]
          );
        }
      }
    }
    
    // 6. FTS index is automatically built by triggers
    
    // Return metadata only (no large file data)
    return {
      success: true,
      courseId,
      storedPath,
      slideCount: slides.length
    };
  } catch (error) {
    console.error('Course import failed:', error);
    return { success: false, error: error.message };
  }
}

// PATCH 1: New course import handler - parses in main process, no large IPC transfer
ipcMain.handle('course:importPptxFromPath', async (event, sourcePath) => {
  return await importCourseFromPath(sourcePath);
});

// File operations - Legacy handler (for compatibility, redirects to new handler)
ipcMain.handle('import-pptx', async (event) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'PowerPoint Presentations', extensions: ['pptx'] }]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { success: false, error: 'File selection cancelled' };
  }

  const filePath = result.filePaths[0];
  // Use shared import logic
  return await importCourseFromPath(filePath);
});

// PATCH 4: Slide retrieval handler
ipcMain.handle('course:searchRelevantSlides', async (event, courseId, query, limit = 5) => {
  const { searchRelevantSlides, buildSlideContext } = require('./main/retrieval');
  
  try {
    const slides = searchRelevantSlides(courseId, query, limit);
    const context = buildSlideContext(courseId, query, limit);
    
    return {
      success: true,
      slides,
      context
    };
  } catch (error) {
    console.error('Slide retrieval failed:', error);
    return { success: false, error: error.message, slides: [], context: '' };
  }
});

// Copy PPTX file to app storage (Courses directory)
ipcMain.handle('copy-pptx-to-storage', async (event, sourcePath, courseId) => {
  try {
    const appDataPath = app.getPath('userData');
    const coursesDir = path.join(appDataPath, 'Courses', courseId.toString());
    
    // Create Courses/<courseId> directory if it doesn't exist
    if (!fs.existsSync(coursesDir)) {
      fs.mkdirSync(coursesDir, { recursive: true });
    }
    
    const destPath = path.join(coursesDir, 'source.pptx');
    
    // Copy file
    fs.copyFileSync(sourcePath, destPath);
    
    return { success: true, destinationPath: destPath };
  } catch (error) {
    console.error('Failed to copy PPTX to storage:', error);
    return { success: false, error: error.message };
  }
});

// Provider checks
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
  return await checkWhisperAvailable();
});

ipcMain.handle('run-whisper', async (event, audioPath, modelName = null) => {
  // Use the whisper handler module which gracefully handles missing whisper.cpp
  // modelName can be 'base.en', 'small.en', 'tiny.en', 'medium.en', etc.
  return await runWhisperTranscription(audioPath, modelName);
});

// HuBERT + Llama 3 transcription (Custom multimodal speech understanding)
ipcMain.handle('transcribe-with-hubert-llama', async (event, audioPath, context = '') => {
  try {
    const result = await transcribeWithHubertLlama(audioPath, context);
    return result;
  } catch (error) {
    console.error('HuBERT + Llama 3 transcription error:', error);
    return {
      success: false,
      error: error.message || 'HuBERT + Llama 3 transcription failed'
    };
  }
});

ipcMain.handle('check-hubert-llama', async () => {
  return await checkHubertLlamaAvailable();
});

// OpenAI Whisper API transcription (Robust Speech Recognition via Large-Scale Weak Supervision)
ipcMain.handle('transcribe-with-openai', async (event, audioPath, apiKey) => {
  const axios = require('axios');
  const FormData = require('form-data');
  
  try {
    // Read audio file
    const audioData = fs.readFileSync(audioPath);
    
    // Create form data for OpenAI Whisper API
    const form = new FormData();
    form.append('file', audioData, {
      filename: path.basename(audioPath),
      contentType: 'audio/wav' // or detect from extension
    });
    form.append('model', 'whisper-1'); // OpenAI Whisper model
    form.append('language', 'en'); // Optional: specify language for better accuracy
    
    // Call OpenAI Whisper API
    const response = await axios.post('https://api.openai.com/v1/audio/transcriptions', form, {
      headers: {
        ...form.getHeaders(),
        'Authorization': `Bearer ${apiKey}`
      },
      timeout: 30000 // 30 second timeout
    });
    
    if (response.data && response.data.text) {
      return { success: true, transcript: response.data.text.trim() };
    } else {
      return { success: false, error: 'OpenAI API returned empty response' };
    }
  } catch (error) {
    console.error('OpenAI Whisper API error:', error);
    
    if (error.response) {
      // API error response
      const errorMessage = error.response.data?.error?.message || error.response.statusText;
      return { 
        success: false, 
        error: `OpenAI API error: ${errorMessage}`,
        statusCode: error.response.status
      };
    } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      return { 
        success: false, 
        error: 'Cannot connect to OpenAI API. Please check your internet connection.' 
      };
    } else {
      return { 
        success: false, 
        error: error.message || 'OpenAI Whisper API transcription failed' 
      };
    }
  }
});

// TTS operations
ipcMain.handle('tts-speak', async (event, text, ttsSettings = {}) => {
  // Handle different provider types
  const provider = typeof ttsSettings === 'string' ? ttsSettings : ttsSettings.provider || 'soprano_local';
  const voiceId = ttsSettings.voiceId || 'soprano-1.1-80m';
  const presetId = ttsSettings.presetId || 'balanced';
  
  // Soprano TTS (local sidecar)
  if (provider === 'soprano' || provider === 'soprano_local') {
    const sopranoPort = getSopranoPort();
    return await speakWithSoprano(text, voiceId, presetId, sopranoPort);
  } else if (provider === 'kokoro' || provider === 'kokoro_local') {
    // Kokoro TTS (local sidecar)
    const kokoroPort = getKokoroPort();
    return await speakWithKokoro(text, voiceId, kokoroPort);
  } else {
    // Cloud providers (ElevenLabs, OpenAI) are handled in renderer process
    return Promise.resolve({ success: true });
  }
});

// Microphone permission
ipcMain.handle('get-mic-permission', async () => {
  if (process.platform === 'darwin') {
    const status = systemPreferences.getMediaAccessStatus('microphone');
    if (status !== 'granted') {
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
    await keytar.setPassword('Heilion', provider, key);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-api-key', async (event, provider) => {
  try {
    const keytar = require('keytar');
    const key = await keytar.getPassword('Heilion', provider);
    return { success: true, key };
  } catch (error) {
    return { success: false, error: error.message, key: null };
  }
});

// Audio recording (save to temp file)
let currentRecordingPath = null;

ipcMain.handle('start-audio-recording', async () => {
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

ipcMain.handle('save-audio-blob', async (event, arrayBuffer, extension = 'webm') => {
  const os = require('os');
  const path = require('path');
  
  try {
    const tempDir = os.tmpdir();
    const timestamp = Date.now();
    
    // Save raw blob (WebM/MP4/Opus) with appropriate extension
    const rawFilePath = path.join(tempDir, `heilion_recording_${timestamp}.${extension}`);
    fs.writeFileSync(rawFilePath, Buffer.from(arrayBuffer));
    
    // Convert to Whisper-compatible WAV using ffmpeg
    const wavFilePath = path.join(tempDir, `heilion_recording_${timestamp}.wav`);
    const conversionResult = await convertToWhisperWAV(rawFilePath, wavFilePath);
    
    if (!conversionResult.success) {
      // Clean up raw file if conversion failed
      try {
        fs.unlinkSync(rawFilePath);
      } catch (error) {
        // Ignore cleanup errors
      }
      return { 
        success: false, 
        error: conversionResult.error || 'Failed to convert audio to WAV',
        suggestion: conversionResult.suggestion || 'Please install ffmpeg: brew install ffmpeg'
      };
    }
    
    // Clean up raw file after successful conversion
    try {
      fs.unlinkSync(rawFilePath);
    } catch (error) {
      console.warn('Failed to clean up raw audio file:', error);
      // Non-fatal, continue
    }
    
    return { success: true, filePath: wavFilePath };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('check-ffmpeg', async () => {
  return await checkFFmpegAvailable();
});

// Update management IPC handlers
ipcMain.handle('check-for-updates', async () => {
  checkForUpdates(true);
  return { success: true };
});

ipcMain.handle('download-update', async () => {
  downloadUpdate();
  return { success: true };
});

ipcMain.handle('install-update', async () => {
  quitAndInstall();
  return { success: true };
});

ipcMain.handle('get-app-version', async () => {
  return { version: app.getVersion() };
});

ipcMain.handle('get-update-version', async () => {
  return { version: getCurrentVersion() };
});

ipcMain.handle('get-audio-file-path', () => {
  return { success: true, filePath: currentRecordingPath };
});

// Window control IPC handlers
ipcMain.handle('window-minimize', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.minimize();
    return { success: true };
  }
  return { success: false };
});

ipcMain.handle('window-maximize', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
    return { success: true, maximized: mainWindow.isMaximized() };
  }
  return { success: false };
});

ipcMain.handle('window-close', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.close();
    return { success: true };
  }
  return { success: false };
});

ipcMain.handle('window-is-maximized', () => {
  return mainWindow && !mainWindow.isDestroyed() ? mainWindow.isMaximized() : false;
});
