# Soprano TTS Sidecar

This sidecar provides ultra-high-quality English text-to-speech using [Soprano TTS](https://github.com/ekwek1/soprano).

## Requirements

- **Python 3.10 or higher** (required for Soprano TTS)
- pip3

## Installation

```bash
cd /Users/marvens/Desktop/Heilion/tts-sidecar
pip3 install -r requirements.txt
```

If you have Python 3.9 or lower, you'll need to upgrade Python first. Soprano TTS requires Python 3.10+.

## Status

- ✅ **Web Speech API** (Default): Works with Python 3.9+ and supports multiple languages
- ⚠️ **Soprano TTS**: Requires Python 3.10+ for ultra-high-quality English TTS

The app will automatically use Web Speech API if Soprano is not available.

## Manual Installation with Python 3.10+

If you have Python 3.10+ installed:

```bash
# Use python3.10+ explicitly
python3.10 -m pip install soprano-tts uvicorn
```

Or install Python 3.10+ via Homebrew:

```bash
brew install python@3.10
python3.10 -m pip install soprano-tts uvicorn
```
