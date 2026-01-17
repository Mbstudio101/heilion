// App bootstrap and health checks
export async function bootstrapApp() {
  // Auto-detect Ollama first (before health check)
  const ollamaDetection = await autoDetectOllama();
  
  const health = await healthCheckAll();
  
  // Load saved settings (may have been updated by auto-detection)
  const settings = getSettings();
  
  return {
    ready: true,
    health,
    settings,
    ollamaAutoDetected: ollamaDetection.success
  };
}

export async function healthCheckAll() {
  const checks = await Promise.all([
    checkOllama(),
    checkWhisper(),
    checkWakeService(),
    checkCloudKeys(),
    checkInternet()
  ]);
  
  return {
    ollamaRunning: checks[0],
    whisperReady: checks[1],
    wakeServiceReady: checks[2],
    cloudKeysPresent: checks[3],
    internetAvailable: checks[4]
  };
}

async function checkOllama() {
  try {
    const result = await window.electronAPI.checkOllama();
    return result.available;
  } catch {
    return false;
  }
}

// Auto-detect and configure Ollama
export async function autoDetectOllama() {
  try {
    const result = await window.electronAPI.checkOllama();
    
    if (result.available && result.url) {
      const settings = getSettings();
      
      // Update settings with detected URL
      const updated = updateSettings({
        ollamaUrl: result.url
      });
      
      // Auto-select best model if models are available
      if (result.models && result.models.length > 0) {
        // Prefer llama3, llama2, or first available
        const preferredModels = ['llama3', 'llama2', 'llama3.1', 'mistral', 'mixtral'];
        const bestModel = preferredModels.find(m => 
          result.models.some(available => available.includes(m))
        ) || result.models[0];
        
        if (bestModel) {
          updateSettings({
            ollamaModel: bestModel
          });
        }
      }
      
      return {
        success: true,
        url: result.url,
        models: result.models || [],
        autoConfigured: true
      };
    }
    
    return { success: false, available: false };
  } catch (error) {
    console.error('Auto-detect Ollama error:', error);
    return { success: false, error: error.message };
  }
}

async function checkWhisper() {
  try {
    const result = await window.electronAPI.checkWhisper();
    return result.available;
  } catch {
    return false;
  }
}

async function checkWakeService() {
  try {
    const ws = new WebSocket('ws://localhost:8765');
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve(false);
        try { 
          if (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN) {
            ws.close(); 
          }
        } catch {}
      }, 1500); // Reduced timeout to 1.5s
      
      ws.onopen = () => {
        clearTimeout(timeout);
        resolve(true);
        try { ws.close(); } catch {}
      };
      
      ws.onerror = (error) => {
        // Silently handle connection refused - expected if wake service not running
        clearTimeout(timeout);
        resolve(false);
      };
      
      ws.onclose = () => {
        clearTimeout(timeout);
      };
    });
  } catch (error) {
    // Silently handle connection errors - wake service is optional
    return false;
  }
}

async function checkCloudKeys() {
  try {
    const settings = getSettings();
    if (settings.sttProvider === 'cloud' || settings.llmProvider === 'cloud') {
      // Check if API keys exist via keytar
      const sttKey = settings.sttProvider === 'cloud' 
        ? await window.electronAPI.getApiKey('stt') 
        : null;
      const llmKey = settings.llmProvider === 'cloud'
        ? await window.electronAPI.getApiKey('llm')
        : null;
      return !!(sttKey || llmKey);
    }
    return true; // Not using cloud, so keys not needed
  } catch {
    return false;
  }
}

async function checkInternet() {
  // Use navigator.onLine instead of fetch to avoid CSP violations
  // This checks if the browser thinks it's online (not 100% accurate but good enough)
  try {
    return navigator.onLine !== false;
  } catch {
    return true; // Assume online if we can't check
  }
}

export function applyPreset(preset) {
  const settings = getSettings();
  
  if (preset === 'offline') {
    updateSettings({
      providerPreset: 'offline',
      sttProvider: 'local',
      llmProvider: 'local',
      ttsProvider: 'soprano_local',
      sttFallback: false,
      llmFallback: false
    });
  } else if (preset === 'accuracy') {
    updateSettings({
      providerPreset: 'accuracy',
      sttProvider: 'cloud',
      llmProvider: 'cloud',
      ttsProvider: 'elevenlabs_cloud', // Use ElevenLabs for best quality
      sttFallback: true, // Fallback to local if cloud fails
      llmFallback: true
    });
  }
}

export function getSettings() {
  const saved = localStorage.getItem('heilion-settings');
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch {
      return getDefaultSettings();
    }
  }
  return getDefaultSettings();
}

export function updateSettings(partialSettings) {
  const current = getSettings();
  const updated = { ...current, ...partialSettings };
  localStorage.setItem('heilion-settings', JSON.stringify(updated));
  return updated;
}

function getDefaultSettings() {
  return {
    providerPreset: 'offline',
    sttProvider: 'local',
    llmProvider: 'local',
    ttsProvider: 'soprano_local', // 'soprano_local' | 'elevenlabs_cloud' | 'openai_cloud'
    sttFallback: false,
    llmFallback: false,
    wakeWordEnabled: true,
    selectedPersona: 'Virgo',
    difficulty: 'medium',
    ollamaModel: 'llama2',
    ollamaUrl: 'http://localhost:11434',
    // Voice Catalog settings
    ttsLanguage: 'en',
    voiceId: null, // Voice ID for cloud providers or model variant for Soprano
    presetId: null, // Soprano preset: 'calm' | 'balanced' | 'expressive'
    autoVoiceByPersona: false, // Automatically select voice based on persona
    ttsRate: 1.0, // 0.1 to 10
    ttsPitch: 1.0, // 0 to 2
    ttsVolume: 1.0 // 0 to 1
  };
}
