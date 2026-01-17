// Voice Catalog System - manages TTS providers, voices, and presets

// TTS Provider definitions
export const TTS_PROVIDERS = {
  SOPRANO_LOCAL: 'soprano_local',
  KOKORO_LOCAL: 'kokoro_local',
  ELEVENLABS_CLOUD: 'elevenlabs_cloud',
  OPENAI_CLOUD: 'openai_cloud'
};

// Soprano model variants (used as "voices")
export const SOPRANO_MODELS = [
  { id: 'soprano-1.1-80m', name: 'Soprano 1.1 80M', description: 'Fast, balanced quality' },
  { id: 'soprano-80m', name: 'Soprano 80M', description: 'Standard quality model' },
  { id: 'soprano-1.1-300m', name: 'Soprano 1.1 300M', description: 'Higher quality, slower' }
];

// Soprano presets (temperature/top_p/repetition_penalty mappings)
export const SOPRANO_PRESETS = {
  calm: {
    id: 'calm',
    name: 'Calm',
    description: 'Steady, measured speech',
    temperature: 0.7,
    top_p: 0.9,
    repetition_penalty: 1.1
  },
  balanced: {
    id: 'balanced',
    name: 'Balanced',
    description: 'Natural, expressive speech',
    temperature: 0.8,
    top_p: 0.95,
    repetition_penalty: 1.15
  },
  expressive: {
    id: 'expressive',
    name: 'Expressive',
    description: 'Dynamic, emotional speech',
    temperature: 0.9,
    top_p: 0.98,
    repetition_penalty: 1.2
  }
};

// Kokoro voice combinations (supports single or multiple voice pack combos)
export const KOKORO_VOICES = [
  { id: 'af_sky', name: 'Sky', description: 'Default Kokoro voice' },
  { id: 'af_bella', name: 'Bella', description: 'Alternative voice' },
  { id: 'af_sky+af_bella', name: 'Sky + Bella (Mixed)', description: 'Voice combination' }
];

// OpenAI built-in voices
export const OPENAI_VOICES = [
  { id: 'alloy', name: 'Alloy', gender: 'neutral', description: 'Balanced, versatile' },
  { id: 'echo', name: 'Echo', gender: 'male', description: 'Clear, confident' },
  { id: 'fable', name: 'Fable', gender: 'neutral', description: 'Warm, engaging' },
  { id: 'onyx', name: 'Onyx', gender: 'male', description: 'Deep, authoritative' },
  { id: 'nova', name: 'Nova', gender: 'female', description: 'Bright, energetic' },
  { id: 'shimmer', name: 'Shimmer', gender: 'female', description: 'Soft, gentle' }
];

/**
 * List all available TTS providers
 */
export function listTTSProviders() {
  return [
    {
      id: TTS_PROVIDERS.SOPRANO_LOCAL,
      name: 'Soprano TTS (Local)',
      description: 'High-quality English TTS, runs locally',
      requiresApiKey: false,
      available: true // Will be checked dynamically
    },
    {
      id: TTS_PROVIDERS.KOKORO_LOCAL,
      name: 'Kokoro TTS (Local)',
      description: 'Multi-language TTS (EN/JP/CN/VN), runs locally',
      requiresApiKey: false,
      available: true // Will be checked dynamically
    },
    {
      id: TTS_PROVIDERS.ELEVENLABS_CLOUD,
      name: 'ElevenLabs (Cloud)',
      description: 'Premium cloud TTS with natural voices',
      requiresApiKey: true,
      available: false // Check if API key exists
    },
    {
      id: TTS_PROVIDERS.OPENAI_CLOUD,
      name: 'OpenAI TTS (Cloud)',
      description: 'OpenAI text-to-speech API',
      requiresApiKey: true,
      available: false // Check if API key exists
    }
  ];
}

/**
 * List available voices for a provider
 */
export async function listVoices(provider) {
  switch (provider) {
    case TTS_PROVIDERS.SOPRANO_LOCAL:
      // Return Soprano model variants as voices
      return {
        success: true,
        voices: SOPRANO_MODELS,
        presets: Object.values(SOPRANO_PRESETS)
      };

    case TTS_PROVIDERS.KOKORO_LOCAL:
      // Return Kokoro voice combinations
      return {
        success: true,
        voices: KOKORO_VOICES,
        presets: null // Kokoro doesn't use presets like Soprano
      };

    case TTS_PROVIDERS.ELEVENLABS_CLOUD:
      // Call ElevenLabs API to list voices
      try {
        const keyResult = await window.electronAPI?.getApiKey('elevenlabs');
        if (!keyResult?.success || !keyResult?.key) {
          return { success: false, error: 'ElevenLabs API key not configured' };
        }

        const response = await fetch('https://api.elevenlabs.io/v1/voices', {
          headers: {
            'xi-api-key': keyResult.key
          }
        });

        if (!response.ok) {
          return { success: false, error: `ElevenLabs API error: ${response.statusText}` };
        }

        const data = await response.json();
        const voices = data.voices?.map(v => ({
          id: v.voice_id,
          name: v.name,
          description: v.description || '',
          category: v.category || 'premade',
          preview_url: v.preview_url
        })) || [];

        return { success: true, voices, presets: null };
      } catch (error) {
        return { success: false, error: error.message };
      }

    case TTS_PROVIDERS.OPENAI_CLOUD:
      // Return OpenAI built-in voices
      return {
        success: true,
        voices: OPENAI_VOICES,
        presets: null
      };

    default:
      return { success: false, error: `Unknown provider: ${provider}` };
  }
}

/**
 * Set voice selection and persist to settings (using dynamic import)
 */
export async function setVoiceSelection(provider, voiceId, presetId = null, autoVoiceByPersona = false) {
  const { updateSettings } = await import('./appBootstrap');
  
  const updates = {
    ttsProvider: provider,
    voiceId: voiceId || null,
    presetId: presetId || null,
    autoVoiceByPersona
  };

  return updateSettings(updates);
}

/**
 * Test voice by playing sample text
 */
export async function testVoice(text = 'Hello, this is a test of the voice selection.') {
  // Dynamic import to avoid circular dependencies
  const { getSettings } = await import('./appBootstrap');
  const { speak } = await import('./ttsManager');
  const { eventBus, EVENTS } = await import('./eventBus');
  
  const settings = getSettings();
  const provider = settings.ttsProvider || 'soprano_local';
  
  // Check for API keys before testing cloud providers
  if (provider === TTS_PROVIDERS.ELEVENLABS_CLOUD || provider === TTS_PROVIDERS.OPENAI_CLOUD) {
    const providerName = provider === TTS_PROVIDERS.ELEVENLABS_CLOUD ? 'elevenlabs' : 'openai';
    const keyResult = await window.electronAPI?.getApiKey(providerName);
    
    if (!keyResult?.success || !keyResult?.key) {
      const providerDisplayName = provider === TTS_PROVIDERS.ELEVENLABS_CLOUD ? 'ElevenLabs' : 'OpenAI';
      return {
        success: false,
        error: `${providerDisplayName} API key not configured. Please add your API key in the settings above before testing.`
      };
    }
  }
  
  try {
    eventBus.emit(EVENTS.SPEAK_START, { text, test: true });
    const result = await speak(text, null, settings);
    return result;
  } catch (error) {
    // Provide more helpful error messages
    let errorMessage = error.message;
    if (error.message.includes('API key')) {
      if (provider === TTS_PROVIDERS.ELEVENLABS_CLOUD) {
        errorMessage = 'ElevenLabs API key not configured or invalid. Please check your API key in settings.';
      } else if (provider === TTS_PROVIDERS.OPENAI_CLOUD) {
        errorMessage = 'OpenAI API key not configured or invalid. Please check your API key in settings.';
      }
    }
    return { success: false, error: errorMessage };
  }
}
