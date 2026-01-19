import React, { useState, useEffect } from 'react';
import { getSettings, updateSettings, applyPreset, healthCheckAll, autoDetectOllama } from '../utils/appBootstrap';

// Check for updates manually from Settings
const checkForUpdatesManually = async () => {
  if (window.electronAPI && window.electronAPI.checkForUpdates) {
    try {
      await window.electronAPI.checkForUpdates();
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
  return { success: false, error: 'Update API not available' };
};
import { getCourseLibrary, deleteCourse } from '../utils/courseManager';
import { getAvailableLanguages, getAvailableVoices, listTTSProviders, listVoices, setVoiceSelection, testVoice } from '../utils/ttsManager';
import './SettingsPanel.css';

const PERSONAS = [
  'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
  'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'
];

function SettingsPanel({ isOpen, onClose, currentCourseId, onCourseChange }) {
  const [settings, setSettings] = useState({
    providerPreset: 'offline',
    sttProvider: 'local',
    llmProvider: 'local',
    ttsProvider: 'local',
    wakeWordEnabled: true,
    selectedPersona: 'Virgo',
    difficulty: 'medium',
    ollamaModel: 'llama2',
    ollamaUrl: 'http://localhost:11434'
  });

  const [ollamaAvailable, setOllamaAvailable] = useState(false);
  const [whisperAvailable, setWhisperAvailable] = useState(false);
  const [ffmpegAvailable, setFFmpegAvailable] = useState(false);
  const [appVersion, setAppVersion] = useState('1.0.0');
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [ollamaModels, setOllamaModels] = useState([]);
  const [healthStatus, setHealthStatus] = useState(null);
  const [courses, setCourses] = useState([]);
  const [ttsLanguages, setTtsLanguages] = useState([]);
  const [ttsVoices, setTtsVoices] = useState([]);
  const [sopranoAvailable, setSopranoAvailable] = useState(false);
  const [availableTtsProviders, setAvailableTtsProviders] = useState([]);
  const [availableVoices, setAvailableVoices] = useState([]);
  const [availablePresets, setAvailablePresets] = useState([]);
  const [loadingVoices, setLoadingVoices] = useState(false);
  const [testingVoice, setTestingVoice] = useState(false);

  useEffect(() => {
    if (isOpen) {
      checkProviders();
      loadSettings();
      loadCourses();
      loadTtsLanguages();
      loadTtsProviders();
      loadAppVersion();
    }
  }, [isOpen]);
  
  const loadAppVersion = async () => {
    try {
      if (window.electronAPI && window.electronAPI.getAppVersion) {
        const result = await window.electronAPI.getAppVersion();
        if (result && result.version) {
          setAppVersion(result.version);
        }
      }
    } catch (error) {
      console.error('Failed to load app version:', error);
    }
  };
  
  const handleCheckForUpdates = async () => {
    setCheckingUpdate(true);
    try {
      if (window.electronAPI && window.electronAPI.checkForUpdates) {
        await window.electronAPI.checkForUpdates();
        // The UpdateNotification component will handle showing the update status
        setTimeout(() => {
          setCheckingUpdate(false);
        }, 2000);
      } else {
        alert('Update checking is not available in development mode');
        setCheckingUpdate(false);
      }
    } catch (error) {
      console.error('Failed to check for updates:', error);
      alert(`Failed to check for updates: ${error.message}`);
      setCheckingUpdate(false);
    }
  };

  useEffect(() => {
    // Load voices when provider changes
    if (isOpen && settings.ttsProvider) {
      loadVoicesForProvider(settings.ttsProvider);
    }
  }, [settings.ttsProvider, isOpen]);
  
  useEffect(() => {
    // Reload voices when language changes
    if (isOpen && settings.ttsLanguage) {
      loadTtsVoices(settings.ttsLanguage);
    }
  }, [settings.ttsLanguage, isOpen]);

  const checkProviders = async () => {
    // Auto-detect Ollama first (tries multiple URLs/ports)
    const ollamaDetection = await autoDetectOllama();
    
    // Use healthCheckAll for comprehensive status
    const health = await healthCheckAll();
    setHealthStatus(health);
    setOllamaAvailable(health.ollamaRunning);
    setWhisperAvailable(health.whisperReady);
    setFFmpegAvailable(health.ffmpegReady);
    
    // Check Soprano TTS availability (try to connect to sidecar)
    checkSopranoAvailability();
    
    // Reload settings in case auto-detection updated them
    if (ollamaDetection.success) {
      loadSettings();
    }
    
    if (health.ollamaRunning) {
      loadOllamaModels();
    }
  };
  
  const checkSopranoAvailability = async () => {
    try {
      // Try a simple HEAD request to check if Soprano server is running
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000); // 2 second timeout
      
      try {
        const response = await fetch('http://127.0.0.1:8001/', {
          method: 'HEAD',
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        // If we get any response, the server is running
        setSopranoAvailable(true);
      } catch (fetchError) {
        clearTimeout(timeoutId);
        // Connection refused or timeout means Soprano is not available
        setSopranoAvailable(false);
      }
    } catch (error) {
      // Any error means Soprano is not available
      setSopranoAvailable(false);
    }
  };

  const loadOllamaModels = async () => {
    try {
      const url = settings.ollamaUrl || 'http://localhost:11434';
      const response = await fetch(`${url}/api/tags`);
      if (response.ok) {
        const data = await response.json();
        const models = data.models?.map(m => m.name) || [];
        setOllamaModels(models);
        if (models.length > 0 && !models.includes(settings.ollamaModel)) {
          saveSettings({ ollamaModel: models[0] });
        }
      }
    } catch (error) {
      console.error('Failed to load Ollama models:', error);
    }
  };

  const loadSettings = () => {
    const loaded = getSettings();
    setSettings(loaded);
  };

  const saveSettings = (newSettings) => {
    const updated = updateSettings(newSettings);
    setSettings(updated);
  };

  const handleProviderPreset = (preset) => {
    applyPreset(preset);
    loadSettings(); // Reload to reflect changes
    
    // Provide user feedback
    if (preset === 'accuracy' || preset === 'cloud') {
      const currentSettings = getSettings();
      const needsKeys = (currentSettings.sttProvider === 'cloud' || currentSettings.llmProvider === 'cloud');
      
      if (needsKeys) {
        // Show alert if API keys are needed
        setTimeout(() => {
          alert('Best Accuracy preset applied! Make sure you have API keys configured in the API Keys section for cloud providers to work.');
        }, 100);
      } else {
        // Just show confirmation
        setTimeout(() => {
          alert('Best Accuracy preset applied! Settings updated.');
        }, 100);
      }
    } else {
      setTimeout(() => {
        alert('Offline-First preset applied! Settings updated.');
      }, 100);
    }
  };

  const handleSaveApiKey = async (provider, key) => {
    try {
      const result = await window.electronAPI.saveApiKey(provider, key);
      if (result.success) {
        alert('API key saved successfully');
      } else {
        alert(`Failed to save API key: ${result.error}`);
      }
    } catch (error) {
      alert(`Error saving API key: ${error.message}`);
    }
  };

  const loadCourses = async () => {
    try {
      const result = await getCourseLibrary();
      if (result.success) {
        setCourses(result.courses || result.decks || []);
      }
    } catch (error) {
      console.error('Failed to load courses:', error);
    }
  };

  const handleDeleteCourse = async (courseId, courseName) => {
    // Confirm deletion
    const confirmed = window.confirm(
      `Are you sure you want to delete "${courseName}"?\n\nThis will permanently remove the course and all its slides, questions, and progress. This action cannot be undone.`
    );

    if (!confirmed) {
      return;
    }

    try {
      const result = await deleteCourse(courseId);
      if (result.success) {
        // Reload courses list
        await loadCourses();
        
        // If deleted course was the active one, clear it
        if (currentCourseId === courseId && onCourseChange) {
          // Set to first remaining course or null
          const remainingCourses = courses.filter(c => c.id !== courseId);
          if (remainingCourses.length > 0) {
            onCourseChange(remainingCourses[0].id);
          } else {
            onCourseChange(null);
          }
        }
        
        alert('Course deleted successfully');
      } else {
        alert(`Failed to delete course: ${result.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Delete course failed:', error);
      alert(`Error deleting course: ${error.message}`);
    }
  };
  
  const loadTtsLanguages = () => {
    const languages = getAvailableLanguages();
    setTtsLanguages(languages);
  };
  
  const loadTtsVoices = (lang) => {
    const voices = getAvailableVoices(lang);
    setTtsVoices(voices);
  };

  const loadTtsProviders = async () => {
    const providers = listTTSProviders();
    setAvailableTtsProviders(providers);
  };

  const loadVoicesForProvider = async (provider) => {
    setLoadingVoices(true);
    try {
      const result = await listVoices(provider);
      if (result.success) {
        setAvailableVoices(result.voices || []);
        setAvailablePresets(result.presets || []);
      } else {
        setAvailableVoices([]);
        setAvailablePresets([]);
      }
    } catch (error) {
      console.error('Failed to load voices:', error);
      setAvailableVoices([]);
      setAvailablePresets([]);
    } finally {
      setLoadingVoices(false);
    }
  };

  const handleTestVoice = async () => {
    setTestingVoice(true);
    try {
      const result = await testVoice('Hello, this is a test of the voice selection. How does it sound?');
      if (!result.success) {
        // Show error message in a more user-friendly way
        const errorMsg = result.error || 'Voice test failed. Please check your settings and try again.';
        alert(errorMsg);
      }
    } catch (error) {
      alert(`Voice test error: ${error.message || 'Unknown error occurred'}`);
    } finally {
      setTestingVoice(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2>Settings</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>
        
        <div className="settings-content">
          <div className="settings-section">
            <h3>Provider Preset</h3>
            <div className="preset-buttons">
              <button
                className={settings.providerPreset === 'offline' ? 'active' : ''}
                onClick={() => handleProviderPreset('offline')}
              >
                Offline-First
              </button>
              <button
                className={settings.providerPreset === 'accuracy' || settings.providerPreset === 'cloud' ? 'active' : ''}
                onClick={() => handleProviderPreset('accuracy')}
              >
                Best Accuracy (Cloud)
              </button>
            </div>
          </div>

          <div className="settings-section">
            <h3>Speech-to-Text</h3>
            <select
              value={settings.sttProvider}
              onChange={(e) => saveSettings({ sttProvider: e.target.value })}
            >
              <option value="local" disabled={!whisperAvailable || !ffmpegAvailable}>
                Local (Whisper.cpp) {(!whisperAvailable || !ffmpegAvailable) && '(Not available)'}
              </option>
              <option value="hubert-llama">HuBERT + Llama 3 (Multimodal)</option>
              <option value="cloud">Cloud (OpenAI Whisper API)</option>
            </select>
            
            {/* API Key Input for Cloud STT */}
            {settings.sttProvider === 'cloud' && (
              <div style={{ marginTop: '12px' }}>
                <label className="settings-label" style={{ display: 'block', marginBottom: '4px' }}>
                  OpenAI API Key
                  <input
                    type="password"
                    placeholder="Enter OpenAI API key (for Whisper API)"
                    onBlur={async (e) => {
                      if (e.target.value) {
                        await handleSaveApiKey('openai', e.target.value);
                      }
                    }}
                    style={{
                      width: '100%',
                      background: '#222',
                      color: '#fff',
                      border: '1px solid #444',
                      padding: '8px',
                      borderRadius: '4px',
                      fontSize: '14px',
                      marginTop: '4px',
                      boxSizing: 'border-box'
                    }}
                  />
                </label>
                <p style={{ fontSize: '11px', color: '#888', marginTop: '4px' }}>
                  Uses OpenAI Whisper API (Robust Speech Recognition via Large-Scale Weak Supervision)
                </p>
              </div>
            )}
            
            {/* Diagnostics: Show ffmpeg status */}
            {healthStatus && (
              <div style={{ 
                marginTop: '8px', 
                fontSize: '12px', 
                color: ffmpegAvailable ? '#4caf50' : '#f44336',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                <span>{ffmpegAvailable ? '✓' : '✗'}</span>
                <span>
                  ffmpeg: {ffmpegAvailable ? 'Available' : 'Not found'}
                  {healthStatus.ffmpegPath && ` (${healthStatus.ffmpegPath})`}
                </span>
              </div>
            )}
            
            {/* Silence Timeout (Auto-stop) */}
            <label className="settings-label" style={{ display: 'block', marginTop: '12px' }}>
              Silence Timeout (Auto-stop)
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '8px' }}>
                <input
                  type="range"
                  min="900"
                  max="1200"
                  step="50"
                  value={settings.silenceDuration || 1000}
                  onChange={(e) => saveSettings({ silenceDuration: parseInt(e.target.value) })}
                  style={{ flex: 1 }}
                />
                <span style={{ minWidth: '60px', fontSize: '14px', color: '#aaa' }}>
                  {(settings.silenceDuration || 1000) / 1000}s
                </span>
              </div>
              <div style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
                How long to wait for silence before auto-stopping (0.9-1.2s)
              </div>
            </label>
            
            {/* Whisper Model Selection */}
            <label className="settings-label" style={{ display: 'block', marginTop: '12px' }}>
              Whisper Model
              <select
                value={settings.whisperModel || 'base.en'}
                onChange={(e) => saveSettings({ whisperModel: e.target.value })}
                style={{
                  width: '100%',
                  background: '#222',
                  color: '#fff',
                  border: '1px solid #444',
                  padding: '8px',
                  borderRadius: '4px',
                  fontSize: '14px',
                  marginTop: '4px',
                  boxSizing: 'border-box'
                }}
              >
                <option value="tiny.en">Tiny (fastest, less accurate)</option>
                <option value="base.en">Base (balanced, recommended)</option>
                <option value="small.en">Small (slower, more accurate)</option>
                <option value="medium.en">Medium (best accuracy, requires more RAM)</option>
              </select>
              <div style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
                Model files should be in ~/whisper.cpp/models/ directory
              </div>
            </label>
          </div>

          <div className="settings-section">
            <h3>LLM Provider</h3>
            <select
              value={settings.llmProvider}
              onChange={(e) => saveSettings({ llmProvider: e.target.value })}
            >
              <option value="local" disabled={!ollamaAvailable}>
                Local (Ollama) {!ollamaAvailable && '(Not running)'}
              </option>
              <option value="cloud">Cloud</option>
            </select>
            
            {settings.llmProvider === 'local' && (
              <div style={{ marginTop: '12px' }}>
                <label className="settings-label" style={{ display: 'block', marginBottom: '4px' }}>
                  Ollama URL
                  <input
                    type="text"
                    value={settings.ollamaUrl}
                    onChange={(e) => saveSettings({ ollamaUrl: e.target.value })}
                    placeholder="http://localhost:11434"
                    style={{
                      width: '100%',
                      background: '#222',
                      color: '#fff',
                      border: '1px solid #444',
                      padding: '8px',
                      borderRadius: '4px',
                      fontSize: '14px',
                      marginTop: '4px',
                      boxSizing: 'border-box'
                    }}
                  />
                </label>
                <label className="settings-label" style={{ display: 'block', marginTop: '8px' }}>
                  Model
                  <select
                    value={settings.ollamaModel}
                    onChange={(e) => saveSettings({ ollamaModel: e.target.value })}
                    disabled={!ollamaAvailable || ollamaModels.length === 0}
                    style={{
                      width: '100%',
                      background: '#222',
                      color: '#fff',
                      border: '1px solid #444',
                      padding: '8px',
                      borderRadius: '4px',
                      fontSize: '14px',
                      marginTop: '4px',
                      cursor: ollamaAvailable && ollamaModels.length > 0 ? 'pointer' : 'not-allowed',
                      opacity: ollamaAvailable && ollamaModels.length > 0 ? 1 : 0.5
                    }}
                  >
                    {ollamaModels.length > 0 ? (
                      ollamaModels.map((model) => (
                        <option key={model} value={model}>{model}</option>
                      ))
                    ) : (
                      <option value={settings.ollamaModel || 'llama2'}>
                        {settings.ollamaModel || 'llama2'} {ollamaAvailable ? '' : '(Not available)'}
                      </option>
                    )}
                  </select>
                </label>
                <button
                  onClick={loadOllamaModels}
                  disabled={!ollamaAvailable}
                  style={{
                    width: '100%',
                    background: '#333',
                    color: '#fff',
                    border: '1px solid #555',
                    padding: '6px 12px',
                    borderRadius: '4px',
                    cursor: ollamaAvailable ? 'pointer' : 'not-allowed',
                    fontSize: '12px',
                    marginTop: '8px',
                    opacity: ollamaAvailable ? 1 : 0.5
                  }}
                >
                  Refresh Models
                </button>
              </div>
            )}
          </div>

          <div className="settings-section">
            <h3>Text-to-Speech</h3>
            
            {/* Provider Selection */}
            <label className="settings-label" style={{ display: 'block', marginBottom: '8px' }}>
              TTS Provider
              <select
                value={settings.ttsProvider || 'soprano_local'}
                onChange={async (e) => {
                  const newProvider = e.target.value;
                  saveSettings({ ttsProvider: newProvider, voiceId: null, presetId: null });
                  await loadVoicesForProvider(newProvider);
                }}
                style={{
                  width: '100%',
                  background: '#222',
                  color: '#fff',
                  border: '1px solid #444',
                  padding: '8px',
                  borderRadius: '4px',
                  fontSize: '14px',
                  marginTop: '4px',
                  boxSizing: 'border-box'
                }}
              >
                {availableTtsProviders.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.name}
                  </option>
                ))}
              </select>
            </label>
            
            {/* Voice Selection (varies by provider) */}
            {settings.ttsProvider && (
              <label className="settings-label" style={{ display: 'block', marginTop: '12px' }}>
                Voice
                <select
                  value={settings.voiceId || ''}
                  onChange={(e) => saveSettings({ voiceId: e.target.value || null })}
                  disabled={loadingVoices}
                  style={{
                    width: '100%',
                    background: '#222',
                    color: '#fff',
                    border: '1px solid #444',
                    padding: '8px',
                    borderRadius: '4px',
                    fontSize: '14px',
                    marginTop: '4px',
                    boxSizing: 'border-box',
                    opacity: loadingVoices ? 0.5 : 1
                  }}
                >
                  <option value="">{loadingVoices ? 'Loading voices...' : 'Select a voice'}</option>
                  {availableVoices.map((voice) => (
                    <option key={voice.id} value={voice.id}>
                      {voice.name} {voice.description ? `- ${voice.description}` : ''}
                    </option>
                  ))}
                </select>
              </label>
            )}
            
            {/* Preset Selection (Soprano only) */}
            {settings.ttsProvider === 'soprano_local' && availablePresets.length > 0 && (
              <label className="settings-label" style={{ display: 'block', marginTop: '12px' }}>
                Preset
                <select
                  value={settings.presetId || 'balanced'}
                  onChange={(e) => saveSettings({ presetId: e.target.value || null })}
                  style={{
                    width: '100%',
                    background: '#222',
                    color: '#fff',
                    border: '1px solid #444',
                    padding: '8px',
                    borderRadius: '4px',
                    fontSize: '14px',
                    marginTop: '4px',
                    boxSizing: 'border-box'
                  }}
                >
                  {availablePresets.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.name} - {preset.description}
                    </option>
                  ))}
                </select>
              </label>
            )}
            
            {/* API Key Input (for cloud providers) */}
            {(settings.ttsProvider === 'elevenlabs_cloud' || settings.ttsProvider === 'openai_cloud') && (
              <div style={{ marginTop: '12px' }}>
                <label className="settings-label" style={{ display: 'block', marginBottom: '4px' }}>
                  API Key
                  <input
                    type="password"
                    placeholder={`Enter ${settings.ttsProvider === 'elevenlabs_cloud' ? 'ElevenLabs' : 'OpenAI'} API key`}
                    onBlur={async (e) => {
                      if (e.target.value) {
                        await handleSaveApiKey(settings.ttsProvider === 'elevenlabs_cloud' ? 'elevenlabs' : 'openai', e.target.value);
                      }
                    }}
                    style={{
                      width: '100%',
                      background: '#222',
                      color: '#fff',
                      border: '1px solid #444',
                      padding: '8px',
                      borderRadius: '4px',
                      fontSize: '14px',
                      marginTop: '4px',
                      boxSizing: 'border-box'
                    }}
                  />
                </label>
                <button
                  onClick={loadVoicesForProvider.bind(null, settings.ttsProvider)}
                  disabled={loadingVoices}
                  style={{
                    width: '100%',
                    background: '#333',
                    color: '#fff',
                    border: '1px solid #555',
                    padding: '6px 12px',
                    borderRadius: '4px',
                    cursor: loadingVoices ? 'not-allowed' : 'pointer',
                    fontSize: '12px',
                    marginTop: '8px',
                    opacity: loadingVoices ? 0.5 : 1
                  }}
                >
                  {loadingVoices ? 'Loading...' : 'Refresh Voices'}
                </button>
              </div>
            )}
            
            {/* Rate Slider */}
            <label className="settings-label" style={{ display: 'block', marginTop: '12px' }}>
              Speed: {settings.ttsRate || 1.0}x
              <input
                type="range"
                min="0.5"
                max="2"
                step="0.1"
                value={settings.ttsRate || 1.0}
                onChange={(e) => saveSettings({ ttsRate: parseFloat(e.target.value) })}
                style={{ width: '100%', marginTop: '4px' }}
              />
            </label>
            
            {/* Test Voice Button */}
            <button
              onClick={handleTestVoice}
              disabled={testingVoice || !settings.ttsProvider}
              style={{
                width: '100%',
                background: testingVoice ? '#444' : '#0066ff',
                color: '#fff',
                border: 'none',
                padding: '10px',
                borderRadius: '6px',
                fontSize: '14px',
                cursor: testingVoice || !settings.ttsProvider ? 'not-allowed' : 'pointer',
                marginTop: '16px',
                fontWeight: '500'
              }}
            >
              {testingVoice ? 'Testing...' : 'Test Voice'}
            </button>
            
            {/* Status Messages */}
            <p style={{ fontSize: '11px', color: sopranoAvailable ? '#4CAF50' : '#888', marginTop: '8px', marginBottom: '8px' }}>
              {settings.ttsProvider === 'soprano_local'
                ? sopranoAvailable
                  ? '✓ Soprano TTS is available and ready. Ultra-realistic, expressive English speech.'
                  : 'Soprano TTS requires Python 3.10+ and soprano-tts package. App will automatically use Web Speech API if Soprano is not available.'
                : settings.ttsProvider === 'elevenlabs_cloud'
                ? 'ElevenLabs cloud TTS with premium voices. Requires API key.'
                : settings.ttsProvider === 'openai_cloud'
                ? 'OpenAI text-to-speech API. Requires API key.'
                : 'Select a TTS provider'}
            </p>
          </div>

          <div className="settings-section">
            <h3>Wake Word</h3>
            <label>
              <input
                type="checkbox"
                checked={settings.wakeWordEnabled}
                onChange={(e) => saveSettings({ wakeWordEnabled: e.target.checked })}
              />
              Enable wake word detection
            </label>
          </div>

          <div className="settings-section">
            <h3>Persona</h3>
            <select
              value={settings.selectedPersona}
              onChange={(e) => saveSettings({ selectedPersona: e.target.value })}
            >
              {PERSONAS.map((persona) => (
                <option key={persona} value={persona}>{persona}</option>
              ))}
            </select>
          </div>

          <div className="settings-section">
            <h3>Difficulty</h3>
            <select
              value={settings.difficulty}
              onChange={(e) => saveSettings({ difficulty: e.target.value })}
            >
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </div>

          <div className="settings-section">
            <h3>Teacher Style</h3>
            <select
              value={settings.teacherStyle || 'friendly'}
              onChange={(e) => saveSettings({ teacherStyle: e.target.value })}
            >
              <option value="friendly">Friendly</option>
              <option value="strict">Strict</option>
              <option value="socratic">Socratic</option>
            </select>
          </div>

          <div className="settings-section">
            <h3>Course</h3>
            {courses.length > 0 ? (
              <>
                <select
                  value={currentCourseId || ''}
                  onChange={(e) => {
                    if (onCourseChange && e.target.value) {
                      onCourseChange(parseInt(e.target.value));
                    }
                  }}
                  style={{
                    width: '100%',
                    background: '#222',
                    color: '#fff',
                    border: '1px solid #444',
                    padding: '10px',
                    borderRadius: '6px',
                    fontSize: '14px',
                    cursor: 'pointer',
                    marginBottom: '12px'
                  }}
                >
                  {courses.map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.name}
                    </option>
                  ))}
                </select>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '8px' }}>
                  {courses.map((course) => (
                    <div 
                      key={course.id} 
                      style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'space-between',
                        padding: '10px 12px',
                        background: '#1a1a1a',
                        borderRadius: '6px',
                        border: '1px solid #333'
                      }}
                    >
                      <span style={{ color: '#ccc', fontSize: '13px', flex: 1 }}>
                        {course.name}
                      </span>
                      <button
                        onClick={() => handleDeleteCourse(course.id, course.name)}
                        style={{
                          background: '#d32f2f',
                          color: '#fff',
                          border: 'none',
                          padding: '6px 14px',
                          borderRadius: '4px',
                          fontSize: '12px',
                          cursor: 'pointer',
                          transition: 'background 0.2s',
                          fontWeight: '500'
                        }}
                        onMouseEnter={(e) => e.target.style.background = '#b71c1c'}
                        onMouseLeave={(e) => e.target.style.background = '#d32f2f'}
                        title={`Delete ${course.name}`}
                      >
                        Delete
                      </button>
                    </div>
                  ))}
                </div>
                <p className="settings-hint" style={{ marginTop: '4px', color: '#666', fontSize: '12px' }}>
                  Switch between courses or delete courses you no longer need
                </p>
              </>
            ) : (
              <p className="settings-hint" style={{ color: '#666', fontSize: '12px' }}>
                No courses yet. Drop a PPTX file on the main screen to import.
              </p>
            )}
          </div>

          <div className="settings-section">
            <h3>About & Updates</h3>
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '14px', color: '#aaa', marginBottom: '8px' }}>
                Version: {appVersion}
              </div>
              <button
                onClick={handleCheckForUpdates}
                disabled={checkingUpdate}
                style={{
                  padding: '10px 20px',
                  background: checkingUpdate ? '#444' : '#4a90e2',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: checkingUpdate ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  fontWeight: '500'
                }}
              >
                {checkingUpdate ? 'Checking...' : 'Check for Updates'}
              </button>
            </div>
            <div style={{ fontSize: '12px', color: '#888', marginTop: '8px' }}>
              Updates are checked automatically. Click to check manually.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SettingsPanel;
