# Heilion

AI-powered study tutor with voice interaction for macOS. Import PowerPoint presentations, generate study questions, and practice with hands-free voice tutoring sessions powered by local or cloud AI.

## Features

- **PPTX Import**: Extract slides and notes from PowerPoint presentations
- **Question Generation**: Automatically generate 20+ questions from deck content
- **Voice Tutoring**: Hands-free tutoring sessions with wake word activation
- **12 Zodiac Personas**: "Hey Aries", "Hey Virgo", etc. - each with unique teaching style
- **Offline-First**: Works fully offline with local Whisper STT + Ollama LLM + macOS TTS
- **Cloud Fallback**: Optional cloud providers with automatic fallback to local
- **Mastery Tracking**: Tracks your progress and adapts questions based on weakest concepts

## Prerequisites

### Required
- macOS (tested on macOS 13+)
- Node.js 18+ and npm
- Python 3.8+ (for wake word service)

### For Offline Mode (Recommended)
1. **Ollama** - Local LLM
   ```bash
   # Install Ollama from https://ollama.ai
   brew install ollama
   
   # Start Ollama service
   ollama serve
   
   # Pull a model (e.g., llama2)
   ollama pull llama2
   ```

2. **whisper.cpp** - Local Speech-to-Text
   ```bash
   # Install whisper.cpp
   git clone https://github.com/ggerganov/whisper.cpp.git
   cd whisper.cpp
   make
   
   # Add to PATH or update main.js with full path
   export PATH="$PATH:$(pwd)"
   ```

3. **Wake Word Service** - Hands-free activation
   ```bash
   # Navigate to wake-word-sidecar directory
   cd wake-word-sidecar
   
   # Install Python dependencies
   pip3 install -r requirements.txt
   
   # Make script executable
   chmod +x wake_service.py
   ```

## Installation

1. Clone or download this repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. The wake word service will start automatically when you run the app. If it fails to start, the app will fall back to push-to-talk mode.

## Development

Run in development mode:
```bash
npm run dev
```

This will:
- Start React dev server on http://localhost:3000
- Launch Electron app connected to dev server
- Start wake word sidecar (if available)

## Building

Build for macOS:
```bash
npm run build:mac
```

The built app will be in `dist/` directory.

## Usage

### Importing a PPTX

1. Click "Import PPTX" on the library screen
2. Select a `.pptx` file
3. Wait for processing (slides extracted, questions generated)
4. Your deck will appear in the library

### Starting a Tutor Session

1. Click "Start Tutor Session" on any deck
2. The voice-mode screen appears with the AI orb
3. Wait for the question to be spoken (or start recording manually)

### Wake Word Activation

Say one of the 12 zodiac wake phrases:
- "Hey Aries"
- "Hey Taurus"
- "Hey Gemini"
- "Hey Cancer"
- "Hey Leo"
- "Hey Virgo"
- "Hey Libra"
- "Hey Scorpio"
- "Hey Sagittarius"
- "Hey Capricorn"
- "Hey Aquarius"
- "Hey Pisces"

The tutor will respond in that persona's teaching style.

### Manual Recording

If wake word is unavailable, click "Start Recording" button to record your answer manually.

### Settings

Click the gear icon (⚙️) to open settings:

- **Provider Preset**: Choose "Offline-First" or "Best Accuracy (Cloud)"
- **STT Provider**: Local (Whisper.cpp) or Cloud
- **LLM Provider**: Local (Ollama) or Cloud
- **TTS Provider**: Local (macOS system voice)
- **Wake Word**: Enable/disable wake word detection
- **Persona**: Manually select a zodiac persona
- **Difficulty**: Easy, Medium, or Hard

## Architecture

### Main Process (`main.js`)
- Manages SQLite database
- Handles PPTX file selection
- Starts/stops wake word sidecar
- Provides IPC handlers for database, STT, LLM, TTS

### Renderer Process (React)
- UI components (Library, Tutor, Settings)
- Voice capture and audio streaming
- WebSocket connection to wake word service
- Tutor session logic

### Wake Word Sidecar (`wake-word-sidecar/wake_service.py`)
- Always-on wake word detection
- Listens for 12 persona phrases
- WebSocket server on port 8765
- Streams audio from Electron main process

### Database Schema
- `decks`: Imported PPTX files
- `slides`: Extracted slide content
- `questions`: Generated questions
- `attempts`: User answers and grades
- `mastery`: Concept mastery tracking

## Troubleshooting

### Wake Word Not Working
- Check Python dependencies: `pip3 install -r wake-word-sidecar/requirements.txt`
- Ensure microphone permission is granted
- Check console for sidecar errors
- App will automatically fall back to push-to-talk

### Ollama Not Detected
- Ensure Ollama is running: `ollama serve`
- Check it's accessible: `curl http://localhost:11434/api/tags`
- App will show "Not running" in settings if unavailable

### Whisper.cpp Not Found
- Ensure whisper.cpp is in PATH or update path in `main.js`
- Test manually: `whisper.cpp --help`

### PPTX Import Fails
- Ensure file is a valid `.pptx` format
- Check console for parsing errors
- Some complex PPTX files may not parse fully

## Persona Styles

Each zodiac persona has a unique teaching style:

- **Aries**: Enthusiastic, direct, motivational
- **Taurus**: Patient, methodical, thorough
- **Gemini**: Engaging, versatile, conversational
- **Cancer**: Nurturing, supportive, empathetic
- **Leo**: Confident, inspiring, celebratory
- **Virgo**: Precise, detail-oriented, analytical
- **Libra**: Balanced, diplomatic, fair
- **Scorpio**: Intense, insightful, deep
- **Sagittarius**: Adventurous, philosophical, expansive
- **Capricorn**: Structured, disciplined, organized
- **Aquarius**: Innovative, forward-thinking, creative
- **Pisces**: Intuitive, compassionate, imaginative

## License

MIT License

## Contributing

Contributions welcome! Please ensure:
- Code follows existing patterns
- No breaking changes to UI layout/sizing
- All features work in offline mode
- Wake word detection works without internet
