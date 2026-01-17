import React, { useState, useEffect } from 'react';
import { getSettings, updateSettings, applyPreset, healthCheckAll, autoDetectOllama } from '../utils/appBootstrap';
import { getDeckLibrary } from '../utils/deckManager';
import { getAvailableLanguages, getAvailableVoices } from '../utils/ttsManager';
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
  const [ollamaModels, setOllamaModels] = useState([]);
  const [healthStatus, setHealthStatus] = useState(null);
  const [courses, setCourses] = useState([]);
  const [ttsLanguages, setTtsLanguages] = useState([]);
  const [ttsVoices, setTtsVoices] = useState([]);
  const [sopranoAvailable, setSopranoAvailable] = useState(false);

  useEffect(() => {
    if (isOpen) {
      checkProviders();
      loadSettings();
      loadCourses();
      loadTtsLanguages();
    }
  }, [isOpen]);
  
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
      const result = await getDeckLibrary();
      if (result.success) {
        setCourses(result.decks || []);
      }
    } catch (error) {
      console.error('Failed to load courses:', error);
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
                className={settings.providerPreset === 'cloud' ? 'active' : ''}
                onClick={() => handleProviderPreset('cloud')}
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
              <option value="local" disabled={!whisperAvailable}>
                Local (Whisper.cpp) {!whisperAvailable && '(Not available)'}
              </option>
              <option value="cloud">Cloud</option>
            </select>
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
            <label className="settings-label" style={{ display: 'block', marginBottom: '8px' }}>
              TTS Engine
              <select
                value={settings.ttsProvider || 'web-speech'}
                onChange={(e) => saveSettings({ ttsProvider: e.target.value })}
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
                <option value="web-speech">Web Speech API (Multilingual)</option>
                <option value="soprano">Soprano TTS (English, Ultra-High Quality)</option>
              </select>
              <p style={{ fontSize: '11px', color: sopranoAvailable ? '#4CAF50' : '#888', marginTop: '4px', marginBottom: '8px' }}>
                {settings.ttsProvider === 'soprano' 
                  ? sopranoAvailable
                    ? '✓ Soprano TTS is available and ready. Ultra-realistic, expressive English speech.'
                    : 'Soprano TTS requires Python 3.10+ and soprano-tts package. App will automatically use Web Speech API if Soprano is not available.'
                  : 'Web Speech API supports multiple languages and uses system voices. Works immediately without installation.'}
              </p>
            </label>
            
            <label className="settings-label" style={{ display: 'block', marginTop: '12px' }}>
              Language
              <select
                value={settings.ttsLanguage || 'en'}
                onChange={(e) => saveSettings({ ttsLanguage: e.target.value, ttsVoice: null })}
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
                {ttsLanguages.map((lang) => (
                  <option key={lang} value={lang}>
                    {lang === 'en' ? 'English' : lang === 'es' ? 'Spanish' : lang === 'fr' ? 'French' : lang === 'de' ? 'German' : lang === 'it' ? 'Italian' : lang === 'pt' ? 'Portuguese' : lang === 'zh' ? 'Chinese' : lang === 'ja' ? 'Japanese' : lang === 'ko' ? 'Korean' : lang === 'ru' ? 'Russian' : lang.toUpperCase()}
                  </option>
                ))}
              </select>
            </label>
            
            <label className="settings-label" style={{ display: 'block', marginTop: '12px' }}>
              Voice
              <select
                value={settings.ttsVoice || ''}
                onChange={(e) => saveSettings({ ttsVoice: e.target.value || null })}
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
                <option value="">Auto-select best voice</option>
                {ttsVoices.map((voice) => (
                  <option key={voice.name} value={voice.name}>
                    {voice.name} ({voice.lang})
                  </option>
                ))}
              </select>
            </label>
            
            <label className="settings-label" style={{ display: 'block', marginTop: '12px' }}>
              Gender Preference
              <select
                value={settings.ttsGender || ''}
                onChange={(e) => saveSettings({ ttsGender: e.target.value || null })}
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
                <option value="">Auto</option>
                <option value="female">Female</option>
                <option value="male">Male</option>
              </select>
            </label>
            
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
            
            <label className="settings-label" style={{ display: 'block', marginTop: '12px' }}>
              Pitch: {settings.ttsPitch || 1.0}
              <input
                type="range"
                min="0"
                max="2"
                step="0.1"
                value={settings.ttsPitch || 1.0}
                onChange={(e) => saveSettings({ ttsPitch: parseFloat(e.target.value) })}
                style={{ width: '100%', marginTop: '4px' }}
              />
            </label>
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
                    cursor: 'pointer'
                  }}
                >
                  {courses.map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.name}
                    </option>
                  ))}
                </select>
                <p className="settings-hint" style={{ marginTop: '8px', color: '#666', fontSize: '12px' }}>
                  Switch between courses
                </p>
              </>
            ) : (
              <p className="settings-hint" style={{ color: '#666', fontSize: '12px' }}>
                No courses yet. Drop a PPTX file on the main screen to import.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default SettingsPanel;
