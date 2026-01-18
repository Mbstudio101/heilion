# Heilion Setup Requirements

## Required System Dependencies

### 1. Node.js & npm
- **Installation**: Download from https://nodejs.org/ or use `brew install node`
- **Version**: Node.js 18+ required
- **Verify**: `node --version` and `npm --version`

### 2. Python 3.8+
- **Installation**: `brew install python3` or download from https://www.python.org/
- **Verify**: `python3 --version`
- **Note**: Required for wake word service and TTS sidecars

### 3. ffmpeg
- **Installation**: `brew install ffmpeg`
- **Verify**: `ffmpeg -version`
- **Required for**: Audio conversion (WebM/MP4 → WAV for Whisper.cpp)

## Optional but Recommended (for Offline Mode)

### 4. Ollama (Local LLM)
- **Installation**: `brew install ollama` or download from https://ollama.ai
- **Verify**: `ollama --version`
- **Setup**: 
  ```bash
  ollama serve  # Start Ollama service
  ollama pull llama2  # Pull a model
  ```

### 5. whisper.cpp (Local STT)
- **Installation**:
  ```bash
  git clone https://github.com/ggerganov/whisper.cpp.git
  cd whisper.cpp
  make
  export PATH="$PATH:$(pwd)"  # Add to PATH
  ```
- **Models**: Download from https://huggingface.co/ggerganov/whisper.cpp/tree/main
- **Verify**: `whisper-cli --help` or `whisper.cpp --help`

### 6. Python Dependencies

#### Wake Word Service
```bash
cd wake-word-sidecar
pip3 install -r requirements.txt
```

#### Soprano TTS (Transformers-based - Recommended)
```bash
cd tts-sidecar
pip3 install -r requirements_transformers.txt
```

#### Soprano TTS (Full Package - Alternative)
```bash
cd tts-sidecar
pip3 install -r requirements.txt
```

## Installation Checklist

- [ ] Node.js 18+ installed
- [ ] npm installed
- [ ] Python 3.8+ installed
- [ ] ffmpeg installed (`brew install ffmpeg`)
- [ ] Ollama installed (for offline LLM) - Optional
- [ ] whisper.cpp installed (for offline STT) - Optional
- [ ] Wake word Python dependencies installed
- [ ] TTS sidecar Python dependencies installed

## Quick Start

1. Install Node.js dependencies:
   ```bash
   npm install
   ```

2. Install Python dependencies:
   ```bash
   cd wake-word-sidecar && pip3 install -r requirements.txt && cd ..
   cd tts-sidecar && pip3 install -r requirements_transformers.txt && cd ..
   ```

3. Install ffmpeg:
   ```bash
   brew install ffmpeg
   ```

4. Run in development:
   ```bash
   npm run dev
   ```

5. Build for production:
   ```bash
   npm run build:mac
   ```

## Troubleshooting

### ffmpeg not found
- **Error**: "ffmpeg not found" in Settings
- **Fix**: `brew install ffmpeg`
- **Verify**: `which ffmpeg` should show `/usr/local/bin/ffmpeg` or `/opt/homebrew/bin/ffmpeg`

### whisper.cpp not found
- **Error**: "Whisper.cpp not found" in Settings
- **Fix**: Install whisper.cpp and add to PATH, or use Cloud STT

### Ollama not detected
- **Error**: "Ollama not running" in Settings
- **Fix**: Start Ollama service: `ollama serve`
- **Verify**: `curl http://localhost:11434/api/tags`

### Python dependencies missing
- **Error**: Sidecar services fail to start
- **Fix**: Install Python dependencies:
  ```bash
  pip3 install -r wake-word-sidecar/requirements.txt
  pip3 install -r tts-sidecar/requirements_transformers.txt
  ```

### Build fails
- **Error**: Missing files during build
- **Fix**: Run `npm run prebuild:mac` manually before building
- **Verify**: Check that `build/main/audioConverter.js` exists
