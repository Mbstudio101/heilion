# Using Cloned Soprano TTS Repository

## Overview

Instead of installing Soprano TTS via pip, you can clone the repository directly into this folder. This makes the app more self-contained.

## Setup Steps

### 1. Clone Soprano TTS Repository

```bash
cd /Users/marvens/Desktop/Heilion/tts-sidecar
git clone https://github.com/ekwek1/soprano.git soprano-repo
```

### 2. Install Dependencies (Still Required)

Even with the cloned repo, you'll still need to install Python dependencies:

```bash
# Install in development mode from cloned repo
cd soprano-repo
pip install -e .  # or python3.10 -m pip install -e . for Python 3.10+

# Or install from cloned repo with requirements
pip install -r requirements.txt  # if requirements.txt exists in repo
```

### 3. The App Will Auto-Detect

The `soprano_server.py` script automatically checks for:
1. Cloned `soprano-repo/` directory (used first)
2. Installed `soprano-tts` package (fallback)

## Important Notes

⚠️ **Python 3.10+ Still Required**: Even with cloned repo, Soprano TTS requires Python 3.10+

📦 **Large Repository**: The cloned repo includes model files and dependencies (~500MB+)

🔄 **Auto-Detection**: The server script will use the cloned repo if it exists, otherwise falls back to installed package

## Git Ignore

The `soprano-repo/` directory is added to `.gitignore` because:
- It's a large repository (~500MB+)
- Can be cloned locally when needed
- Avoids bloating the main repository

## Quick Setup

```bash
# In tts-sidecar directory
git clone https://github.com/ekwek1/soprano.git soprano-repo
cd soprano-repo
python3.10 -m pip install -e .
cd ..
```

Then restart the app - it will automatically use the cloned repo!
