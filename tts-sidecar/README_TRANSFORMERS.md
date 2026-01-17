# Soprano TTS using Transformers (Simpler Alternative)

This is a simpler alternative to the full `soprano-tts` package. It uses HuggingFace Transformers directly to run the Soprano-1.1-80M model.

## Benefits

- ✅ **Simpler setup**: Just install Transformers, no need for full `soprano-tts` package
- ✅ **Lighter weight**: Fewer dependencies
- ✅ **Same model**: Uses the same `ekwek/Soprano-1.1-80M` model
- ✅ **Compatible**: Same OpenAI-compatible API endpoint

## Installation

```bash
cd /Users/marvens/Desktop/Heilion/tts-sidecar
pip install -r requirements_transformers.txt
```

Or install manually:

```bash
pip install transformers torch torchaudio fastapi uvicorn pydantic
```

## Usage

The app will automatically use this implementation if `soprano_transformers.py` exists in the `tts-sidecar` directory.

Alternatively, run manually:

```bash
cd /Users/marvens/Desktop/Heilion/tts-sidecar
python3 soprano_transformers.py
```

## How It Works

Uses Transformers pipeline:

```python
from transformers import pipeline

pipe = pipeline("text-to-speech", model="ekwek/Soprano-1.1-80M")
result = pipe("Hello, world!")
```

This is simpler than the full `soprano-tts` package and works well for basic TTS needs.

## Requirements

- Python 3.8+ (Transformers supports Python 3.8+)
- `transformers` library
- `torch` and `torchaudio` for audio processing
- FastAPI/uvicorn for the server

## Comparison

| Feature | Transformers | soprano-tts Package |
|---------|-------------|---------------------|
| Setup | Simpler | More complex |
| Dependencies | Fewer | More |
| Python Version | 3.8+ | 3.10+ |
| Features | Basic TTS | Full features + presets |
| Model | Same (Soprano-1.1-80M) | Same |

Use **Transformers** if you want a simpler setup. Use **soprano-tts package** if you need advanced features and presets.
