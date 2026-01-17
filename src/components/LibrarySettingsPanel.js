import React, { useState, useEffect } from 'react';
import './LibrarySettingsPanel.css';

const PERSONAS = [
  'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
  'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'
];

function LibrarySettingsPanel({ isOpen, onClose, onImportPPTX }) {
  const [settings, setSettings] = useState({
    selectedPersona: 'Virgo',
    ollamaModel: 'llama2',
    ollamaUrl: 'http://localhost:11434'
  });

  const [ollamaAvailable, setOllamaAvailable] = useState(false);
  const [ollamaModels, setOllamaModels] = useState([]);

  useEffect(() => {
    if (isOpen) {
      loadSettings();
      checkOllama();
      loadOllamaModels();
    }
  }, [isOpen]);

  const loadSettings = () => {
    const saved = localStorage.getItem('heilion-settings');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setSettings({
          selectedPersona: parsed.selectedPersona || 'Virgo',
          ollamaModel: parsed.ollamaModel || 'llama2',
          ollamaUrl: parsed.ollamaUrl || 'http://localhost:11434'
        });
      } catch (error) {
        console.error('Failed to load settings:', error);
      }
    }
  };

  const saveSettings = (newSettings) => {
    const updated = { ...settings, ...newSettings };
    setSettings(updated);
    const saved = localStorage.getItem('heilion-settings');
    const allSettings = saved ? { ...JSON.parse(saved), ...updated } : updated;
    localStorage.setItem('heilion-settings', JSON.stringify(allSettings));
  };

  const checkOllama = async () => {
    const result = await window.electronAPI.checkOllama();
    setOllamaAvailable(result.available);
  };

  const loadOllamaModels = async () => {
    try {
      const response = await fetch('http://localhost:11434/api/tags');
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

  if (!isOpen) return null;

  return (
    <div className="library-settings-overlay" onClick={onClose}>
      <div className="library-settings-panel" onClick={(e) => e.stopPropagation()}>
        <div className="library-settings-header">
          <h2>Settings</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>
        
        <div className="library-settings-content">
          <div className="library-settings-section">
            <h3>Import Deck</h3>
            <button className="import-btn-large" onClick={() => {
              onImportPPTX();
              onClose();
            }}>
              Import PPTX File
            </button>
            <p className="settings-hint">Import a PowerPoint presentation to create a study deck</p>
          </div>

          <div className="library-settings-section">
            <h3>Persona</h3>
            <select
              value={settings.selectedPersona}
              onChange={(e) => saveSettings({ selectedPersona: e.target.value })}
            >
              {PERSONAS.map((persona) => (
                <option key={persona} value={persona}>{persona}</option>
              ))}
            </select>
            <p className="settings-hint">Choose the tutor persona for your sessions</p>
          </div>

          <div className="library-settings-section">
            <h3>Ollama Configuration</h3>
            <div className="ollama-status">
              {ollamaAvailable ? (
                <span className="status-available">● Ollama is running</span>
              ) : (
                <span className="status-unavailable">● Ollama is not running</span>
              )}
            </div>
            <label className="settings-label">
              Ollama URL
              <input
                type="text"
                value={settings.ollamaUrl}
                onChange={(e) => saveSettings({ ollamaUrl: e.target.value })}
                placeholder="http://localhost:11434"
                className="settings-input"
              />
            </label>
            <label className="settings-label">
              Model
              <select
                value={settings.ollamaModel}
                onChange={(e) => saveSettings({ ollamaModel: e.target.value })}
                disabled={!ollamaAvailable}
              >
                {ollamaModels.length > 0 ? (
                  ollamaModels.map((model) => (
                    <option key={model} value={model}>{model}</option>
                  ))
                ) : (
                  <option value="llama2">llama2 (not available)</option>
                )}
              </select>
            </label>
            <button 
              className="refresh-btn"
              onClick={loadOllamaModels}
              disabled={!ollamaAvailable}
            >
              Refresh Models
            </button>
            <p className="settings-hint">Configure local LLM via Ollama</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default LibrarySettingsPanel;
