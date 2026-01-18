// Audio capture manager with auto-stop on silence
import { eventBus, EVENTS } from './eventBus';

let mediaRecorder = null;
let audioStream = null;
let silenceTimer = null;
let audioChunks = [];
let isRecording = false;
let audioContext = null;
let analyser = null;
let silenceThreshold = 0.015; // Volume threshold for silence (slightly higher to avoid ambient noise)
// Get silence duration from settings (default 1000ms = 1.0s, configurable 0.9-1.2s)
function getSilenceDuration() {
  try {
    const settings = JSON.parse(localStorage.getItem('heilion-settings') || '{}');
    const duration = settings.silenceDuration || 1000; // Default 1.0s
    // Clamp to 0.9-1.2s range
    return Math.max(900, Math.min(1200, duration));
  } catch {
    return 1000; // Default 1.0s
  }
}
let lastSoundTime = Date.now();
let recordingStartTime = Date.now();
const minimumRecordingDuration = 1000; // Minimum 1 second of recording before auto-stop

export async function beginActiveCapture(mode = 'auto') {
  if (isRecording) {
    return { success: false, error: 'Already recording' };
  }

  try {
    // Get microphone access
    const permission = await window.electronAPI.getMicPermission();
    if (!permission.granted) {
      return { success: false, error: 'Microphone permission not granted' };
    }

    audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    
    // Setup audio context for silence detection
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioContext.createMediaStreamSource(audioStream);
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.8;
    source.connect(analyser);
    
    // Expose analyser for orb amplitude monitoring
    window.__micAnalyser = analyser;

    // Setup MediaRecorder - select best supported format at runtime
    // Prefer opus/webm (best quality/size), fallback to mp4, then wav
    let mimeType = 'audio/wav'; // Default fallback
    const mimeTypes = [
      'audio/webm;codecs=opus', // Best: Opus codec in WebM
      'audio/webm',              // Good: WebM container
      'audio/ogg;codecs=opus',   // Alternative: Opus in OGG
      'audio/mp4',               // Fallback: MP4
      'audio/wav'                // Last resort: WAV
    ];
    
    for (const candidate of mimeTypes) {
      if (MediaRecorder.isTypeSupported(candidate)) {
        mimeType = candidate;
        break;
      }
    }
    
    mediaRecorder = new MediaRecorder(audioStream, { mimeType });
    audioChunks = [];

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        audioChunks.push(event.data);
      }
    };

    mediaRecorder.onstop = async () => {
      const blob = new Blob(audioChunks, { type: mimeType });
      
      // Cleanup audio resources now (before saving)
      cleanup();
      
      // Save raw blob (WebM/MP4) - main process will convert to WAV using ffmpeg
      // DO NOT convert to WAV in JavaScript (creates invalid files)
      const filePath = await saveAudioBlob(blob);
      
      eventBus.emit(EVENTS.CAPTURE_STOPPED, { filePath });
    };

    // Start recording
    mediaRecorder.start(1000); // Collect data every second for better silence detection
    isRecording = true;
    lastSoundTime = Date.now();
    
    eventBus.emit(EVENTS.CAPTURE_STARTED, { mode });
    eventBus.emit(EVENTS.ORB_STATE, { state: 'listening' });

    // ALWAYS use auto-stop on silence (for wake, auto, and push-to-talk modes)
    // This makes the experience hands-free - user just talks and stops
    startSilenceDetection();

    return { success: true, recording: true };
  } catch (error) {
    cleanup();
    return { success: false, error: error.message };
  }
}

function startSilenceDetection() {
  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);
  const timeDataArray = new Uint8Array(bufferLength);

  const checkSilence = () => {
    if (!isRecording || !analyser) return;

    analyser.getByteFrequencyData(dataArray);
    analyser.getByteTimeDomainData(timeDataArray);
    
    // Calculate average volume across frequency bins
    const average = dataArray.reduce((a, b) => a + b) / bufferLength;
    const volume = average / 255;

    // Calculate RMS (root mean square) from time domain data for better speech detection
    let sumSquares = 0;
    for (let i = 0; i < timeDataArray.length; i++) {
      const normalized = (timeDataArray[i] - 128) / 128;
      sumSquares += normalized * normalized;
    }
    const rms = Math.sqrt(sumSquares / timeDataArray.length);
    const normalizedLevel = Math.min(rms * 2, 1);

    // Emit LISTEN_LEVEL event for orb reactivity (30-60 times/sec)
    eventBus.emit(EVENTS.LISTEN_LEVEL, { level: normalizedLevel });

    // User is speaking if volume OR RMS is above threshold
    const isSpeaking = volume > silenceThreshold || rms > silenceThreshold;
    
    // BARGE-IN: If user starts speaking while TTS is playing, stop TTS and continue capture
    // Check if TTS is playing (speaking state) and user just started speaking
    if (isSpeaking && !isRecording) {
      // User started speaking - check if TTS is active via event bus
      // This will be handled in TutorScreen.js via LISTEN_LEVEL events
    }

    if (isSpeaking) {
      lastSoundTime = Date.now();
    } else {
      const silenceTime = Date.now() - lastSoundTime;
      const recordingDuration = Date.now() - recordingStartTime;
      
      // Only auto-stop if:
      // 1. Silence duration exceeded threshold (configurable from settings)
      // 2. Minimum recording duration has passed (to avoid stopping immediately)
      const silenceDuration = getSilenceDuration();
      if (silenceTime > silenceDuration && recordingDuration > minimumRecordingDuration) {
        // Auto-stop on silence
        cancelActiveCapture();
        return;
      }
    }

    requestAnimationFrame(checkSilence);
  };

  recordingStartTime = Date.now();
  checkSilence();
}

export async function cancelActiveCapture() {
  if (!isRecording) {
    return { success: true, alreadyStopped: true };
  }

  try {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }
    
    cleanup();
    
    return { success: true };
  } catch (error) {
    cleanup();
    return { success: false, error: error.message };
  }
}

function cleanup() {
  isRecording = false;
  
  if (silenceTimer) {
    clearTimeout(silenceTimer);
    silenceTimer = null;
  }

  if (audioStream) {
    audioStream.getTracks().forEach(track => track.stop());
    audioStream = null;
  }

  if (audioContext) {
    audioContext.close();
    audioContext = null;
  }

  analyser = null;
  mediaRecorder = null;
  audioChunks = [];
  
  // Clear exposed analyser
  window.__micAnalyser = null;
}

// Save raw audio blob (WebM/MP4/Opus) - main process will convert to WAV using ffmpeg
async function saveAudioBlob(blob) {
  try {
    // Get blob type to determine extension
    const blobType = blob.type || 'audio/webm';
    const extension = blobType.includes('webm') ? 'webm' : 
                     blobType.includes('mp4') ? 'mp4' : 
                     blobType.includes('ogg') ? 'ogg' : 'webm';
    
    // Convert blob to ArrayBuffer for IPC transfer
    const arrayBuffer = await blob.arrayBuffer();
    
    // Send to main process to save raw blob (main will convert to WAV with ffmpeg)
    const result = await window.electronAPI.saveAudioBlob(Array.from(new Uint8Array(arrayBuffer)), extension);
    
    if (result.success) {
      return result.filePath; // Returns path to raw input file (before conversion)
    } else {
      console.error('Failed to save audio blob:', result.error);
      return null;
    }
  } catch (error) {
    console.error('Error saving audio blob:', error);
    return null;
  }
}

export function isCapturing() {
  return isRecording;
}
