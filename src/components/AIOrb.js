import React, { useEffect, useRef } from 'react';
import './AIOrb.css';

function AIOrb({ isListening, isThinking, isSpeaking }) {
  const orbRef = useRef(null);

  useEffect(() => {
    const orb = orbRef.current;
    if (!orb) return;

    // Remove all state classes
    orb.classList.remove('listening', 'thinking', 'speaking');
    
    if (isListening) {
      orb.classList.add('listening');
    } else if (isThinking) {
      orb.classList.add('thinking');
    } else if (isSpeaking) {
      orb.classList.add('speaking');
    }
  }, [isListening, isThinking, isSpeaking]);

  return (
    <div className="ai-orb-container">
      <div ref={orbRef} className="ai-orb" />
      <div className="ai-orb-glow" />
    </div>
  );
}

export default AIOrb;
