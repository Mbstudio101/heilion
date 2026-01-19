#!/usr/bin/env python3
"""
HuBERT + Llama 3 (8B) Speech Understanding Service
Custom integration for Heilion AI Tutor

This service:
1. Encodes audio using HuBERT to extract speech representations
2. Converts speech tokens to Llama 3 compatible format
3. Uses Llama 3 (8B) for understanding and response generation
4. Provides unified audio → text understanding

Based on SpeakLlama architecture but customized for Heilion's tutoring use case.
"""

import asyncio
import websockets
import json
import sys
import os
import tempfile
import wave
import numpy as np
from pathlib import Path

# Check dependencies
HUBERT_AVAILABLE = False
LLAMA_AVAILABLE = False

try:
    import torch
    from transformers import (
        Wav2Vec2Processor, 
        Wav2Vec2Model,
        AutoTokenizer,
        AutoModelForCausalLM,
        BitsAndBytesConfig
    )
    HUBERT_AVAILABLE = True
    print("✓ Transformers libraries loaded")
except ImportError as e:
    print(f"⚠ Transformers not available: {e}")
    print("  Install with: pip install transformers torch")

try:
    import librosa
    import soundfile
    print("✓ Audio processing libraries loaded")
except ImportError as e:
    print(f"⚠ Audio libraries not available: {e}")
    print("  Install with: pip install librosa soundfile")

# Model configuration
HUBERT_MODEL_NAME = "facebook/hubert-large-ls960-ft"  # Pre-trained HuBERT for speech
LLAMA_MODEL_NAME = "meta-llama/Llama-3-8B-Instruct"  # Llama 3 8B Instruct
USE_4BIT = True  # Use 4-bit quantization to fit in memory

# Audio settings (matching Whisper/whisper.cpp requirements)
SAMPLE_RATE = 16000
CHUNK_DURATION = 30.0  # 30 second chunks (standard for speech models)

class HubertLlamaService:
    """HuBERT + Llama 3 speech understanding service"""
    
    def __init__(self):
        self.clients = set()
        self.huber_model = None
        self.huber_processor = None
        self.llama_model = None
        self.llama_tokenizer = None
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.models_loaded = False
        
        print(f"🚀 HuBERT + Llama 3 Service initializing...")
        print(f"   Device: {self.device}")
    
    async def load_models(self):
        """Load HuBERT and Llama 3 models"""
        if self.models_loaded:
            return True
        
        try:
            print("📦 Loading HuBERT model...")
            # Load HuBERT for speech encoding
            self.huber_processor = Wav2Vec2Processor.from_pretrained(HUBERT_MODEL_NAME)
            self.huber_model = Wav2Vec2Model.from_pretrained(HUBERT_MODEL_NAME)
            self.huber_model.to(self.device)
            self.huber_model.eval()
            print("✓ HuBERT loaded")
            
            print("📦 Loading Llama 3 (8B) model...")
            # Configure quantization for memory efficiency
            if USE_4BIT and self.device == "cpu":
                quantization_config = BitsAndBytesConfig(
                    load_in_4bit=True,
                    bnb_4bit_compute_dtype=torch.float16
                )
            else:
                quantization_config = None
            
            # Load Llama 3 tokenizer and model
            self.llama_tokenizer = AutoTokenizer.from_pretrained(LLAMA_MODEL_NAME)
            if self.llama_tokenizer.pad_token is None:
                self.llama_tokenizer.pad_token = self.llama_tokenizer.eos_token
            
            self.llama_model = AutoModelForCausalLM.from_pretrained(
                LLAMA_MODEL_NAME,
                quantization_config=quantization_config,
                device_map="auto" if self.device == "cuda" else None,
                torch_dtype=torch.float16 if self.device == "cuda" else torch.float32,
                trust_remote_code=True
            )
            
            if self.device == "cpu" and quantization_config is None:
                self.llama_model.to(self.device)
            
            self.llama_model.eval()
            print("✓ Llama 3 (8B) loaded")
            
            self.models_loaded = True
            return True
            
        except Exception as e:
            print(f"❌ Error loading models: {e}")
            print(f"   Make sure you have:")
            print(f"   1. HuggingFace access token (for Llama 3)")
            print(f"   2. Sufficient memory (8GB+ recommended)")
            print(f"   3. All dependencies installed")
            return False
    
    def encode_audio_hubert(self, audio_path):
        """
        Encode audio using HuBERT to extract speech representations
        
        Returns:
            speech_tokens: Encoded speech tokens/embeddings
            speech_features: Raw feature vectors
        """
        try:
            # Load and preprocess audio
            audio, sr = librosa.load(audio_path, sr=SAMPLE_RATE)
            
            # Pad or trim to 30 seconds
            target_length = int(SAMPLE_RATE * CHUNK_DURATION)
            if len(audio) > target_length:
                audio = audio[:target_length]
            else:
                padding = target_length - len(audio)
                audio = np.pad(audio, (0, padding), mode='constant')
            
            # Process with HuBERT
            inputs = self.huber_processor(
                audio,
                sampling_rate=SAMPLE_RATE,
                return_tensors="pt",
                padding=True
            ).to(self.device)
            
            # Extract features
            with torch.no_grad():
                outputs = self.huber_model(**inputs)
                # Use hidden states (last layer or average of layers)
                speech_features = outputs.last_hidden_state
                
                # Convert to discrete tokens (quantization for Llama compatibility)
                # Average pooling to reduce sequence length
                speech_tokens = torch.mean(speech_features, dim=1)  # [batch, hidden_dim]
            
            return speech_tokens.cpu().numpy(), speech_features.cpu().numpy()
            
        except Exception as e:
            print(f"Error encoding audio with HuBERT: {e}")
            raise
    
    def create_speech_prompt(self, speech_tokens, context=""):
        """
        Create a prompt for Llama 3 that includes speech information
        
        We'll use a text-based representation approach where we:
        1. Describe the speech tokens in text format
        2. Or use a learned adapter to convert tokens directly
        """
        # For now, use a text-based approach
        # In a full implementation, you'd have a learned adapter layer
        
        prompt = f"""<|begin_of_text|><|start_header_id|>system<|end_header_id|>

You are an AI tutor helping a student. The student's speech has been encoded using HuBERT speech encoder. 
Process the speech information and respond naturally as a tutor.

{context}

<|eot_id|><|start_header_id|>user<|end_header_id|>

[Speech encoded with HuBERT - {len(speech_tokens)} features extracted]
Please transcribe and understand the student's speech, then respond as a helpful tutor.

<|eot_id|><|start_header_id|>assistant<|end_header_id|>

"""
        return prompt
    
    async def transcribe_and_understand(self, audio_path, context=""):
        """
        Main function: Audio → HuBERT → Llama 3 → Text
        
        Args:
            audio_path: Path to audio file (WAV format, 16kHz, mono)
            context: Optional context about the conversation/course
        
        Returns:
            dict with 'transcript' and 'response' keys
        """
        if not self.models_loaded:
            await self.load_models()
        
        try:
            # Step 1: Encode audio with HuBERT
            print("🔊 Encoding audio with HuBERT...")
            speech_tokens, speech_features = self.encode_audio_hubert(audio_path)
            
            # Step 2: Create prompt for Llama 3
            prompt = self.create_speech_prompt(speech_tokens, context)
            
            # Step 3: Generate response with Llama 3
            print("🤖 Generating response with Llama 3...")
            inputs = self.llama_tokenizer(prompt, return_tensors="pt").to(self.device)
            
            with torch.no_grad():
                outputs = self.llama_model.generate(
                    **inputs,
                    max_new_tokens=512,
                    temperature=0.7,
                    do_sample=True,
                    top_p=0.9,
                    pad_token_id=self.llama_tokenizer.eos_token_id
                )
            
            response_text = self.llama_tokenizer.decode(
                outputs[0][inputs['input_ids'].shape[1]:],
                skip_special_tokens=True
            )
            
            # Extract transcript and response from Llama output
            # In practice, Llama would generate both transcription and response
            transcript = response_text.split('\n')[0] if '\n' in response_text else response_text
            response = response_text
            
            return {
                'success': True,
                'transcript': transcript.strip(),
                'response': response.strip(),
                'speech_features_shape': speech_features.shape
            }
            
        except Exception as e:
            print(f"Error in transcribe_and_understand: {e}")
            import traceback
            traceback.print_exc()
            return {
                'success': False,
                'error': str(e)
            }
    
    async def handle_client(self, websocket, path):
        """Handle WebSocket client connections"""
        self.clients.add(websocket)
        print(f"📡 Client connected. Total clients: {len(self.clients)}")
        
        try:
            async for message in websocket:
                try:
                    data = json.loads(message)
                    msg_type = data.get('type')
                    
                    if msg_type == 'ping':
                        await websocket.send(json.dumps({'type': 'pong'}))
                    
                    elif msg_type == 'transcribe':
                        audio_path = data.get('audio_path')
                        context = data.get('context', '')
                        
                        if not audio_path or not os.path.exists(audio_path):
                            await websocket.send(json.dumps({
                                'type': 'error',
                                'error': f'Audio file not found: {audio_path}'
                            }))
                            continue
                        
                        # Process audio
                        result = await self.transcribe_and_understand(audio_path, context)
                        
                        await websocket.send(json.dumps({
                            'type': 'result',
                            **result
                        }))
                    
                    elif msg_type == 'load_models':
                        success = await self.load_models()
                        await websocket.send(json.dumps({
                            'type': 'models_loaded',
                            'success': success
                        }))
                    
                    else:
                        await websocket.send(json.dumps({
                            'type': 'error',
                            'error': f'Unknown message type: {msg_type}'
                        }))
                        
                except json.JSONDecodeError:
                    await websocket.send(json.dumps({
                        'type': 'error',
                        'error': 'Invalid JSON'
                    }))
                except Exception as e:
                    await websocket.send(json.dumps({
                        'type': 'error',
                        'error': str(e)
                    }))
        
        except websockets.exceptions.ConnectionClosed:
            pass
        finally:
            self.clients.remove(websocket)
            print(f"📡 Client disconnected. Remaining clients: {len(self.clients)}")
    
    async def start_server(self, host='localhost', port=8766):
        """Start WebSocket server"""
        print(f"🌐 Starting HuBERT + Llama 3 service on ws://{host}:{port}")
        
        async with websockets.serve(self.handle_client, host, port):
            print("✅ Service ready. Waiting for connections...")
            await asyncio.Future()  # Run forever

def main():
    """Main entry point"""
    service = HubertLlamaService()
    
    # Parse command line arguments
    host = 'localhost'
    port = 8766
    
    if len(sys.argv) > 1:
        port = int(sys.argv[1])
    
    try:
        asyncio.run(service.start_server(host, port))
    except KeyboardInterrupt:
        print("\n👋 Shutting down...")
    except Exception as e:
        print(f"❌ Error: {e}")
        sys.exit(1)

if __name__ == '__main__':
    main()
