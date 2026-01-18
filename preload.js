const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Database
  dbQuery: (query, params) => ipcRenderer.invoke('db-query', query, params),
  
  // File operations
  importPPTX: () => ipcRenderer.invoke('import-pptx'),
  
  // Provider checks
  checkOllama: () => ipcRenderer.invoke('check-ollama'),
  checkWhisper: () => ipcRenderer.invoke('check-whisper'),
  
  // Audio/Speech
    runWhisper: (audioPath, modelName) => ipcRenderer.invoke('run-whisper', audioPath, modelName),
  ttsSpeak: (text, provider) => ipcRenderer.invoke('tts-speak', text, provider),
  getMicPermission: () => ipcRenderer.invoke('get-mic-permission'),
  streamAudioToWake: (audioData) => ipcRenderer.send('stream-audio-to-wake', audioData),
  
  // Wake word
  onWakeWordStatus: (callback) => {
    ipcRenderer.on('wake-word-status', (event, data) => callback(data));
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
  }
});
