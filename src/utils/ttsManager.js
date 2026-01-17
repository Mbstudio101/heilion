// Multilingual Text-to-Speech manager using Web Speech API
import { eventBus, EVENTS } from './eventBus';
import { getSettings } from './appBootstrap';

// Re-export voice catalog functions
export { listTTSProviders, listVoices, setVoiceSelection, testVoice } from './ttsVoiceCatalog';

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
    const ttsProvider = settings.ttsProvider || 'soprano_local';
    
    // Route to appropriate provider
    if (ttsProvider === 'soprano_local') {
      return await speakWithSoprano(text, personaVoiceConfig, settings);
    } else if (ttsProvider === 'kokoro_local') {
      return await speakWithKokoro(text, personaVoiceConfig, settings);
    } else if (ttsProvider === 'elevenlabs_cloud') {
      return await speakWithElevenLabs(text, personaVoiceConfig, settings);
    } else if (ttsProvider === 'openai_cloud') {
      return await speakWithOpenAI(text, personaVoiceConfig, settings);
    } else {
      // Fallback to Soprano or Web Speech
      return await speakWithSoprano(text, personaVoiceConfig, settings);
    }
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
    
    // Get model variant and preset from settings
    const voiceId = settings.voiceId || 'soprano-1.1-80m';
    const presetId = settings.presetId || 'balanced';
    
    // Use Soprano via IPC (calls main process which communicates with sidecar)
    // Pass voiceId (model) and presetId (temperature/top_p/repetition_penalty)
    if (window.electronAPI?.ttsSpeak) {
      const result = await window.electronAPI.ttsSpeak(text, {
        provider: 'soprano_local',
        voiceId,
        presetId
      });
      
      // If Soprano fails, fall back to Web Speech API (silently in production, verbose in dev)
      if (!result.success) {
        // Only log once to avoid console spam - this is expected if Soprano sidecar isn't running
        if (process.env.NODE_ENV === 'development') {
          console.debug('Soprano TTS not available, using Web Speech API (this is normal if Soprano sidecar is not running)');
        }
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
    // If Soprano fails, fall back to Web Speech API (silently - expected if sidecar isn't running)
    if (process.env.NODE_ENV === 'development') {
      console.debug('Soprano TTS error, using Web Speech API fallback');
    }
    eventBus.emit(EVENTS.SPEAK_END, { text, persona: personaVoiceConfig, interrupted: true });
    
    // Fall back to Web Speech API
    return await speakWithWebSpeech(text, personaVoiceConfig, settings);
  }
}

// ElevenLabs TTS integration
async function speakWithElevenLabs(text, personaVoiceConfig, settings) {
  try {
    // Emit speak start event
    eventBus.emit(EVENTS.SPEAK_START, { text, persona: personaVoiceConfig });
    
    // Get API key
    const keyResult = await window.electronAPI?.getApiKey('elevenlabs');
    if (!keyResult?.success || !keyResult?.key) {
      throw new Error('ElevenLabs API key not configured');
    }
    
    // Get voice ID from settings
    const voiceId = settings.voiceId || '21m00Tcm4TlvDq8ikWAM'; // Default: Rachel
    
    // Call ElevenLabs API
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'Accept': 'audio/mpeg',
        'Content-Type': 'application/json',
        'xi-api-key': keyResult.key
      },
      body: JSON.stringify({
        text: text,
        model_id: 'eleven_monolingual_v1',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75
        }
      })
    });
    
    if (!response.ok) {
      throw new Error(`ElevenLabs API error: ${response.statusText}`);
    }
    
    // Convert response to blob and play via audio element
    const audioBlob = await response.blob();
    const audioUrl = URL.createObjectURL(audioBlob);
    const audio = new Audio(audioUrl);
    
    // Setup WebAudio analyser for amplitude tracking
    let audioContext = null;
    let analyser = null;
    let source = null;
    let amplitudeInterval = null;
    
    try {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      source = audioContext.createMediaElementSource(audio);
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      source.connect(analyser);
      analyser.connect(audioContext.destination);
      
      // Emit amplitude levels during playback (~30-60 times/sec)
      const emitAmplitude = () => {
        if (!analyser || audio.paused || audio.ended) {
          if (amplitudeInterval) {
            clearInterval(amplitudeInterval);
            amplitudeInterval = null;
          }
          return;
        }
        
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        analyser.getByteTimeDomainData(dataArray);
        
        // Calculate RMS amplitude
        let sumSquares = 0;
        for (let i = 0; i < bufferLength; i++) {
          const normalized = (dataArray[i] - 128) / 128;
          sumSquares += normalized * normalized;
        }
        const rms = Math.sqrt(sumSquares / bufferLength);
        const level = Math.min(rms * 2, 1); // Normalize to 0..1
        
        eventBus.emit(EVENTS.SPEAK_LEVEL, { level });
      };
      
      // Start amplitude tracking (~50 times/sec)
      amplitudeInterval = setInterval(emitAmplitude, 20);
    } catch (error) {
      // WebAudio not available - continue without amplitude tracking
      console.debug('WebAudio not available for amplitude tracking:', error);
    }
    
    return new Promise((resolve, reject) => {
      audio.onended = () => {
        if (amplitudeInterval) {
          clearInterval(amplitudeInterval);
          amplitudeInterval = null;
        }
        if (audioContext && audioContext.state !== 'closed') {
          audioContext.close().catch(() => {});
        }
        URL.revokeObjectURL(audioUrl);
        eventBus.emit(EVENTS.SPEAK_END, { text, persona: personaVoiceConfig });
        resolve({ success: true });
      };
      
      audio.onerror = (error) => {
        if (amplitudeInterval) {
          clearInterval(amplitudeInterval);
          amplitudeInterval = null;
        }
        if (audioContext && audioContext.state !== 'closed') {
          audioContext.close().catch(() => {});
        }
        URL.revokeObjectURL(audioUrl);
        eventBus.emit(EVENTS.SPEAK_END, { text, persona: personaVoiceConfig, error: error.message });
        reject(new Error(`Audio playback error: ${error.message}`));
      };
      
      audio.play().catch(reject);
    });
  } catch (error) {
    eventBus.emit(EVENTS.SPEAK_END, { text, persona: personaVoiceConfig, error: error.message });
    return { success: false, error: error.message };
  }
}

// Kokoro TTS integration (Multi-language, local OpenAI-compatible API)
async function speakWithKokoro(text, personaVoiceConfig, settings) {
  try {
    // Emit speak start event
    eventBus.emit(EVENTS.SPEAK_START, { text, persona: personaVoiceConfig });
    
    // Get voice ID from settings (default: af_sky)
    const voiceId = settings.voiceId || 'af_sky';
    
    // Use Kokoro via IPC (calls main process which communicates with sidecar)
    if (window.electronAPI?.ttsSpeak) {
      const result = await window.electronAPI.ttsSpeak(text, {
        provider: 'kokoro_local',
        voiceId
      });
      
      if (result.success) {
        eventBus.emit(EVENTS.SPEAK_END, { text, persona: personaVoiceConfig });
        return { success: true };
      } else {
        eventBus.emit(EVENTS.SPEAK_END, { text, persona: personaVoiceConfig, error: result.error });
        return { success: false, error: result.error };
      }
    } else {
      // Fallback to Web Speech API if Kokoro not available
      console.debug('Kokoro TTS not available via IPC, falling back to Web Speech API');
      return await speakWithWebSpeech(text, personaVoiceConfig, settings);
    }
  } catch (error) {
    eventBus.emit(EVENTS.SPEAK_END, { text, persona: personaVoiceConfig, error: error.message });
    return { success: false, error: error.message };
  }
}

// OpenAI TTS integration
async function speakWithOpenAI(text, personaVoiceConfig, settings) {
  try {
    // Emit speak start event
    eventBus.emit(EVENTS.SPEAK_START, { text, persona: personaVoiceConfig });
    
    // Get API key
    const keyResult = await window.electronAPI?.getApiKey('openai');
    if (!keyResult?.success || !keyResult?.key) {
      throw new Error('OpenAI API key not configured');
    }
    
    // Get voice ID from settings (default: alloy)
    const voiceId = settings.voiceId || 'alloy';
    
    // Call OpenAI TTS API
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${keyResult.key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'tts-1',
        input: text,
        voice: voiceId
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`OpenAI API error: ${errorData.error?.message || response.statusText}`);
    }
    
    // Convert response to blob and play via audio element
    const audioBlob = await response.blob();
    const audioUrl = URL.createObjectURL(audioBlob);
    const audio = new Audio(audioUrl);
    
    // Setup WebAudio analyser for amplitude tracking
    let audioContext = null;
    let analyser = null;
    let source = null;
    let amplitudeInterval = null;
    
    try {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      source = audioContext.createMediaElementSource(audio);
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      source.connect(analyser);
      analyser.connect(audioContext.destination);
      
      // Emit amplitude levels during playback (~30-60 times/sec)
      const emitAmplitude = () => {
        if (!analyser || audio.paused || audio.ended) {
          if (amplitudeInterval) {
            clearInterval(amplitudeInterval);
            amplitudeInterval = null;
          }
          return;
        }
        
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        analyser.getByteTimeDomainData(dataArray);
        
        // Calculate RMS amplitude
        let sumSquares = 0;
        for (let i = 0; i < bufferLength; i++) {
          const normalized = (dataArray[i] - 128) / 128;
          sumSquares += normalized * normalized;
        }
        const rms = Math.sqrt(sumSquares / bufferLength);
        const level = Math.min(rms * 2, 1); // Normalize to 0..1
        
        eventBus.emit(EVENTS.SPEAK_LEVEL, { level });
      };
      
      // Start amplitude tracking (~50 times/sec)
      amplitudeInterval = setInterval(emitAmplitude, 20);
    } catch (error) {
      // WebAudio not available - continue without amplitude tracking
      console.debug('WebAudio not available for amplitude tracking:', error);
    }
    
    return new Promise((resolve, reject) => {
      audio.onended = () => {
        if (amplitudeInterval) {
          clearInterval(amplitudeInterval);
          amplitudeInterval = null;
        }
        if (audioContext && audioContext.state !== 'closed') {
          audioContext.close().catch(() => {});
        }
        URL.revokeObjectURL(audioUrl);
        eventBus.emit(EVENTS.SPEAK_END, { text, persona: personaVoiceConfig });
        resolve({ success: true });
      };
      
      audio.onerror = (error) => {
        if (amplitudeInterval) {
          clearInterval(amplitudeInterval);
          amplitudeInterval = null;
        }
        if (audioContext && audioContext.state !== 'closed') {
          audioContext.close().catch(() => {});
        }
        URL.revokeObjectURL(audioUrl);
        eventBus.emit(EVENTS.SPEAK_END, { text, persona: personaVoiceConfig, error: error.message });
        reject(new Error(`Audio playback error: ${error.message}`));
      };
      
      audio.play().catch(reject);
    });
  } catch (error) {
    eventBus.emit(EVENTS.SPEAK_END, { text, persona: personaVoiceConfig, error: error.message });
    return { success: false, error: error.message };
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
