#!/usr/bin/env python3
"""
Soprano TTS using Transformers directly (simpler alternative to soprano-tts package)
Uses HuggingFace Transformers to run Soprano-1.1-80M model directly
"""
import os
import sys
import uvicorn
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
import torch
import torchaudio
import io

# Global model loading
pipe = None
device = "cuda" if torch.cuda.is_available() else "cpu"

class TTSRequest(BaseModel):
    input: str
    model: str = "ekwek/Soprano-1.1-80M"
    temperature: float = 0.8
    top_p: float = 0.95
    repetition_penalty: float = 1.15

def load_model():
    """Load Soprano TTS model using Transformers pipeline"""
    global pipe
    try:
        from transformers import pipeline
        print(f"Loading Soprano TTS model: ekwek/Soprano-1.1-80M on {device}...")
        pipe = pipeline(
            "text-to-speech",
            model="ekwek/Soprano-1.1-80M",
            device=0 if device == "cuda" else -1
        )
        print("✓ Soprano TTS model loaded successfully")
        return True
    except ImportError:
        print("Error: transformers library not found")
        print("  Install with: pip install transformers torch torchaudio")
        return False
    except Exception as e:
        print(f"Error loading model: {e}")
        return False

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load model on server startup (using lifespan instead of deprecated on_event)"""
    # Startup
    if not load_model():
        print("⚠ Model not loaded - TTS requests will fail")
        print("  Install dependencies: pip install transformers torch torchaudio")
    yield
    # Shutdown (cleanup if needed)
    pass

app = FastAPI(title="Soprano TTS (Transformers)", lifespan=lifespan)

@app.get("/health")
async def health():
    """Health check endpoint"""
    return {"status": "ok", "model_loaded": pipe is not None}

@app.post("/v1/audio/speech")
async def text_to_speech(request: TTSRequest):
    """Convert text to speech using Soprano TTS"""
    if pipe is None:
        raise HTTPException(
            status_code=503,
            detail="Soprano TTS model not loaded. Install dependencies: pip install transformers torch torchaudio"
        )
    
    try:
        # Generate speech using Transformers pipeline
        # The pipeline handles the model inference
        result = pipe(request.input)
        
        # Extract audio from result
        # Pipeline returns dict with 'audio' (numpy array) and 'sampling_rate'
        audio_array = result["audio"]
        sampling_rate = result.get("sampling_rate", 22050)
        
        # Convert numpy array to torch tensor
        audio_tensor = torch.from_numpy(audio_array)
        
        # Handle mono/stereo
        if audio_tensor.dim() == 1:
            audio_tensor = audio_tensor.unsqueeze(0)  # Add channel dimension
        
        # Convert to WAV format
        buffer = io.BytesIO()
        torchaudio.save(
            buffer,
            audio_tensor,
            sampling_rate,
            format="wav"
        )
        buffer.seek(0)
        
        return Response(
            content=buffer.read(),
            media_type="audio/wav",
            headers={
                "Content-Disposition": f"attachment; filename=soprano_tts.wav"
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"TTS generation failed: {str(e)}")

@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "name": "Soprano TTS (Transformers)",
        "model": "ekwek/Soprano-1.1-80M",
        "status": "running" if pipe else "model_not_loaded",
        "device": device
    }

if __name__ == "__main__":
    port = int(os.environ.get("SOPRANO_PORT", 8001))
    host = os.environ.get("SOPRANO_HOST", "127.0.0.1")
    
    print(f"Starting Soprano TTS (Transformers) server on http://{host}:{port}")
    print(f"Using device: {device}")
    print(f"\nDependencies needed:")
    print(f"  pip install transformers torch torchaudio fastapi uvicorn pydantic")
    
    uvicorn.run(app, host=host, port=port, log_level="info")
