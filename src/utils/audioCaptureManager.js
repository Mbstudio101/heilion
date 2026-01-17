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
let silenceDuration = 2500; // 2.5 seconds of silence before auto-stop
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

    // Setup MediaRecorder
    const mimeType = MediaRecorder.isTypeSupported('audio/webm') 
      ? 'audio/webm' 
      : MediaRecorder.isTypeSupported('audio/mp4')
      ? 'audio/mp4'
      : 'audio/wav';
    
    mediaRecorder = new MediaRecorder(audioStream, { mimeType });
    audioChunks = [];

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        audioChunks.push(event.data);
      }
    };

    mediaRecorder.onstop = async () => {
      const blob = new Blob(audioChunks, { type: mimeType });
      
      // Save to temp file (in production, send blob to main process)
      const filePath = await saveAudioBlob(blob);
      
      eventBus.emit(EVENTS.CAPTURE_STOPPED, { filePath });
      
      cleanup();
    };

    // Start recording
    mediaRecorder.start(1000); // Collect data every second for better silence detection
    isRecording = true;
    lastSoundTime = Date.now();
    
    eventBus.emit(EVENTS.CAPTURE_STARTED, { mode });

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

  const checkSilence = () => {
    if (!isRecording || !analyser) return;

    analyser.getByteFrequencyData(dataArray);
    
    // Calculate average volume across frequency bins
    const average = dataArray.reduce((a, b) => a + b) / bufferLength;
    const volume = average / 255;

    // Also check RMS (root mean square) for better speech detection
    let sumSquares = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sumSquares += (dataArray[i] / 255) * (dataArray[i] / 255);
    }
    const rms = Math.sqrt(sumSquares / dataArray.length);

    // User is speaking if volume OR RMS is above threshold
    const isSpeaking = volume > silenceThreshold || rms > silenceThreshold;

    if (isSpeaking) {
      lastSoundTime = Date.now();
    } else {
      const silenceTime = Date.now() - lastSoundTime;
      const recordingDuration = Date.now() - recordingStartTime;
      
      // Only auto-stop if:
      // 1. Silence duration exceeded threshold
      // 2. Minimum recording duration has passed (to avoid stopping immediately)
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
}

async function saveAudioBlob(blob) {
  try {
    // Convert blob to ArrayBuffer for IPC transfer
    const arrayBuffer = await blob.arrayBuffer();
    
    // Send to main process to save to file
    const result = await window.electronAPI.saveAudioBlob(arrayBuffer);
    
    if (result.success) {
      return result.filePath;
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
