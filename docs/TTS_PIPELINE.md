# Text-to-Speech Pipeline Architecture

## Overview

The Heilion app uses a multi-provider TTS system with automatic fallback. Here's how text flows from input to audio playback.

## Pipeline Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. TEXT INPUT                                                   │
│    - TutorEngine generates feedback/question text              │
│    - Settings panel tests voice                                 │
│    - Any component calls speak(text, persona, settings)        │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. TTS MANAGER (src/utils/ttsManager.js)                       │
│    speak(text, personaVoiceConfig, settings)                    │
│                                                                 │
│    - Loads settings if not provided                            │
│    - Determines provider: soprano_local | kokoro_local |        │
│                          elevenlabs_cloud | openai_cloud        │
│    - Routes to appropriate provider function                    │
└───────────────────────────┬─────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
        ▼                   ▼                   ▼
┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│ LOCAL        │   │ CLOUD        │   │ FALLBACK     │
│ Providers    │   │ Providers    │   │ (Web Speech) │
└──────────────┘   └──────────────┘   └──────────────┘
```

## Provider-Specific Flows

### 1. Soprano TTS (Local) - `soprano_local`

```
┌─────────────────────────────────────────────────────────────┐
│ speakWithSoprano(text, persona, settings)                  │
│                                                             │
│ 1. Emit SPEAK_START event (for UI/orb animation)           │
│ 2. Get voiceId (model) and presetId from settings          │
│ 3. Call window.electronAPI.ttsSpeak(text, {                │
│      provider: 'soprano_local',                             │
│      voiceId: 'soprano-1.1-80m',                           │
│      presetId: 'balanced'                                  │
│    })                                                       │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼ (IPC: Renderer → Main Process)
┌─────────────────────────────────────────────────────────────┐
│ main.js: ipcMain.handle('tts-speak')                       │
│                                                             │
│ - Receives text and settings                                │
│ - Routes to main/ttsHandler.js: speakWithSoprano()         │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│ main/ttsHandler.js: speakWithSoprano()                     │
│                                                             │
│ 1. Get preset (temperature, top_p, repetition_penalty)    │
│ 2. Build HTTP POST request to:                              │
│    http://127.0.0.1:8001/v1/audio/speech                   │
│ 3. Request body: {                                          │
│      input: text,                                           │
│      model: voiceId,                                        │
│      temperature: 0.8,                                      │
│      top_p: 0.95,                                           │
│      repetition_penalty: 1.15                               │
│    }                                                        │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼ (HTTP Request)
┌─────────────────────────────────────────────────────────────┐
│ Soprano Sidecar (Python FastAPI Server)                    │
│ Port: 8001                                                   │
│                                                             │
│ Option A: soprano_transformers.py                           │
│   - Uses HuggingFace Transformers pipeline                  │
│   - Model: ekwek/Soprano-1.1-80M                            │
│   - Generates audio via pipeline("text-to-speech", ...)     │
│                                                             │
│ Option B: soprano_server.py                                 │
│   - Uses soprano-tts package                                │
│   - Full-featured with presets                              │
│                                                             │
│ Both return: WAV audio file (binary)                       │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼ (HTTP Response: WAV binary)
┌─────────────────────────────────────────────────────────────┐
│ main/ttsHandler.js: Receive & Play                          │
│                                                             │
│ 1. Save WAV to temp file:                                   │
│    /tmp/heilion-tts-{timestamp}.wav                         │
│ 2. Play via macOS: afplay "{tempFile}"                      │
│ 3. Clean up temp file after 5 seconds                       │
│ 4. Return { success: true } to renderer                     │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼ (IPC: Main → Renderer)
┌─────────────────────────────────────────────────────────────┐
│ ttsManager.js: speakWithSoprano()                           │
│                                                             │
│ - Emit SPEAK_END event (for UI/orb animation)              │
│ - Return { success: true }                                  │
└─────────────────────────────────────────────────────────────┘
```

### 2. Kokoro TTS (Local) - `kokoro_local`

```
┌─────────────────────────────────────────────────────────────┐
│ speakWithKokoro(text, persona, settings)                   │
│                                                             │
│ 1. Emit SPEAK_START event                                   │
│ 2. Get voiceId from settings (default: 'af_sky')            │
│ 3. Call window.electronAPI.ttsSpeak(text, {                │
│      provider: 'kokoro_local',                              │
│      voiceId: 'af_sky'                                      │
│    })                                                       │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼ (IPC: Renderer → Main)
┌─────────────────────────────────────────────────────────────┐
│ main.js: ipcMain.handle('tts-speak')                       │
│ - Routes to main/ttsHandler.js: speakWithKokoro()          │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│ main/ttsHandler.js: speakWithKokoro()                      │
│                                                             │
│ 1. Build HTTP POST request to:                              │
│    http://127.0.0.1:8880/v1/audio/speech                   │
│ 2. Request body: {                                          │
│      model: 'kokoro',                                       │
│      voice: 'af_sky',                                       │
│      input: text                                            │
│    }                                                        │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼ (HTTP Request)
┌─────────────────────────────────────────────────────────────┐
│ Kokoro Sidecar (Docker or Local)                            │
│ Port: 8880                                                   │
│                                                             │
│ - OpenAI-compatible API                                     │
│ - Multi-language support (EN/JP/CN/VN)                     │
│ - Returns: MP3 audio file (binary)                         │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼ (HTTP Response: MP3 binary)
┌─────────────────────────────────────────────────────────────┐
│ main/ttsHandler.js: Receive & Play                          │
│                                                             │
│ 1. Save MP3 to temp file                                    │
│ 2. Play via macOS: afplay "{tempFile}"                      │
│ 3. Clean up temp file                                        │
│ 4. Return { success: true }                                 │
└─────────────────────────────────────────────────────────────┘
```

### 3. ElevenLabs TTS (Cloud) - `elevenlabs_cloud`

```
┌─────────────────────────────────────────────────────────────┐
│ speakWithElevenLabs(text, persona, settings)               │
│                                                             │
│ 1. Emit SPEAK_START event                                   │
│ 2. Get API key from keytar (secure storage)                 │
│ 3. Get voiceId from settings                                │
│ 4. Fetch POST to:                                           │
│    https://api.elevenlabs.io/v1/text-to-speech/{voiceId}   │
│ 5. Request body: {                                          │
│      text: text,                                            │
│      model_id: 'eleven_monolingual_v1',                     │
│      voice_settings: { stability: 0.5, ... }               │
│    }                                                        │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼ (HTTP Response: MP3 binary)
┌─────────────────────────────────────────────────────────────┐
│ ttsManager.js: Receive & Play                               │
│                                                             │
│ 1. Convert response to Blob                                 │
│ 2. Create Audio element: new Audio(blobUrl)                 │
│ 3. Play audio element (browser handles playback)            │
│ 4. On end: Emit SPEAK_END event                            │
│ 5. Return { success: true }                                 │
└─────────────────────────────────────────────────────────────┘
```

### 4. OpenAI TTS (Cloud) - `openai_cloud`

```
┌─────────────────────────────────────────────────────────────┐
│ speakWithOpenAI(text, persona, settings)                   │
│                                                             │
│ 1. Emit SPEAK_START event                                   │
│ 2. Get API key from keytar                                  │
│ 3. Get voiceId from settings (default: 'alloy')            │
│ 4. Fetch POST to:                                          │
│    https://api.openai.com/v1/audio/speech                  │
│ 5. Request body: {                                          │
│      model: 'tts-1',                                        │
│      input: text,                                           │
│      voice: 'alloy'                                         │
│    }                                                        │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼ (HTTP Response: MP3 binary)
┌─────────────────────────────────────────────────────────────┐
│ ttsManager.js: Receive & Play                               │
│                                                             │
│ 1. Convert response to Blob                                 │
│ 2. Create Audio element: new Audio(blobUrl)                 │
│ 3. Play audio element                                       │
│ 4. On end: Emit SPEAK_END event                            │
│ 5. Return { success: true }                                 │
└─────────────────────────────────────────────────────────────┘
```

### 5. Web Speech API (Fallback)

```
┌─────────────────────────────────────────────────────────────┐
│ speakWithWebSpeech(text, persona, settings)                 │
│                                                             │
│ 1. Emit SPEAK_START event                                   │
│ 2. Initialize SpeechSynthesis if needed                      │
│ 3. Create SpeechSynthesisUtterance:                         │
│    - text: text                                             │
│    - lang: settings.language                                │
│    - voice: selected voice                                  │
│    - rate: settings.rate                                    │
│ 4. speechSynthesis.speak(utterance)                         │
│ 5. On end: Emit SPEAK_END event                            │
│ 6. Return { success: true }                                 │
└─────────────────────────────────────────────────────────────┘
```

## Event System

The TTS pipeline uses an event bus for UI updates:

```javascript
// Events emitted during TTS
EVENTS.SPEAK_START  // When TTS begins
EVENTS.SPEAK_END    // When TTS completes

// Components listening:
- AIOrb: Changes to "speaking" state
- TutorScreen: Updates status text
- WakeWordManager: Pauses wake word detection
```

## Fallback Chain

```
1. Try selected provider (soprano_local, kokoro_local, etc.)
   │
   ├─ Success → Play audio → Done
   │
   └─ Failure → Fallback:
      │
      ├─ Local providers → Fallback to Web Speech API
      │
      └─ Cloud providers → Show error (no fallback)
```

## Key Files

- **Entry Point**: `src/utils/ttsManager.js` - `speak()` function
- **Provider Functions**: `src/utils/ttsManager.js` - `speakWith*()` functions
- **Main Process Handler**: `main.js` - `ipcMain.handle('tts-speak')`
- **Local TTS Handlers**: `main/ttsHandler.js` - `speakWithSoprano()`, `speakWithKokoro()`
- **Sidecar Servers**: 
  - `tts-sidecar/soprano_transformers.py` - Transformers-based Soprano
  - `tts-sidecar/soprano_server.py` - Full Soprano package
- **Voice Catalog**: `src/utils/ttsVoiceCatalog.js` - Provider/voice management
- **Event Bus**: `src/utils/eventBus.js` - SPEAK_START/END events

## Settings Flow

User selects provider in Settings:
1. `SettingsPanel.js` → `setVoiceSelection(provider, voiceId, presetId)`
2. Updates settings in database via `appBootstrap.js`
3. Settings persist and are used by `ttsManager.js` on next `speak()` call
