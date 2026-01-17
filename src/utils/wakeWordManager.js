// Wake word listener manager
import { eventBus, EVENTS } from './eventBus';

let wakeListenerActive = false;
let wakeSocket = null;
let isPausedForSpeaking = false;
let speakStartUnsubscribe = null;
let speakEndUnsubscribe = null;

export async function startWakeListener() {
  if (wakeListenerActive) {
    return { success: true, alreadyActive: true };
  }

  try {
    // Connect to wake word service WebSocket
    wakeSocket = new WebSocket('ws://localhost:8765');
    
    wakeSocket.onopen = () => {
      wakeListenerActive = true;
      console.log('Wake listener started');
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
      console.error('Wake word WebSocket error:', error);
      wakeListenerActive = false;
    };

    wakeSocket.onclose = () => {
      wakeListenerActive = false;
      console.log('Wake listener stopped');
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
