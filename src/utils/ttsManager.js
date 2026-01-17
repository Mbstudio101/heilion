// Multilingual Text-to-Speech manager using Web Speech API
import { eventBus, EVENTS } from './eventBus';
import { getSettings } from './appBootstrap';

let speechSynthesis = null;
let currentUtterance = null;
let availableVoices = [];

// Initialize Web Speech API and load voices
function initSpeechSynthesis() {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    speechSynthesis = window.speechSynthesis;
    
    // Load voices when they become available
    if (speechSynthesis.getVoices().length > 0) {
      availableVoices = speechSynthesis.getVoices();
    } else {
      speechSynthesis.addEventListener('voiceschanged', () => {
        availableVoices = speechSynthesis.getVoices();
      }, { once: true });
    }
    
    return true;
  }
  return false;
}

// Get available voices for a specific language
export function getAvailableVoices(lang = null) {
  if (!availableVoices.length) {
    initSpeechSynthesis();
    availableVoices = speechSynthesis?.getVoices() || [];
  }
  
  if (lang) {
    return availableVoices.filter(voice => voice.lang.startsWith(lang));
  }
  return availableVoices;
}

// Get available languages from voices
export function getAvailableLanguages() {
  const voices = getAvailableVoices();
  const languages = new Set();
  
  voices.forEach(voice => {
    // Extract language code (e.g., "en-US" -> "en")
    const langCode = voice.lang.split('-')[0];
    languages.add(langCode);
  });
  
  return Array.from(languages).sort();
}

// Select best voice for language and gender preference
function selectVoice(lang, gender = null, voiceName = null) {
  const voices = getAvailableVoices(lang);
  
  if (voices.length === 0) {
    // Fallback to default voices
    return speechSynthesis?.getVoices().find(v => v.default) || null;
  }
  
  // If specific voice name is provided, use it
  if (voiceName) {
    const namedVoice = voices.find(v => v.name === voiceName);
    if (namedVoice) return namedVoice;
  }
  
  // Prefer voices with preferred gender
  if (gender) {
    const genderedVoices = voices.filter(v => {
      const name = v.name.toLowerCase();
      return gender === 'female' 
        ? (name.includes('female') || name.includes('woman') || name.includes('samantha') || name.includes('karen'))
        : (name.includes('male') || name.includes('man') || name.includes('alex') || name.includes('tom'));
    });
    if (genderedVoices.length > 0) return genderedVoices[0];
  }
  
  // Return first available voice for the language
  return voices[0];
}

export async function speak(text, personaVoiceConfig, settings = null) {
  try {
    // Load settings if not provided
    if (!settings) {
      settings = getSettings();
    }
    
    // Check which TTS provider to use
    const ttsProvider = settings.ttsProvider || 'web-speech';
    
    // Use Soprano TTS for high-quality English (if available)
    // Will automatically fall back to Web Speech API if Soprano fails
    if (ttsProvider === 'soprano' && settings.ttsLanguage === 'en') {
      return await speakWithSoprano(text, personaVoiceConfig, settings);
    }
    
    // Default to Web Speech API (multilingual support)
    return await speakWithWebSpeech(text, personaVoiceConfig, settings);
  } catch (error) {
    currentUtterance = null;
    eventBus.emit(EVENTS.SPEAK_END, { text, persona: personaVoiceConfig, error: error.message });
    return { success: false, error: error.message };
  }
}

export async function stopSpeaking() {
  if (speechSynthesis && currentUtterance) {
    // Cancel speech - this will trigger onerror with 'interrupted', which is expected
    speechSynthesis.cancel();
    const wasSpeaking = currentUtterance !== null;
    currentUtterance = null;
    
    // Only emit event if we actually cancelled something
    if (wasSpeaking) {
      eventBus.emit(EVENTS.SPEAK_END, { stopped: true, interrupted: true });
    }
    return { success: true };
  }
  return { success: false, error: 'No speech in progress' };
}

// Soprano TTS integration (English-only, high-quality)
async function speakWithSoprano(text, personaVoiceConfig, settings) {
  try {
    // Emit speak start event
    eventBus.emit(EVENTS.SPEAK_START, { text, persona: personaVoiceConfig });
    
    // Use Soprano via IPC (calls main process which communicates with sidecar)
    if (window.electronAPI?.ttsSpeak) {
      const result = await window.electronAPI.ttsSpeak(text, 'soprano');
      
      // If Soprano fails, fall back to Web Speech API
      if (!result.success) {
        console.warn('Soprano TTS failed, falling back to Web Speech API:', result.error);
        eventBus.emit(EVENTS.SPEAK_END, { text, persona: personaVoiceConfig, interrupted: true });
        
        // Fall back to Web Speech API
        return await speakWithWebSpeech(text, personaVoiceConfig, settings);
      }
      
      // Emit speak end event
      eventBus.emit(EVENTS.SPEAK_END, { text, persona: personaVoiceConfig });
      
      return { success: true };
    } else {
      throw new Error('Electron API not available');
    }
  } catch (error) {
    // If Soprano fails, fall back to Web Speech API
    console.warn('Soprano TTS error, falling back to Web Speech API:', error.message);
    eventBus.emit(EVENTS.SPEAK_END, { text, persona: personaVoiceConfig, interrupted: true });
    
    // Fall back to Web Speech API
    return await speakWithWebSpeech(text, personaVoiceConfig, settings);
  }
}

// Web Speech API implementation (extracted for reuse)
async function speakWithWebSpeech(text, personaVoiceConfig, settings) {
  // Initialize if needed
  if (!speechSynthesis) {
    if (!initSpeechSynthesis()) {
      throw new Error('Web Speech API not available');
    }
  }
  
  // Get TTS language and voice from settings
  const ttsLang = settings.ttsLanguage || 'en';
  const ttsVoice = settings.ttsVoice || null;
  const ttsGender = settings.ttsGender || null;
  const ttsRate = settings.ttsRate || 1.0;
  const ttsPitch = settings.ttsPitch || 1.0;
  const ttsVolume = settings.ttsVolume || 1.0;
  
  // Stop any current speech before starting new one
  // This will cause an 'interrupted' error on the previous utterance, which is expected
  if (speechSynthesis.speaking && currentUtterance) {
    speechSynthesis.cancel();
    currentUtterance = null;
  }
  
  // Emit speak start event
  eventBus.emit(EVENTS.SPEAK_START, { text, persona: personaVoiceConfig });
  
  // Create utterance
  currentUtterance = new SpeechSynthesisUtterance(text);
  
  // Select voice
  const voice = selectVoice(ttsLang, ttsGender, ttsVoice);
  if (voice) {
    currentUtterance.voice = voice;
    currentUtterance.lang = voice.lang;
  } else {
    currentUtterance.lang = ttsLang;
  }
  
  // Set speech parameters
  currentUtterance.rate = ttsRate;
  currentUtterance.pitch = ttsPitch;
  currentUtterance.volume = ttsVolume;
  
  // Set up event handlers
  return new Promise((resolve, reject) => {
    currentUtterance.onend = () => {
      currentUtterance = null;
      eventBus.emit(EVENTS.SPEAK_END, { text, persona: personaVoiceConfig });
      resolve({ success: true });
    };
    
    currentUtterance.onerror = (error) => {
      currentUtterance = null;
      
      // CANCELED and INTERRUPTED errors are expected when speech is cancelled
      // Don't treat them as actual errors
      const isExpectedError = error.error === 'interrupted' || 
                             error.error === 'INTERRUPTED' ||
                             error.error === 'canceled' ||
                             error.error === 'CANCELED';
      
      if (isExpectedError) {
        // Silently handle cancellation/interruption - this is normal behavior
        eventBus.emit(EVENTS.SPEAK_END, { text, persona: personaVoiceConfig, interrupted: true });
        resolve({ success: true, interrupted: true });
      } else {
        // Real errors should be reported
        const errorMsg = `Speech synthesis error: ${error.error}`;
        console.warn('TTS Error:', errorMsg);
        eventBus.emit(EVENTS.SPEAK_END, { text, persona: personaVoiceConfig, error: errorMsg });
        reject(new Error(errorMsg));
      }
    };
    
    // Start speaking
    speechSynthesis.speak(currentUtterance);
  });
}

// Initialize on load
if (typeof window !== 'undefined') {
  initSpeechSynthesis();
}
