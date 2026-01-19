# HuBERT + Llama 3 (8B) Speech Understanding Service

Custom multimodal speech understanding integration for Heilion AI Tutor.

## Overview

This service combines:
- **HuBERT** (Facebook AI) - Speech encoder that extracts rich speech representations
- **Llama 3 (8B)** - Large language model for understanding and generating responses

Together, they create a unified audio → understanding pipeline that's better than separate STT + LLM steps.

## Architecture

```
Audio (WAV) → HuBERT Encoder → Speech Tokens → Llama 3 (8B) → Text Response
```

### Key Features

- **Unified Processing**: Single model pipeline for speech understanding
- **Better Accuracy**: LLM context improves speech recognition
- **Context Aware**: Can use course context for better tutoring responses
- **Memory Efficient**: 4-bit quantization support for lower memory usage

## Prerequisites

### Required
- Python 3.8+
- PyTorch 2.0+
- 8GB+ RAM (16GB+ recommended)
- HuggingFace account with access to Llama 3

### HuggingFace Access Token

Llama 3 requires a HuggingFace access token:
1. Create account at https://huggingface.co
2. Request access to Llama 3: https://huggingface.co/meta-llama/Llama-3-8B-Instruct
3. Get your token: https://huggingface.co/settings/tokens
4. Set environment variable: `export HF_TOKEN=your_token_here`
5. Or login: `huggingface-cli login`

## Installation

```bash
cd hubert-llama-sidecar
pip install -r requirements.txt
```

## Usage

### Start the service:

```bash
python hubert_llama_service.py [port]
```

Default port: `8766`

### WebSocket API

The service exposes a WebSocket API on `ws://localhost:8766`

#### Messages

**Ping (keep-alive)**
```json
{
  "type": "ping"
}
```

**Load Models**
```json
{
  "type": "load_models"
}
```

**Transcribe and Understand**
```json
{
  "type": "transcribe",
  "audio_path": "/path/to/audio.wav",
  "context": "Optional context about the course/conversation"
}
```

**Response**
```json
{
  "type": "result",
  "success": true,
  "transcript": "Transcribed text",
  "response": "LLM response text",
  "speech_features_shape": [1, 1500, 1024]
}
```

## Integration with Heilion

This service integrates with Heilion's main process via:
- `main/sidecarManager.js` - Manages service lifecycle
- `main.js` - IPC handlers
- `src/utils/sttManager.js` - STT manager integration

## Model Details

### HuBERT Model
- **Name**: `facebook/hubert-large-ls960-ft`
- **Purpose**: Speech encoding
- **Input**: 16kHz mono WAV audio
- **Output**: Speech embeddings/tokens

### Llama 3 Model
- **Name**: `meta-llama/Llama-3-8B-Instruct`
- **Purpose**: Understanding and generation
- **Quantization**: 4-bit (optional) for memory efficiency
- **Input**: Speech tokens + text context
- **Output**: Transcribed text + response

## Performance

- **First Run**: ~30-60s (model loading)
- **Subsequent**: ~2-5s per 30s audio clip
- **Memory**: ~8-12GB RAM (with 4-bit quantization)
- **GPU**: Significant speedup if CUDA available

## Limitations

1. **Model Size**: Requires significant memory (8GB+)
2. **HuggingFace Access**: Llama 3 requires HF account and approval
3. **First Load**: Slow initial model loading
4. **Fine-tuning**: Currently uses pre-trained models (fine-tuning would improve accuracy)

## Future Improvements

- [ ] Fine-tune on tutoring conversations
- [ ] Add streaming support for real-time transcription
- [ ] Implement learned adapter layer (instead of text-based prompt)
- [ ] Support for longer audio clips (chunking strategy)
- [ ] Integration with course context (RAG)

## Troubleshooting

### "Model not found" error
- Make sure you have HuggingFace access token set
- Request access to Llama 3 model
- Run: `huggingface-cli login`

### Out of memory errors
- Enable 4-bit quantization (already enabled by default)
- Close other applications
- Use smaller models (consider Llama 3.2 3B)

### Slow performance
- Use GPU if available (CUDA)
- Reduce max_new_tokens in generation
- Use smaller chunk durations

## License

Same as Heilion project. Model licenses:
- HuBERT: CC-BY-NC 4.0
- Llama 3: Custom Meta license (requires approval)
