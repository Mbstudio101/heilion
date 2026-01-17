#!/usr/bin/env python3
"""
Soprano TTS Sidecar Server
Runs Soprano TTS server with OpenAI-compatible endpoint for Heilion app
Supports both installed soprano-tts package and cloned soprano repository
"""
import uvicorn
import sys
import os

# Try to use cloned soprano repo first (in same directory)
script_dir = os.path.dirname(os.path.abspath(__file__))
soprano_repo_path = os.path.join(script_dir, 'soprano-repo')

# Add cloned soprano repo to path if it exists
if os.path.exists(soprano_repo_path):
    sys.path.insert(0, soprano_repo_path)
    print(f"Using cloned Soprano TTS from: {soprano_repo_path}")

# Try to import soprano (either from cloned repo or installed package)
try:
    from soprano.server import app
    print("✓ Soprano TTS imported successfully")
except ImportError as e:
    print(f"Error: Soprano TTS not found.")
    print(f"  Attempted: {soprano_repo_path if os.path.exists(soprano_repo_path) else 'cloned repo not found'}")
    print(f"  Please either:")
    print(f"    1. Install: pip install soprano-tts (requires Python 3.10+)")
    print(f"    2. Clone repo: git clone https://github.com/ekwek1/soprano.git {soprano_repo_path}")
    sys.exit(1)

if __name__ == "__main__":
    # Run on localhost:8001 (different from default 8000 to avoid conflicts)
    port = int(os.environ.get("SOPRANO_PORT", 8001))
    host = os.environ.get("SOPRANO_HOST", "127.0.0.1")
    
    print(f"Starting Soprano TTS server on http://{host}:{port}")
    uvicorn.run(app, host=host, port=port, log_level="info")
