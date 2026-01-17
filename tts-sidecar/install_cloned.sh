#!/bin/bash
# Install Soprano TTS from cloned repository

echo "🔍 Checking Python version..."
python_version=$(python3 --version | cut -d' ' -f2 | cut -d'.' -f1,2)
required_version="3.10"

if [ "$(printf '%s\n' "$required_version" "$python_version" | sort -V | head -n1)" != "$required_version" ]; then
    echo "⚠️  Python 3.10+ required (you have Python $python_version)"
    echo "   Please install Python 3.10+ first:"
    echo "   brew install python@3.10"
    exit 1
fi

echo "✓ Python version OK: $(python3 --version)"

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
SOPRANO_REPO="$SCRIPT_DIR/soprano-repo"

if [ ! -d "$SOPRANO_REPO" ]; then
    echo "📦 Cloning Soprano TTS repository..."
    cd "$SCRIPT_DIR"
    git clone https://github.com/ekwek1/soprano.git soprano-repo
    if [ $? -ne 0 ]; then
        echo "❌ Failed to clone Soprano repository"
        exit 1
    fi
else
    echo "✓ Soprano repository already exists"
fi

echo ""
echo "📥 Installing Soprano TTS from cloned repository..."
cd "$SOPRANO_REPO"

# Try to install in editable mode (development install)
if [ -f "pyproject.toml" ]; then
    echo "Installing from pyproject.toml..."
    python3 -m pip install -e .
elif [ -f "setup.py" ]; then
    echo "Installing from setup.py..."
    python3 -m pip install -e .
else
    echo "⚠️  Could not find installation files. Installing dependencies manually..."
    python3 -m pip install uvicorn requests
fi

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Soprano TTS installed successfully from cloned repository!"
    echo ""
    echo "🎉 The app will automatically use the cloned Soprano TTS."
    echo "   You can now select 'Soprano TTS' in settings."
else
    echo ""
    echo "❌ Installation failed. Please check the error messages above."
    exit 1
fi
