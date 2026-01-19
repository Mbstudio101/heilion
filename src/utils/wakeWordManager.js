// Wake word listener manager
import { eventBus, EVENTS } from './eventBus';

let wakeListenerActive = false;
let wakeSocket = null;
let isPausedForSpeaking = false;
let speakStartUnsubscribe = null;
let speakEndUnsubscribe = null;
let connectionAttempted = false;
let connectionErrorLogged = false;
let retryTimeout = null;
let retryCount = 0;
const MAX_RETRIES = 5;
const INITIAL_RETRY_DELAY = 1000; // 1 second

async function connectWithRetry() {
  return new Promise((resolve) => {
    const attemptConnection = () => {
      try {
        wakeSocket = new WebSocket('ws://localhost:8765');
        
        wakeSocket.onopen = () => {
          wakeListenerActive = true;
          connectionErrorLogged = false;
          retryCount = 0;
          console.log('✓ Wake word listener connected');
          
          // Set up message handler after successful connection
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
          
          resolve({ success: true });
        };
        
        wakeSocket.onerror = (error) => {
          if (retryCount < MAX_RETRIES) {
            retryCount++;
            const delay = INITIAL_RETRY_DELAY * Math.pow(2, retryCount - 1); // Exponential backoff
            console.log(`Wake word connection attempt ${retryCount}/${MAX_RETRIES}, retrying in ${delay}ms...`);
            retryTimeout = setTimeout(attemptConnection, delay);
            resolve({ success: false, retrying: true });
          } else {
            if (!connectionErrorLogged) {
              connectionErrorLogged = true;
              console.warn('⚠ Wake word service not available after retries (push-to-talk mode will be used)');
            }
            wakeListenerActive = false;
            resolve({ success: false, error: 'Wake word service not available' });
          }
        };
        
        // Handle close events
        wakeSocket.onclose = () => {
          if (wakeListenerActive) {
            // Was connected, now disconnected
            wakeListenerActive = false;
            console.log('Wake word listener disconnected');
          }
          // If not active, connection failed before opening (error handler will retry)
        };
      } catch (error) {
        if (retryCount < MAX_RETRIES) {
          retryCount++;
          const delay = INITIAL_RETRY_DELAY * Math.pow(2, retryCount - 1);
          retryTimeout = setTimeout(attemptConnection, delay);
          resolve({ success: false, retrying: true });
        } else {
          resolve({ success: false, error: error.message });
        }
      }
    };
    
    // Initial delay to give Python service time to start
    setTimeout(attemptConnection, 500);
  });
}

export async function startWakeListener() {
  if (wakeListenerActive) {
    return { success: true, alreadyActive: true };
  }

  // Don't spam errors if the sidecar isn't running
  if (connectionAttempted && !wakeListenerActive && retryCount >= MAX_RETRIES) {
    // Already tried and failed - don't retry silently
    return { success: false, error: 'Wake word service not available' };
  }

  try {
    connectionAttempted = true;
    retryCount = 0;
    
    // Connect with retry mechanism
    const result = await connectWithRetry();
    if (!result.success && !result.retrying) {
      return result;
    }
    
    // If retrying, return success (retry will happen in background)
    if (result.retrying) {
      return { success: true, retrying: true };
    }

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
  // Clear any pending retries
  if (retryTimeout) {
    clearTimeout(retryTimeout);
    retryTimeout = null;
  }
  
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
  retryCount = 0;
  return { success: true };
}

export function pauseWakeWhileSpeaking(isSpeaking) {
  isPausedForSpeaking = isSpeaking;
  return { success: true, paused: isSpeaking };
}

export function isWakeListenerActive() {
  return wakeListenerActive && !isPausedForSpeaking;
}
