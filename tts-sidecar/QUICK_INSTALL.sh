#!/bin/bash
# Quick install script for Soprano TTS
# Requires Python 3.10+

echo "🔍 Checking Python version..."
python3 --version

echo ""
echo "📦 Installing Python 3.10 via Homebrew..."
brew install python@3.10

echo ""
echo "⏳ Waiting for installation to complete..."
sleep 2

echo ""
echo "✅ Verifying Python 3.10 installation..."
python3.10 --version

if [ $? -eq 0 ]; then
    echo ""
    echo "📥 Installing Soprano TTS and dependencies..."
    python3.10 -m pip install soprano-tts uvicorn
    
    echo ""
    echo "✅ Installation complete!"
    echo ""
    echo "🎉 Soprano TTS is now installed. The app will automatically use it when you select 'Soprano TTS' in settings."
else
    echo ""
    echo "❌ Python 3.10 installation failed. Please install manually:"
    echo "   brew install python@3.10"
    echo ""
    echo "💡 Note: Web Speech API already works without any installation!"
fi
