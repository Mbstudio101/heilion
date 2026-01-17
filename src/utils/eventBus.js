// Event bus for real-time UI updates
class EventBus {
  constructor() {
    this.listeners = new Map();
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
    
    // Return unsubscribe function
    return () => {
      const callbacks = this.listeners.get(event);
      if (callbacks) {
        const index = callbacks.indexOf(callback);
        if (index > -1) {
          callbacks.splice(index, 1);
        }
      }
    };
  }

  off(event, callback) {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  emit(event, data) {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in event listener for ${event}:`, error);
        }
      });
    }
  }

  removeAllListeners(event) {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }
}

export const eventBus = new EventBus();

// Event types
export const EVENTS = {
  WAKE_TRIGGERED: 'WAKE_TRIGGERED',
  CAPTURE_STARTED: 'CAPTURE_STARTED',
  CAPTURE_STOPPED: 'CAPTURE_STOPPED',
  TRANSCRIBE_STARTED: 'TRANSCRIBE_STARTED',
  TRANSCRIBE_ENDED: 'TRANSCRIBE_ENDED',
  TRANSCRIPT_READY: 'TRANSCRIPT_READY',
  LLM_STARTED: 'LLM_STARTED',
  LLM_ENDED: 'LLM_ENDED',
  THINKING_STARTED: 'THINKING_STARTED',
  THINKING_ENDED: 'THINKING_ENDED',
  GRADE_READY: 'GRADE_READY',
  SPEAK_START: 'SPEAK_START',
  SPEAK_END: 'SPEAK_END',
  SPEAK_LEVEL: 'SPEAK_LEVEL', // Audio amplitude during speaking (0..1)
  LISTEN_LEVEL: 'LISTEN_LEVEL', // Mic amplitude during listening (0..1)
  ORB_STATE: 'ORB_STATE', // Explicit orb state change
  PROVIDER_STATUS_CHANGED: 'PROVIDER_STATUS_CHANGED',
  SESSION_STARTED: 'SESSION_STARTED',
  SESSION_ENDED: 'SESSION_ENDED',
  QUESTION_ASKED: 'QUESTION_ASKED',
  ANSWER_SUBMITTED: 'ANSWER_SUBMITTED',
  ORB_STATE_CHANGED: 'ORB_STATE_CHANGED'
};
