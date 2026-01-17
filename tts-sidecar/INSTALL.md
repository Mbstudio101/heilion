# Installing Soprano TTS

## Quick Install Guide

### Current Status
- ❌ **Soprano TTS**: Requires Python 3.10+ (you have Python 3.9.6)
- ✅ **Web Speech API**: Already working (no installation needed)

### Option 1: Upgrade to Python 3.10+ for Soprano

```bash
# Install Python 3.10 via Homebrew
brew install python@3.10

# Wait for installation to complete (may take a few minutes)

# After installation, use Python 3.10 to install Soprano
python3.10 -m pip install soprano-tts uvicorn

# Verify installation
python3.10 -c "import soprano; print('✓ Soprano installed successfully')"
```

### Option 2: Use Web Speech API (Recommended - Already Working)

**You don't need to install anything!** The app already works with Web Speech API:
- ✅ Multilingual support (many languages)
- ✅ No Python dependency
- ✅ Works with your current Python 3.9.6
- ✅ **This is the default** and works immediately

Just use the app - it will automatically use Web Speech API.

### If You Want to Use Soprano After Installing Python 3.10

1. Install Python 3.10:
   ```bash
   brew install python@3.10
   ```

2. Install Soprano:
   ```bash
   python3.10 -m pip install soprano-tts uvicorn
   ```

3. The app will automatically detect Soprano when you select "Soprano TTS" in settings.

### Troubleshooting

**Error: "pip: command not found"**
- Use `pip3` instead of `pip`, or `python3 -m pip`

**Error: "Requires-Python >=3.10"**
- You need Python 3.10+. Install via: `brew install python@3.10`
- Then use: `python3.10 -m pip install soprano-tts`

**Soprano sidecar won't start**
- Check Python 3.10 is installed: `python3.10 --version`
- Check Soprano is installed: `python3.10 -c "import soprano"`
- The app will automatically fall back to Web Speech API if Soprano isn't available
