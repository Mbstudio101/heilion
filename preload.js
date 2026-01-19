const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Database
  dbQuery: (query, params) => ipcRenderer.invoke('db-query', query, params),
  
  // File operations
  importPPTX: () => ipcRenderer.invoke('import-pptx'),
  importCourseFromPath: (filePath) => ipcRenderer.invoke('course:importPptxFromPath', filePath),
  copyPPTXToStorage: (sourcePath, courseId) => ipcRenderer.invoke('copy-pptx-to-storage', sourcePath, courseId),
  searchRelevantSlides: (courseId, query, limit) => ipcRenderer.invoke('course:searchRelevantSlides', courseId, query, limit),
  
  // Provider checks
  checkOllama: () => ipcRenderer.invoke('check-ollama'),
  checkWhisper: () => ipcRenderer.invoke('check-whisper'),
  
  // Audio/Speech
    runWhisper: (audioPath, modelName) => ipcRenderer.invoke('run-whisper', audioPath, modelName),
  transcribeWithOpenAI: (audioPath, apiKey) => ipcRenderer.invoke('transcribe-with-openai', audioPath, apiKey),
  transcribeWithHubertLlama: (audioPath, context) => ipcRenderer.invoke('transcribe-with-hubert-llama', audioPath, context),
  checkHubertLlama: () => ipcRenderer.invoke('check-hubert-llama'),
  ttsSpeak: (text, provider) => ipcRenderer.invoke('tts-speak', text, provider),
  getMicPermission: () => ipcRenderer.invoke('get-mic-permission'),
  streamAudioToWake: (audioData) => ipcRenderer.send('stream-audio-to-wake', audioData),
  
  // Wake word
  onWakeWordStatus: (callback) => {
    ipcRenderer.on('wake-word-status', (event, data) => callback(data));
  },
  removeWakeWordStatusListener: (callback) => {
    ipcRenderer.removeListener('wake-word-status', callback);
  },
  
  // API Keys (keytar)
  saveApiKey: (provider, key) => ipcRenderer.invoke('save-api-key', provider, key),
  getApiKey: (provider) => ipcRenderer.invoke('get-api-key', provider),
  
  // Audio recording
  startAudioRecording: () => ipcRenderer.invoke('start-audio-recording'),
  stopAudioRecording: () => ipcRenderer.invoke('stop-audio-recording'),
  saveAudioBlob: (arrayBuffer, extension) => ipcRenderer.invoke('save-audio-blob', arrayBuffer, extension),
  getAudioFilePath: () => ipcRenderer.invoke('get-audio-file-path'),
  checkFFmpeg: () => ipcRenderer.invoke('check-ffmpeg'),
  
  // Window controls
  windowMinimize: () => ipcRenderer.invoke('window-minimize'),
  windowMaximize: () => ipcRenderer.invoke('window-maximize'),
  windowClose: () => ipcRenderer.invoke('window-close'),
  windowIsMaximized: () => ipcRenderer.invoke('window-is-maximized'),
  onWindowMaximized: (callback) => {
    ipcRenderer.on('window-maximized', (event, maximized) => callback(maximized));
  },
  removeWindowMaximizedListener: (callback) => {
    ipcRenderer.removeListener('window-maximized', callback);
  },
  
  // Auto-update
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getUpdateVersion: () => ipcRenderer.invoke('get-update-version'),
  onUpdateStatus: (callback) => {
    ipcRenderer.on('update-status', (event, data) => callback(data));
  },
  onUpdateAvailable: (callback) => {
    ipcRenderer.on('update-available', (event, data) => callback(data));
  },
  onUpdateDownloadProgress: (callback) => {
    ipcRenderer.on('update-download-progress', (event, data) => callback(data));
  },
  onUpdateDownloaded: (callback) => {
    ipcRenderer.on('update-downloaded', (event, data) => callback(data));
  },
  onUpdateError: (callback) => {
    ipcRenderer.on('update-error', (event, data) => callback(data));
  },
  removeUpdateListeners: () => {
    ipcRenderer.removeAllListeners('update-status');
    ipcRenderer.removeAllListeners('update-available');
    ipcRenderer.removeAllListeners('update-download-progress');
    ipcRenderer.removeAllListeners('update-downloaded');
    ipcRenderer.removeAllListeners('update-error');
  }
});
