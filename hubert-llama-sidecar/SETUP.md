# HuBERT + Llama 3 Setup Guide

## Quick Start

### 1. Install Dependencies

On macOS, use `pip3` (not `pip`):

```bash
cd hubert-llama-sidecar
pip3 install -r requirements.txt
```

Or if `pip3` is not available:

```bash
python3 -m pip install -r requirements.txt
```

### 2. Set Up HuggingFace Access Token

Llama 3 requires a HuggingFace account and access token:

1. **Create HuggingFace account**: https://huggingface.co/join
2. **Request Llama 3 access**: https://huggingface.co/meta-llama/Llama-3-8B-Instruct
   - Click "Request access" and wait for approval (usually instant)
3. **Get your token**: https://huggingface.co/settings/tokens
   - Create a token with "Read" permissions
4. **Set the token**:

```bash
# Option 1: Environment variable
export HF_TOKEN=your_token_here

# Option 2: Login via CLI
pip3 install huggingface-hub
huggingface-cli login
# Enter your token when prompted
```

### 3. Test the Service

```bash
python3 hubert_llama_service.py
```

You should see:
```
🚀 HuBERT + Llama 3 Service initializing...
   Device: cpu (or cuda if GPU available)
📦 Loading HuBERT model...
✓ HuBERT loaded
📦 Loading Llama 3 (8B) model...
✓ Llama 3 (8B) loaded
🌐 Starting HuBERT + Llama 3 service on ws://localhost:8766
✅ Service ready. Waiting for connections...
```

### 4. Troubleshooting

#### "pip: command not found"
- Use `pip3` instead of `pip`
- Or use `python3 -m pip`

#### "Model not found" or "401 Unauthorized"
- Make sure you have HuggingFace access token set
- Request access to Llama 3 model
- Run: `huggingface-cli login`

#### "Out of memory" errors
- The service uses 4-bit quantization by default
- Close other applications
- Consider using a smaller model (Llama 3.2 3B)

#### "fairseq installation failed"
- Fairseq can be tricky to install
- Try: `pip3 install --upgrade setuptools wheel`
- Then retry: `pip3 install -r requirements.txt`

#### Service won't start
- Check Python version: `python3 --version` (needs 3.8+)
- Check if port 8766 is available
- Check logs for specific error messages

## System Requirements

- **Python**: 3.8 or higher
- **RAM**: 8GB minimum (16GB+ recommended)
- **Disk**: ~20GB for models (downloaded on first use)
- **Internet**: Required for initial model download

## Next Steps

Once the service is running, you can:
1. Enable it in Heilion Settings → Speech-to-Text → "HuBERT + Llama 3 (Multimodal)"
2. The app will automatically connect to the service
3. Start using multimodal speech understanding!
