// Wake word listener manager
import { eventBus, EVENTS } from './eventBus';

let wakeListenerActive = false;
let wakeSocket = null;
let isPausedForSpeaking = false;
let speakStartUnsubscribe = null;
let speakEndUnsubscribe = null;
let connectionAttempted = false;
let connectionErrorLogged = false;

export async function startWakeListener() {
  if (wakeListenerActive) {
    return { success: true, alreadyActive: true };
  }

  // Don't spam errors if the sidecar isn't running
  if (connectionAttempted && !wakeListenerActive) {
    // Already tried and failed - don't retry silently
    return { success: false, error: 'Wake word service not available' };
  }

  try {
    connectionAttempted = true;
    // Connect to wake word service WebSocket
    wakeSocket = new WebSocket('ws://localhost:8765');
    
    wakeSocket.onopen = () => {
      wakeListenerActive = true;
      connectionErrorLogged = false; // Reset error flag on success
      console.log('✓ Wake word listener connected');
    };

    wakeSocket.onmessage = (event) => {
      if (isPausedForSpeaking) return; // Ignore wake events while speaking

      try {
        const data = JSON.parse(event.data);
        if (data.triggered && data.persona) {
          eventBus.emit(EVENTS.WAKE_TRIGGERED, { persona: data.persona });
        }
      } catch (error) {
        console.error('Failed to parse wake word message:', error);
      }
    };

    wakeSocket.onerror = (error) => {
      // Only log error once to avoid console spam
      if (!connectionErrorLogged) {
        connectionErrorLogged = true;
        console.warn('⚠ Wake word service not available (push-to-talk mode will be used)');
      }
      wakeListenerActive = false;
    };

    wakeSocket.onclose = () => {
      wakeListenerActive = false;
      // Only log if we were previously connected
      if (connectionErrorLogged) {
        // Connection was never established, don't log
        return;
      }
      // Connection was established and then closed
      console.log('Wake word listener disconnected');
    };

    // Listen for speak events to pause wake detection
    speakStartUnsubscribe = eventBus.on(EVENTS.SPEAK_START, () => {
      pauseWakeWhileSpeaking(true);
    });

    speakEndUnsubscribe = eventBus.on(EVENTS.SPEAK_END, () => {
      pauseWakeWhileSpeaking(false);
    });

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export function stopWakeListener() {
  if (wakeSocket) {
    wakeSocket.close();
    wakeSocket = null;
  }
  
  // Clean up event listeners
  if (speakStartUnsubscribe) {
    speakStartUnsubscribe();
    speakStartUnsubscribe = null;
  }
  if (speakEndUnsubscribe) {
    speakEndUnsubscribe();
    speakEndUnsubscribe = null;
  }
  
  wakeListenerActive = false;
  return { success: true };
}

export function pauseWakeWhileSpeaking(isSpeaking) {
  isPausedForSpeaking = isSpeaking;
  return { success: true, paused: isSpeaking };
}

export function isWakeListenerActive() {
  return wakeListenerActive && !isPausedForSpeaking;
}
