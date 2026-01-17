// Fluid, Translucent AI Orb Renderer - ChatGPT Voice Mode Style
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { eventBus, EVENTS } from '../utils/eventBus';
import './AIOrb.css';

// Simple 2D Perlin noise generator
class SimpleNoise {
  constructor() {
    this.p = new Array(512);
    this.perm = new Array(512);
    const permutation = [151,160,137,91,90,15,131,13,201,95,96,53,194,233,7,225,
      140,36,103,30,69,142,8,99,37,240,21,10,23,190,6,148,247,120,234,75,0,26,
      197,62,94,252,219,203,117,35,11,32,57,177,33,88,237,149,56,87,174,20,125,
      136,171,168,68,175,74,165,71,134,139,48,27,166,77,146,158,231,83,111,229,
      122,60,211,133,230,220,105,92,41,55,46,245,40,244,102,143,54,65,25,63,161,
      1,216,80,73,209,76,132,187,208,89,18,169,200,196,135,130,116,188,159,86,
      164,100,109,198,173,186,3,64,52,217,226,250,124,123,5,202,38,147,118,126,
      255,82,85,212,207,206,59,227,47,16,58,17,182,189,28,42,223,183,170,213,
      119,248,152,2,44,154,163,70,221,153,101,155,167,43,172,9,129,22,39,253,19,
      98,108,110,79,113,224,232,178,185,112,104,218,246,97,228,251,34,242,193,
      238,210,144,12,191,179,162,241,81,51,145,235,249,14,239,107,49,192,214,31,
      181,199,106,157,184,84,204,176,115,121,50,45,127,4,150,254,138,236,205,93,
      222,114,67,29,24,72,243,141,128,195,78,66,215,61,156,180];
    
    for (let i = 0; i < 256; i++) {
      this.p[256 + i] = this.p[i] = permutation[i];
    }
  }

  fade(t) {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  lerp(t, a, b) {
    return a + t * (b - a);
  }

  grad(hash, x, y) {
    const h = hash & 15;
    const u = h < 8 ? x : y;
    const v = h < 4 ? y : h === 12 || h === 14 ? x : 0;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  }

  noise(x, y) {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    x -= Math.floor(x);
    y -= Math.floor(y);
    const u = this.fade(x);
    const v = this.fade(y);
    const A = this.p[X] + Y;
    const AA = this.p[A];
    const AB = this.p[A + 1];
    const B = this.p[X + 1] + Y;
    const BA = this.p[B];
    const BB = this.p[B + 1];

    return this.lerp(v,
      this.lerp(u, this.grad(this.p[AA], x, y),
        this.grad(this.p[BA], x - 1, y)),
      this.lerp(u, this.grad(this.p[AB], x, y - 1),
        this.grad(this.p[BB], x - 1, y - 1)));
  }
}

// Orb state machine configuration
const ORB_STATES = {
  idle: {
    baseRadius: 90,
    noiseAmount: 4.5, // 3-6 px range (middle)
    noiseSpeed: 0.001,
    pulseAmount: 3,
    glowStrength: 0.15,
    swirlSpeed: 0.3,
    color: { r: 100, g: 150, b: 255 }
  },
  listening: {
    baseRadius: 95,
    noiseAmount: 4,
    noiseSpeed: 0.008,
    pulseAmount: 14, // 10-18 px range (middle)
    glowStrength: 0.35,
    swirlSpeed: 0.6,
    color: { r: 100, g: 255, b: 150 }
  },
  thinking: {
    baseRadius: 105,
    noiseAmount: 20, // 14-26 px range (middle)
    noiseSpeed: 0.004,
    pulseAmount: 5,
    glowStrength: 0.4,
    swirlSpeed: 0.8,
    color: { r: 255, g: 200, b: 100 }
  },
  speaking: {
    baseRadius: 88,
    noiseAmount: 2,
    noiseSpeed: 0.006,
    pulseAmount: 20,
    glowStrength: 0.3,
    swirlSpeed: 0.5,
    color: { r: 255, g: 150, b: 200 }
  }
};

// Tween helper for smooth transitions
function lerp(start, end, t) {
  return start + (end - start) * t;
}

function lerpColor(start, end, t) {
  return {
    r: Math.round(lerp(start.r, end.r, t)),
    g: Math.round(lerp(start.g, end.g, t)),
    b: Math.round(lerp(start.b, end.b, t))
  };
}

function AIOrb({ isListening, isThinking, isSpeaking }) {
  const canvasRef = useRef(null);
  const animationFrameRef = useRef(null);
  const stateRef = useRef('idle');
  const targetStateRef = useRef('idle');
  const timeRef = useRef(0);
  const transitionTimeRef = useRef(0);
  const isTransitioningRef = useRef(false);
  const noiseRef = useRef(new SimpleNoise());
  
  // Amplitude sources (from events and direct analyser access)
  const micAmplitudeRef = useRef(0);
  const audioAmplitudeRef = useRef(0);
  const micAnalyserRef = useRef(null);
  const audioAnalyserRef = useRef(null);
  
  // Smooth amplitude levels (exponential moving average for fluid motion)
  const smoothMicLevelRef = useRef(0);
  const smoothAudioLevelRef = useRef(0);
  
  // Current parameters (tweened)
  const currentParamsRef = useRef({ ...ORB_STATES.idle });
  const swirlAngleRef = useRef(0);

  // Setup mic amplitude monitoring
  const setupMicAmplitude = useCallback(() => {
    const checkMic = () => {
      if (window.__micAnalyser) {
        micAnalyserRef.current = window.__micAnalyser;
      }
      requestAnimationFrame(checkMic);
    };
    checkMic();
  }, []);

  // Setup audio output amplitude monitoring
  const setupAudioAmplitude = useCallback(() => {
    if (window.__audioAnalyser) {
      audioAnalyserRef.current = window.__audioAnalyser;
    }
  }, []);

  // Update amplitude from analysers (fallback if events aren't available)
  const updateAmplitude = useCallback(() => {
    // Update mic amplitude from analyser (fallback)
    if (micAnalyserRef.current) {
      const bufferLength = micAnalyserRef.current.frequencyBinCount || 256;
      const dataArray = new Uint8Array(bufferLength);
      micAnalyserRef.current.getByteTimeDomainData(dataArray);
      
      // Calculate RMS
      let sumSquares = 0;
      for (let i = 0; i < bufferLength; i++) {
        const normalized = (dataArray[i] - 128) / 128;
        sumSquares += normalized * normalized;
      }
      const rms = Math.sqrt(sumSquares / bufferLength);
      
      // Smooth with EMA (exponential moving average)
      smoothMicLevelRef.current = smoothMicLevelRef.current * 0.85 + rms * 0.15;
      micAmplitudeRef.current = smoothMicLevelRef.current;
    }

    // Update audio output amplitude from analyser (fallback)
    if (audioAnalyserRef.current) {
      const bufferLength = audioAnalyserRef.current.frequencyBinCount || 256;
      const dataArray = new Uint8Array(bufferLength);
      audioAnalyserRef.current.getByteTimeDomainData(dataArray);
      
      let sumSquares = 0;
      for (let i = 0; i < bufferLength; i++) {
        const normalized = (dataArray[i] - 128) / 128;
        sumSquares += normalized * normalized;
      }
      const rms = Math.sqrt(sumSquares / bufferLength);
      
      // Smooth with EMA
      smoothAudioLevelRef.current = smoothAudioLevelRef.current * 0.85 + rms * 0.15;
      audioAmplitudeRef.current = smoothAudioLevelRef.current;
    }
  }, []);

  // Handle state machine transitions
  useEffect(() => {
    const handleCaptureStarted = () => {
      targetStateRef.current = 'listening';
      isTransitioningRef.current = true;
      transitionTimeRef.current = 0;
    };

    const handleTranscribeStarted = () => {
      targetStateRef.current = 'thinking';
      isTransitioningRef.current = true;
      transitionTimeRef.current = 0;
    };

    const handleLLMStarted = () => {
      targetStateRef.current = 'thinking';
      isTransitioningRef.current = true;
      transitionTimeRef.current = 0;
    };

    const handleThinkingStarted = () => {
      targetStateRef.current = 'thinking';
      isTransitioningRef.current = true;
      transitionTimeRef.current = 0;
    };

    const handleSpeakStart = () => {
      targetStateRef.current = 'speaking';
      isTransitioningRef.current = true;
      transitionTimeRef.current = 0;
      eventBus.emit(EVENTS.ORB_STATE, { state: 'speaking' });
    };

    const handleSpeakEnd = () => {
      targetStateRef.current = 'idle';
      isTransitioningRef.current = true;
      transitionTimeRef.current = 0;
      smoothAudioLevelRef.current = 0; // Reset audio level
      eventBus.emit(EVENTS.ORB_STATE, { state: 'idle' });
    };

    const handleSpeakLevel = (data) => {
      // Update smooth audio level with new amplitude data
      const level = data.level || 0;
      smoothAudioLevelRef.current = smoothAudioLevelRef.current * 0.85 + level * 0.15;
      audioAmplitudeRef.current = smoothAudioLevelRef.current;
    };

    const handleListenLevel = (data) => {
      // Update smooth mic level with new amplitude data
      const level = data.level || 0;
      smoothMicLevelRef.current = smoothMicLevelRef.current * 0.85 + level * 0.15;
      micAmplitudeRef.current = smoothMicLevelRef.current;
    };

    const handleOrbState = (data) => {
      // Handle explicit state changes from other components
      if (data.state && ORB_STATES[data.state]) {
        targetStateRef.current = data.state;
        isTransitioningRef.current = true;
        transitionTimeRef.current = 0;
      }
    };

    // Subscribe to events
    const unsubs = [
      eventBus.on(EVENTS.CAPTURE_STARTED, handleCaptureStarted),
      eventBus.on(EVENTS.TRANSCRIBE_STARTED, handleTranscribeStarted),
      eventBus.on(EVENTS.LLM_STARTED, handleLLMStarted),
      eventBus.on(EVENTS.THINKING_STARTED, handleThinkingStarted),
      eventBus.on(EVENTS.SPEAK_START, handleSpeakStart),
      eventBus.on(EVENTS.SPEAK_END, handleSpeakEnd),
      eventBus.on(EVENTS.SPEAK_LEVEL, handleSpeakLevel),
      eventBus.on(EVENTS.LISTEN_LEVEL, handleListenLevel),
      eventBus.on(EVENTS.ORB_STATE, handleOrbState)
    ];

    // Also handle legacy props
    if (isListening && stateRef.current !== 'listening') {
      targetStateRef.current = 'listening';
      isTransitioningRef.current = true;
      transitionTimeRef.current = 0;
    } else if (isThinking && stateRef.current !== 'thinking') {
      targetStateRef.current = 'thinking';
      isTransitioningRef.current = true;
      transitionTimeRef.current = 0;
    } else if (isSpeaking && stateRef.current !== 'speaking') {
      targetStateRef.current = 'speaking';
      isTransitioningRef.current = true;
      transitionTimeRef.current = 0;
    } else if (!isListening && !isThinking && !isSpeaking && stateRef.current !== 'idle') {
      targetStateRef.current = 'idle';
      isTransitioningRef.current = true;
      transitionTimeRef.current = 0;
    }

    return () => {
      if (unsubs && unsubs.length > 0) {
        unsubs.forEach(unsub => {
          if (typeof unsub === 'function') {
            unsub();
          }
        });
      }
    };
  }, [isListening, isThinking, isSpeaking]);

  // Main render loop - LAYERED APPROACH
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const size = 300;
    
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    ctx.scale(dpr, dpr);

    // Enable alpha blending for translucency
    ctx.globalCompositeOperation = 'source-over';

    setupMicAmplitude();
    setupAudioAmplitude();

    const numPoints = 192; // Smooth edge with many points
    const centerX = size / 2;
    const centerY = size / 2;

    const render = () => {
      const deltaTime = 0.016; // ~60fps
      timeRef.current += deltaTime;
      
      // Update swirl angle
      const params = currentParamsRef.current;
      swirlAngleRef.current += deltaTime * params.swirlSpeed;
      
      // Handle state transitions
      if (isTransitioningRef.current) {
        transitionTimeRef.current += deltaTime;
        const transitionDuration = 0.5; // 500ms
        const t = Math.min(transitionTimeRef.current / transitionDuration, 1);
        
        // Smooth tween (ease-out cubic)
        const easeT = 1 - Math.pow(1 - t, 3);
        
        const fromState = ORB_STATES[stateRef.current];
        const toState = ORB_STATES[targetStateRef.current];
        
        if (easeT >= 1) {
          stateRef.current = targetStateRef.current;
          isTransitioningRef.current = false;
          currentParamsRef.current = { ...toState };
        } else {
          currentParamsRef.current = {
            baseRadius: lerp(fromState.baseRadius, toState.baseRadius, easeT),
            noiseAmount: lerp(fromState.noiseAmount, toState.noiseAmount, easeT),
            noiseSpeed: lerp(fromState.noiseSpeed, toState.noiseSpeed, easeT),
            pulseAmount: lerp(fromState.pulseAmount, toState.pulseAmount, easeT),
            glowStrength: lerp(fromState.glowStrength, toState.glowStrength, easeT),
            swirlSpeed: lerp(fromState.swirlSpeed, toState.swirlSpeed, easeT),
            color: lerpColor(fromState.color, toState.color, easeT)
          };
        }
      }

      updateAmplitude();

      const currentParams = currentParamsRef.current;
      const noise = noiseRef.current;
      
      // Get amplitude based on state (use smooth levels for fluid motion)
      let amplitude = 0;
      if (stateRef.current === 'listening') {
        // Use mic level from LISTEN_LEVEL events or fallback to analyser
        amplitude = Math.min(micAmplitudeRef.current * 2, 1); // Boost mic sensitivity
      } else if (stateRef.current === 'speaking') {
        // Use audio level from SPEAK_LEVEL events or fallback to analyser
        // Minimum 0.2 to ensure some pulse even when quiet
        amplitude = Math.max(audioAmplitudeRef.current, 0.2) * 1.5;
        amplitude = Math.min(amplitude, 1);
      } else if (stateRef.current === 'idle') {
        // Slow breathing pulse (not tied to audio)
        amplitude = 0.2 + Math.sin(timeRef.current * 0.8) * 0.08;
      } else if (stateRef.current === 'thinking') {
        // Thinking state doesn't use amplitude, just morphing noise
        amplitude = 0.1; // Minimal pulse, mostly noise-driven
      }

      // Clear canvas with transparent background
      ctx.clearRect(0, 0, size, size);

      // ============================================
      // LAYER A: OUTER GLOW (stacked gradients for blur-like effect)
      // ============================================
      const glowRadius = currentParams.baseRadius * 2.2; // 2.2× orb radius
      const glowLayers = [
        { offset: 0, alpha: currentParams.glowStrength * 0.3, radius: glowRadius * 0.6 },
        { offset: 0.3, alpha: currentParams.glowStrength * 0.2, radius: glowRadius * 0.8 },
        { offset: 0.6, alpha: currentParams.glowStrength * 0.1, radius: glowRadius * 1.0 }
      ];

      for (const layer of glowLayers) {
        const glowGrad = ctx.createRadialGradient(
          centerX, centerY, 0,
          centerX, centerY, layer.radius
        );
        const c = currentParams.color;
        glowGrad.addColorStop(0, `rgba(${c.r}, ${c.g}, ${c.b}, ${layer.alpha})`);
        glowGrad.addColorStop(layer.offset, `rgba(${c.r}, ${c.g}, ${c.b}, ${layer.alpha * 0.5})`);
        glowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        
        ctx.fillStyle = glowGrad;
        ctx.fillRect(0, 0, size, size);
      }

      // ============================================
      // LAYER B: CORE BODY (radial gradient, translucent)
      // ============================================
      // First, compute noisy edge path
      const edgePoints = [];
      for (let i = 0; i <= numPoints; i++) {
        const angle = (i / numPoints) * Math.PI * 2;
        const baseRadius = currentParams.baseRadius;
        
        // Apply noise distortion
        const noiseX = Math.cos(angle) * 3 + timeRef.current * currentParams.noiseSpeed;
        const noiseY = Math.sin(angle) * 3 + timeRef.current * currentParams.noiseSpeed;
        const noiseValue = noise.noise(noiseX, noiseY);
        const noiseOffset = (noiseValue - 0.5) * currentParams.noiseAmount;
        
        // Apply pulse from amplitude
        const pulseOffset = amplitude * currentParams.pulseAmount;
        
        // Final radius for this point
        const radius = baseRadius + noiseOffset + pulseOffset;
        
        const x = centerX + Math.cos(angle) * radius;
        const y = centerY + Math.sin(angle) * radius;
        edgePoints.push({ x, y, angle, radius });
      }

      // Draw core body with translucent radial gradient
      ctx.beginPath();
      for (let i = 0; i < edgePoints.length; i++) {
        const pt = edgePoints[i];
        if (i === 0) {
          ctx.moveTo(pt.x, pt.y);
        } else {
          ctx.lineTo(pt.x, pt.y);
        }
      }
      ctx.closePath();

      // Core gradient - brighter center, transparent edges
      // Alpha range: 0.35-0.6 (translucent)
      const coreGradient = ctx.createRadialGradient(
        centerX - currentParams.baseRadius * 0.2,
        centerY - currentParams.baseRadius * 0.2,
        0,
        centerX,
        centerY,
        currentParams.baseRadius * 1.3
      );
      const c = currentParams.color;
      coreGradient.addColorStop(0, `rgba(${c.r + 40}, ${c.g + 40}, ${c.b + 40}, 0.6)`); // Max alpha 0.6
      coreGradient.addColorStop(0.4, `rgba(${c.r}, ${c.g}, ${c.b}, 0.48)`);
      coreGradient.addColorStop(0.8, `rgba(${c.r * 0.8}, ${c.g * 0.8}, ${c.b * 0.8}, 0.35)`); // Min alpha 0.35
      coreGradient.addColorStop(1, `rgba(${c.r * 0.5}, ${c.g * 0.5}, ${c.b * 0.5}, 0)`); // Transparent edge
      
      ctx.fillStyle = coreGradient;
      ctx.fill();

      // ============================================
      // LAYER C: INNER FLUID/SWIRL (rotating highlight blobs)
      // ============================================
      const numBlobs = 3;
      for (let blobIdx = 0; blobIdx < numBlobs; blobIdx++) {
        const blobAngle = swirlAngleRef.current + (blobIdx * Math.PI * 2 / numBlobs);
        const blobDist = currentParams.baseRadius * 0.35;
        const blobX = centerX + Math.cos(blobAngle) * blobDist;
        const blobY = centerY + Math.sin(blobAngle) * blobDist;
        const blobSize = currentParams.baseRadius * 0.25;

        // Inner highlight blob with subtle alpha for fluid effect
        // Alpha range: 0.08-0.18 (subtle!)
        const blobGradient = ctx.createRadialGradient(
          blobX, blobY, 0,
          blobX, blobY, blobSize
        );
        blobGradient.addColorStop(0, `rgba(255, 255, 255, 0.18)`); // Max alpha 0.18
        blobGradient.addColorStop(0.5, `rgba(255, 255, 255, 0.08)`); // Min alpha 0.08
        blobGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

        ctx.fillStyle = blobGradient;
        ctx.beginPath();
        ctx.arc(blobX, blobY, blobSize, 0, Math.PI * 2);
        ctx.fill();
      }

      // ============================================
      // LAYER D: EDGE (very faint stroke for definition, translucent)
      // ============================================
      ctx.beginPath();
      for (let i = 0; i < edgePoints.length; i++) {
        const pt = edgePoints[i];
        if (i === 0) {
          ctx.moveTo(pt.x, pt.y);
        } else {
          ctx.lineTo(pt.x, pt.y);
        }
      }
      ctx.closePath();

      // Very faint edge stroke with alpha fade
      const edgeColor = currentParams.color;
      ctx.strokeStyle = `rgba(${edgeColor.r}, ${edgeColor.g}, ${edgeColor.b}, 0.15)`;
      ctx.lineWidth = 0.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();

      animationFrameRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [setupMicAmplitude, setupAudioAmplitude, updateAmplitude]);

  return (
    <div className="ai-orb-container">
      <canvas 
        ref={canvasRef} 
        className="ai-orb-canvas"
        style={{
          display: 'block',
          background: 'transparent'
        }}
      />
    </div>
  );
}

export default AIOrb;
