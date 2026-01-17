# Soprano TTS Setup Guide

## Why Not Bundle Soprano in the Folder?

**Short answer: No, don't add Soprano TTS package files directly to the folder.**

### Recommended Approach (Standard Python Package Installation)

Soprano TTS should be installed as a Python package dependency using pip:

```bash
pip3 install soprano-tts
```

This is the standard and recommended approach because:
1. ✅ **Cleaner**: Uses Python's package manager (pip)
2. ✅ **Automatic updates**: Easy to update with `pip install --upgrade soprano-tts`
3. ✅ **Dependencies handled**: pip automatically installs required dependencies
4. ✅ **Standard practice**: Follows Python packaging conventions
5. ✅ **Smaller repo**: Doesn't bloat your repository with large package files

### Current Setup

The app is already configured to:
- Run Soprano as a **sidecar process** (separate Python process)
- Automatically **fall back to Web Speech API** if Soprano isn't available
- Work **out-of-the-box** with Web Speech API (no installation needed)

### Installation Steps

#### Option 1: Upgrade Python to 3.10+ (for Soprano)

```bash
# Install Python 3.10+ via Homebrew
brew install python@3.10

# Install Soprano TTS with Python 3.10+
python3.10 -m pip install soprano-tts uvicorn

# Update main.js to use python3.10 for Soprano sidecar if needed
```

#### Option 2: Use Web Speech API (No Installation)

The app **already works** with Web Speech API without any installation:
- ✅ Multilingual support (many languages)
- ✅ No Python dependency
- ✅ Works with your current Python 3.9.6
- ✅ **This is the default** and works immediately

### What's in the tts-sidecar Folder?

The `tts-sidecar/` folder contains:
- `soprano_server.py` - Script to start Soprano TTS server
- `requirements.txt` - List of Python dependencies (pip install -r requirements.txt)
- `README.md` - Documentation

**Not included**: Soprano TTS package files (installed via pip instead)

### Summary

- ❌ **Don't add** Soprano package files to the folder
- ✅ **Do install** Soprano via pip: `pip3 install soprano-tts` (requires Python 3.10+)
- ✅ **Or use** Web Speech API (already working, no installation needed)

The app gracefully handles both options and falls back automatically.
