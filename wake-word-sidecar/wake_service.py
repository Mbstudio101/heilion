#!/usr/bin/env python3
"""
Wake word detection service using openWakeWord
Listens for 12 zodiac persona wake phrases:
Hey Aries, Hey Taurus, Hey Gemini, Hey Cancer, Hey Leo, Hey Virgo,
Hey Libra, Hey Scorpio, Hey Sagittarius, Hey Capricorn, Hey Aquarius, Hey Pisces
"""

import asyncio
import websockets
import json
import numpy as np
import pyaudio
import sys
import os

# Check if openWakeWord is available
try:
    import openwakeword
    from openwakeword import Model
    OWW_AVAILABLE = True
except ImportError:
    print("Warning: openWakeWord not installed. Install with: pip install openwakeword")
    OWW_AVAILABLE = False

PERSONAS = [
    'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
    'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'
]

WAKE_PHRASES = [f"Hey {persona}" for persona in PERSONAS]

# Audio settings
CHUNK = 1024
FORMAT = pyaudio.paInt16
CHANNELS = 1
RATE = 16000

class WakeWordService:
    def __init__(self):
        global OWW_AVAILABLE
        self.clients = set()
        self.model = None
        self.audio = None
        self.stream = None
        self.running = False
        self.oww_available = OWW_AVAILABLE  # Store as instance variable
        
        if OWW_AVAILABLE:
            try:
                # Initialize openWakeWord with custom wake phrases
                # Note: In production, you'd train custom models for each persona
                # For now, we'll use keyword spotting or a simpler approach
                self.model = Model(wakeword_models=['hey_aries'])
                print("Wake word model loaded")
            except Exception as e:
                print(f"Failed to load wake word model: {e}")
                OWW_AVAILABLE = False
                self.oww_available = False
    
    async def register_client(self, websocket):
        self.clients.add(websocket)
        print(f"Client connected. Total clients: {len(self.clients)}")
        try:
            await websocket.wait_closed()
        finally:
            self.clients.remove(websocket)
            print(f"Client disconnected. Total clients: {len(self.clients)}")
    
    async def broadcast(self, message):
        if self.clients:
            disconnected = set()
            for client in self.clients:
                try:
                    await client.send(json.dumps(message))
                except websockets.exceptions.ConnectionClosed:
                    disconnected.add(client)
            self.clients -= disconnected
    
    def detect_wake_word(self, audio_data):
        """Detect wake word in audio chunk"""
        if not self.model or not self.oww_available:
            return None
        
        try:
            # Convert bytes to numpy array
            audio_array = np.frombuffer(audio_data, dtype=np.int16).astype(np.float32) / 32768.0
            
            # Run inference
            prediction = self.model.predict(audio_array)
            
            # Check for any wake phrase
            for i, phrase in enumerate(WAKE_PHRASES):
                # In a real implementation, you'd check the model's output
                # For now, this is a placeholder
                if prediction.get(phrase.lower().replace(' ', '_'), 0) > 0.5:
                    persona = PERSONAS[i]
                    return persona
            
            return None
        except Exception as e:
            print(f"Wake word detection error: {e}")
            return None
    
    def start_audio_listening(self):
        """Start listening to microphone"""
        if not self.oww_available:
            print("openWakeWord not available, cannot start audio listening")
            return
        
        try:
            self.audio = pyaudio.PyAudio()
            self.stream = self.audio.open(
                format=FORMAT,
                channels=CHANNELS,
                rate=RATE,
                input=True,
                frames_per_buffer=CHUNK
            )
            self.running = True
            print("Audio stream started")
        except Exception as e:
            print(f"Failed to start audio stream: {e}")
            self.running = False
    
    async def audio_loop(self):
        """Process audio chunks for wake word detection"""
        if not self.running:
            return
        
        last_trigger_time = 0
        cooldown = 3.0  # Seconds between triggers
        
        while self.running:
            try:
                if self.stream:
                    audio_data = self.stream.read(CHUNK, exception_on_overflow=False)
                    
                    # Also stream to connected clients
                    if self.clients:
                        asyncio.create_task(self.broadcast_audio(audio_data))
                    
                    # Detect wake word
                    persona = self.detect_wake_word(audio_data)
                    if persona:
                        import time
                        current_time = time.time()
                        if current_time - last_trigger_time > cooldown:
                            last_trigger_time = current_time
                            await self.broadcast({
                                'triggered': True,
                                'persona': persona
                            })
                            print(f"Wake word detected: {persona}")
                
                await asyncio.sleep(0.01)  # Small delay to prevent CPU spinning
            except Exception as e:
                print(f"Audio loop error: {e}")
                await asyncio.sleep(0.1)
    
    async def broadcast_audio(self, audio_data):
        """Broadcast audio data to clients (binary)"""
        if self.clients:
            disconnected = set()
            for client in self.clients:
                try:
                    await client.send(audio_data)
                except (websockets.exceptions.ConnectionClosed, TypeError):
                    disconnected.add(client)
            self.clients -= disconnected
    
    def stop(self):
        """Stop audio stream"""
        self.running = False
        if self.stream:
            self.stream.stop_stream()
            self.stream.close()
        if self.audio:
            self.audio.terminate()
        print("Audio stream stopped")

async def main():
    service = WakeWordService()
    
    # Start WebSocket server
    async with websockets.serve(service.register_client, "localhost", 8765):
        print("Wake word service started on ws://localhost:8765")
        
        # Start audio listening if available
        if service.oww_available:
            service.start_audio_listening()
            audio_task = asyncio.create_task(service.audio_loop())
        
        try:
            # Keep server running
            await asyncio.Future()  # Run forever
        except KeyboardInterrupt:
            print("\nShutting down...")
            service.stop()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nService stopped")
