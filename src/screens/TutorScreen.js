// Single-screen Voice Mode - the main app screen
import React, { useState, useEffect, useRef, useCallback } from 'react';
import TitleBar from '../components/TitleBar';
import SettingsPanel from '../components/SettingsPanel';
import AIOrb from '../components/AIOrb';
import UpdateNotification from '../components/UpdateNotification';
import { TutorEngine, TUTOR_STATES } from '../utils/tutorEngine';
import { importCourseFromPPTX, getCourseLibrary } from '../utils/courseManager';
import { beginActiveCapture, cancelActiveCapture } from '../utils/audioCaptureManager';
import { transcribe } from '../utils/sttManager';
import { startWakeListener, stopWakeListener } from '../utils/wakeWordManager';
import { speak } from '../utils/ttsManager';
import { getSettings, bootstrapApp } from '../utils/appBootstrap';
import { eventBus, EVENTS } from '../utils/eventBus';
import { gradeAnswer } from '../utils/tutorSession';
import './TutorScreen.css';

function TutorScreen() {
  const initializedRef = useRef(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [status, setStatus] = useState('Ready');
  const [transcript, setTranscript] = useState('');
  const [wakeWordAvailable, setWakeWordAvailable] = useState(false);
  const [currentPersona, setCurrentPersona] = useState(null);
  const [isListening, setIsListening] = useState(false);
  const [pendingAutoRecord, setPendingAutoRecord] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [currentCourseId, setCurrentCourseId] = useState(null);
  const [tutorEngine, setTutorEngine] = useState(null);
  const [settings, setSettings] = useState(getSettings());
  const [dragOver, setDragOver] = useState(false);
  
  const dragCounterRef = useRef(0);
  const settingsRef = useRef(settings);
  const pendingAutoRecordRef = useRef(pendingAutoRecord);
  const isListeningRef = useRef(isListening);
  const isSpeakingRef = useRef(isSpeaking);
  const professorTimeoutRef = useRef(null);

  // Keep refs in sync
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    pendingAutoRecordRef.current = pendingAutoRecord;
  }, [pendingAutoRecord]);

  useEffect(() => {
    isListeningRef.current = isListening;
  }, [isListening]);

  useEffect(() => {
    isSpeakingRef.current = isSpeaking;
  }, [isSpeaking]);

  // Define handlers with useCallback to stabilize references
  const handleWakeWordTriggered = useCallback(async ({ persona }) => {
    setCurrentPersona(persona);
    setStatus('Listening...');
    try {
      const result = await beginActiveCapture('wake');
      if (result.success) {
        setIsListening(true);
        eventBus.emit(EVENTS.ORB_STATE_CHANGED, { state: 'listening' });
      }
    } catch (error) {
      console.error('Failed to start recording:', error);
      setStatus('Recording failed');
    }
  }, []);

  // Update wake word availability when settings change
  useEffect(() => {
    if (!settings.wakeWordEnabled) {
      // If wake word is disabled in settings, hide the banner
      setWakeWordAvailable(false);
    }
  }, [settings.wakeWordEnabled]);

  const handleStartRecording = useCallback(async (mode = 'pushToTalk') => {
    try {
      const result = await beginActiveCapture(mode);
      if (result.success) {
        setIsListening(true);
        setStatus('Listening...');
        eventBus.emit(EVENTS.ORB_STATE_CHANGED, { state: 'listening' });
      }
    } catch (error) {
      console.error('Failed to start recording:', error);
      setStatus('Recording failed');
    }
  }, []);

  const handleCaptureStopped = useCallback(async ({ filePath }) => {
    const currentEngine = tutorEngine;
    const currentCourseIdValue = currentCourseId;
    const currentPersonaValue = currentPersona;
    const currentSettings = settingsRef.current;
    
    if (!filePath || !currentEngine) return;

        setStatus('Transcribing...');
        setIsThinking(true);
        eventBus.emit(EVENTS.TRANSCRIBE_STARTED);
        eventBus.emit(EVENTS.THINKING_STARTED);

    try {
      // Transcribe audio
      const transcribeResult = await transcribe(filePath, currentSettings);
      
      if (!transcribeResult.success) {
        // Only show error if there's a meaningful error message
        const errorMsg = transcribeResult.error || '';
        const suggestion = transcribeResult.suggestion || '';
        
        // If error is empty (silent failure), just reset state without showing message
        if (!errorMsg && !suggestion) {
          setStatus('');
          setIsThinking(false);
          eventBus.emit(EVENTS.THINKING_ENDED);
          return;
        }
        
        // Show error message only if it exists
        let displayMessage = `⚠ ${errorMsg}`;
        if (suggestion) {
          displayMessage += '\n\n' + suggestion.replace(/\\n/g, '\n');
        }
        
        setStatus(displayMessage);
        setIsThinking(false);
        eventBus.emit(EVENTS.THINKING_ENDED);
        
        // If it's a setup issue, suggest opening settings
        if (errorMsg.includes('not installed') || errorMsg.includes('unavailable')) {
          setTimeout(() => {
            const openSettings = confirm(
              'Would you like to open Settings to configure Speech-to-Text?\n\n' +
              'You can:\n' +
              '• Switch to Cloud STT (requires OpenAI API key)\n' +
              '• Use HuBERT + Llama 3 (if configured)\n' +
              '• Or install whisper.cpp locally'
            );
            if (openSettings) {
              setSettingsOpen(true);
            }
          }, 500);
        }
        
        // Don't throw - allow user to try again or configure settings
        return;
      }

      const transcriptText = transcribeResult.transcript;
      setTranscript(transcriptText);
      eventBus.emit(EVENTS.TRANSCRIPT_READY, { transcript: transcriptText });
      
      // Get current question from tutor engine
      const question = currentEngine.getCurrentQuestion();
      if (!question) {
        throw new Error('No active question');
      }

      // Grade answer
      setStatus('Grading...');
      const courseResult = await window.electronAPI.dbQuery(
        'SELECT * FROM decks WHERE id = ?',
        [currentCourseIdValue]
      );
      const courseContext = courseResult.success ? courseResult.data[0] : null;

      const gradeResult = await gradeAnswer(
        courseContext,
        question,
        transcriptText,
        {
          persona: currentPersonaValue || currentSettings.selectedPersona || 'Virgo',
          difficulty: currentSettings.difficulty || 'medium',
          ...currentSettings
        }
      );

      if (!gradeResult.success) {
        throw new Error(gradeResult.error || 'Grading failed');
      }

      eventBus.emit(EVENTS.GRADE_READY, gradeResult);
      currentEngine.recordAttempt(question.id, transcriptText, gradeResult);

      // Speak feedback
      const feedbackText = `${gradeResult.feedback}\n\nHere's a polished answer: ${gradeResult.polishedAnswer}\n\n${gradeResult.followUpQuestion}`;
      
      setStatus('Speaking...');
      setIsSpeaking(true);
      eventBus.emit(EVENTS.SPEAK_START);
      await speak(feedbackText, currentSettings.selectedPersona, currentSettings);
      setIsSpeaking(false);
      eventBus.emit(EVENTS.SPEAK_END);

      setIsThinking(false);
      eventBus.emit(EVENTS.THINKING_ENDED);
      eventBus.emit(EVENTS.ORB_STATE_CHANGED, { state: 'idle' });

      // Continue tutor flow - next step will auto-start recording
      // Clear any existing timeout first
      if (professorTimeoutRef.current) {
        clearTimeout(professorTimeoutRef.current);
      }
      professorTimeoutRef.current = setTimeout(() => {
        professorTimeoutRef.current = null;
        setTranscript('');
        // Use the current engine from closure or state
        const engineToUse = currentEngine || tutorEngine;
        if (engineToUse) {
          handleProfessorNextStep(engineToUse);
        }
      }, 2000);
    } catch (error) {
      console.error('Failed to process answer:', error);
      setStatus(`Error: ${error.message}`);
      setIsThinking(false);
      eventBus.emit(EVENTS.THINKING_ENDED);
      eventBus.emit(EVENTS.ORB_STATE_CHANGED, { state: 'idle' });
    }
  }, [tutorEngine, currentCourseId, currentPersona]);

  // Define handleProfessorNextStep first (no dependencies on other callbacks)
  const handleProfessorNextStep = useCallback(async (engine = tutorEngine) => {
    if (!engine) return;

    try {
      const step = await engine.professorNextStep();
      const currentSettings = settingsRef.current;
      
      if (step.type === 'error') {
        setStatus(step.message);
        return;
      }

      if (step.speakText) {
        setStatus('Speaking...');
        setIsSpeaking(true);
        eventBus.emit(EVENTS.ORB_STATE_CHANGED, { state: 'speaking' });
        
        await speak(step.speakText, currentSettings.selectedPersona, currentSettings);
        
        setIsSpeaking(false);
        eventBus.emit(EVENTS.ORB_STATE_CHANGED, { state: 'idle' });
      }

      if (step.questionId) {
        // After asking a question, mark that we should auto-start recording after speaking finishes
        setPendingAutoRecord(true);
        eventBus.emit(EVENTS.QUESTION_ASKED, { questionId: step.questionId });
      } else if (step.type === 'teach') {
        setStatus('Ready');
        // After teaching, automatically move to check
        // Clear any existing timeout first
        if (professorTimeoutRef.current) {
          clearTimeout(professorTimeoutRef.current);
        }
        professorTimeoutRef.current = setTimeout(() => {
          professorTimeoutRef.current = null;
          handleProfessorNextStep(engine);
        }, 1000);
      } else {
        setStatus('Ready');
      }
    } catch (error) {
      console.error('Professor next step error:', error);
      setStatus(`Error: ${error.message}`);
    }
  }, [tutorEngine]);

  const initializeTutor = useCallback((courseId, autoStart = false) => {
    const currentSettings = settingsRef.current;
    const persona = currentSettings.selectedPersona || 'Virgo';
    const teacherStyle = currentSettings.teacherStyle || 'friendly';
    const difficulty = currentSettings.difficulty || 'medium';
    
    const engine = new TutorEngine(null, courseId, persona, teacherStyle, difficulty);
    setTutorEngine(engine);
    setCurrentCourseId(courseId);
    
    // Only auto-start if explicitly requested (e.g., after import)
    // Don't auto-start on app load - wait for user interaction
    if (autoStart) {
      handleProfessorNextStep(engine);
    }
  }, [handleProfessorNextStep]);

  const loadActiveCourse = useCallback(async () => {
    try {
      const result = await getCourseLibrary();
      if (result.success && result.courses && result.courses.length > 0) {
        // Use most recent course as active
        const activeCourse = result.courses[0];
        // Only initialize if course changed
        // Don't auto-start - just set the course as active, wait for user interaction
        if (currentCourseId !== activeCourse.id) {
          setCurrentCourseId(activeCourse.id);
          // Initialize tutor silently (no auto-start)
          initializeTutor(activeCourse.id, false);
        }
      }
    } catch (error) {
      console.error('Failed to load active course:', error);
    }
  }, [currentCourseId, initializeTutor]);

  // Initialize app on mount
  useEffect(() => {
    // Prevent duplicate initialization
    if (initializedRef.current) {
      return;
    }
    initializedRef.current = true;
    
    // Bootstrap app
    bootstrapApp().then((result) => {
      if (result.health) {
        setWakeWordAvailable(result.health.wakeServiceReady || false);
      }
    });

    const currentSettings = getSettings();
    setSettings(currentSettings);
    
    // Check for active course
    loadActiveCourse();

    // Check wake word status
    const wakeStatusHandler = (data) => {
      setWakeWordAvailable(data.available);
      if (data.available && currentSettings.wakeWordEnabled) {
        startWakeListener();
      }
    };
    
    window.electronAPI.onWakeWordStatus(wakeStatusHandler);

    // Subscribe to events
    const unsubscribeWake = eventBus.on(EVENTS.WAKE_TRIGGERED, handleWakeWordTriggered);
    const unsubscribeCapture = eventBus.on(EVENTS.CAPTURE_STOPPED, handleCaptureStopped);
    const unsubscribeSpeakStart = eventBus.on(EVENTS.SPEAK_START, () => setIsSpeaking(true));
    
    // PATCH 7: Course import event listeners
    const unsubscribeCourseReady = eventBus.on(EVENTS.COURSE_READY, async ({ courseId }) => {
      // Natural greeting after import
      if (courseId && tutorEngine) {
        const greeting = "Got it — I loaded your slides. Ask me anything about them.";
        await speak(greeting, {
          persona: currentSettings.selectedPersona || 'Virgo',
          voice: currentSettings.selectedVoice || 'default'
        }, currentSettings);
      }
    });
    
    // BARGE-IN: Stop TTS when user starts speaking while TTS is playing
    // Setup continuous mic monitoring for barge-in (even when not recording)
    let bargeInThreshold = 0.02; // RMS threshold for barge-in (slightly higher than silence)
    let bargeInAnalyser = null;
    let bargeInContext = null;
    let bargeInStream = null;
    let bargeInMonitoring = false;
    
    const startBargeInMonitoring = async () => {
      if (bargeInMonitoring) return;
      
      try {
        // Get mic stream for barge-in monitoring
        bargeInStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        bargeInContext = new (window.AudioContext || window.webkitAudioContext)();
        const source = bargeInContext.createMediaStreamSource(bargeInStream);
        bargeInAnalyser = bargeInContext.createAnalyser();
        bargeInAnalyser.fftSize = 256;
        bargeInAnalyser.smoothingTimeConstant = 0.8;
        source.connect(bargeInAnalyser);
        
        bargeInMonitoring = true;
        
        // Monitor mic amplitude for barge-in
        const checkBargeIn = () => {
          if (!bargeInMonitoring || !bargeInAnalyser) return;
          
          const bufferLength = bargeInAnalyser.frequencyBinCount;
          const dataArray = new Uint8Array(bufferLength);
          bargeInAnalyser.getByteTimeDomainData(dataArray);
          
          // Calculate RMS amplitude
          let sumSquares = 0;
          for (let i = 0; i < bufferLength; i++) {
            const normalized = (dataArray[i] - 128) / 128;
            sumSquares += normalized * normalized;
          }
          const rms = Math.sqrt(sumSquares / bufferLength);
          const level = Math.min(rms * 2, 1);
          
          // If user is speaking (above threshold) while TTS is playing, barge-in!
          if (level > bargeInThreshold && isSpeakingRef.current && !isListeningRef.current) {
            handleBargeIn();
          }
          
          requestAnimationFrame(checkBargeIn);
        };
        
        checkBargeIn();
      } catch (error) {
        console.error('Failed to start barge-in monitoring:', error);
      }
    };
    
    const stopBargeInMonitoring = () => {
      bargeInMonitoring = false;
      if (bargeInStream) {
        bargeInStream.getTracks().forEach(track => track.stop());
        bargeInStream = null;
      }
      if (bargeInContext) {
        bargeInContext.close().catch(() => {});
        bargeInContext = null;
      }
      bargeInAnalyser = null;
    };
    
    const handleBargeIn = async () => {
      // User started speaking while TTS is playing - barge-in!
      const { stopSpeaking } = await import('../utils/ttsManager');
      await stopSpeaking();
      
      // Stop barge-in monitoring (will start proper capture)
      stopBargeInMonitoring();
      
      // Clear any pending auto-record timeout
      if (professorTimeoutRef.current) {
        clearTimeout(professorTimeoutRef.current);
        professorTimeoutRef.current = null;
      }
      
      // Start capture immediately
      setStatus('Listening...');
      await handleStartRecording('barge-in');
    };
    
    // Start barge-in monitoring when TTS starts
    const handleSpeakStartForBargeIn = () => {
      setIsSpeaking(true);
      if (!isListeningRef.current) {
        startBargeInMonitoring();
      }
    };
    
    const unsubscribeSpeakStartForBargeIn = eventBus.on(EVENTS.SPEAK_START, handleSpeakStartForBargeIn);
    
    // Stop barge-in monitoring when TTS ends or capture starts
    const handleCaptureStartedForBargeIn = () => {
      stopBargeInMonitoring();
    };
    
    const unsubscribeCaptureStartedForBargeIn = eventBus.on(EVENTS.CAPTURE_STARTED, handleCaptureStartedForBargeIn);
    
    // Handle auto-start recording after tutor finishes speaking a question
    const handleSpeakEnd = async () => {
      setIsSpeaking(false);
      // If we have a pending auto-record (after asking a question), start recording
      if (pendingAutoRecordRef.current && !isListeningRef.current) {
        setPendingAutoRecord(false);
        setStatus('Listening...');
        // Brief pause before auto-start recording (user's turn to speak)
        professorTimeoutRef.current = setTimeout(async () => {
          professorTimeoutRef.current = null;
          if (!isListeningRef.current && !isSpeakingRef.current) {
            await handleStartRecording('auto');
          }
        }, 800); // 800ms pause after tutor finishes speaking
      }
    };
    
    const unsubscribeSpeakEnd = eventBus.on(EVENTS.SPEAK_END, handleSpeakEnd);

    return () => {
      // Clear any pending timeouts
      if (professorTimeoutRef.current) {
        clearTimeout(professorTimeoutRef.current);
        professorTimeoutRef.current = null;
      }
      stopWakeListener();
      stopBargeInMonitoring(); // Clean up barge-in monitoring
      unsubscribeWake();
      unsubscribeCapture();
      unsubscribeSpeakStart();
      unsubscribeSpeakStartForBargeIn();
      unsubscribeCaptureStartedForBargeIn();
      unsubscribeSpeakEnd();
      unsubscribeCourseReady();
      
      // Remove wake word status listener
      if (window.electronAPI && window.electronAPI.removeWakeWordStatusListener) {
        window.electronAPI.removeWakeWordStatusListener(wakeStatusHandler);
      }
    };
  }, []); // Empty deps - only run once on mount to prevent duplicate registrations

  // Drag & Drop handlers
  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setDragOver(true);
    }
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setDragOver(false);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    dragCounterRef.current = 0;

    const files = Array.from(e.dataTransfer.files);
    const pptxFile = files.find(f => f.name.endsWith('.pptx'));

    if (pptxFile) {
      await handlePPTXUpload(pptxFile);
    }
  };

  const handlePPTXUpload = async (file) => {
    // PATCH 1: Get file path from File object
    // In Electron drag-drop, File object has .path property
    setStatus('Importing PPTX...');
    setIsThinking(true);

    try {
      // PATCH 1: Import from path (use file.path if available from drag-drop)
      const filePath = file?.path || null;
      const result = await importCourseFromPPTX(filePath);
      
      if (!result.success) {
        throw new Error(result.error || 'Import failed');
      }

      // Initialize tutor with new course (auto-start after import greeting)
      // The greeting will be spoken by the COURSE_READY event listener
      // Then we'll auto-start the tutor session
      initializeTutor(result.courseId, false);
      
      setStatus('Course imported. Ready to chat!');
    } catch (error) {
      console.error('PPTX upload failed:', error);
      setStatus(`Import failed: ${error.message}`);
      eventBus.emit(EVENTS.ORB_STATE, 'idle');
    } finally {
      setIsThinking(false);
    }
  };

  const handleStopRecording = async () => {
    try {
      await cancelActiveCapture();
      setIsListening(false);
      setStatus('Processing...');
      eventBus.emit(EVENTS.ORB_STATE_CHANGED, { state: 'thinking' });
    } catch (error) {
      console.error('Failed to stop recording:', error);
      setIsListening(false);
    }
  };

  const handleManualStart = () => {
    if (!isListening) {
      handleStartRecording('pushToTalk');
    } else {
      handleStopRecording();
    }
  };

  return (
    <>
      <TitleBar />
      <div 
        className={`voice-mode-screen ${dragOver ? 'drag-over' : ''}`}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
      <button 
        className="gear-btn" 
        onClick={() => setSettingsOpen(true)}
        title="Settings"
        aria-label="Settings"
      >
        <svg 
          width="16" 
          height="16" 
          viewBox="0 0 24 24" 
          fill="none" 
          stroke="currentColor" 
          strokeWidth="2" 
          strokeLinecap="round" 
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="3"></circle>
          <path d="M12 1v6m0 6v6m9-9h-6m-6 0H3m16.364 5.636l-4.243-4.243m-8.242 0L4.636 6.364m14.728 11.272l-4.243-4.243m-8.242 0L4.636 17.636"></path>
        </svg>
      </button>

      {dragOver && (
        <div className="drag-overlay">
          <div className="drag-message">Drop PPTX file here to import course</div>
        </div>
      )}
      
      <div className="voice-center">
        <AIOrb 
          isListening={isListening}
          isThinking={isThinking}
          isSpeaking={isSpeaking}
        />
        <div className="status-text">{status}</div>
        {currentPersona && (
          <div className="persona-badge">{currentPersona}</div>
        )}
      </div>
      
      {transcript && (
        <div className="transcript-bar">
          {transcript}
        </div>
      )}
      
      {!wakeWordAvailable && settings.wakeWordEnabled && (
        <div className="wake-word-banner">
          Wake word not available. Using push-to-talk mode.
        </div>
      )}

      {!currentCourseId && (
        <div className="empty-state">
          <p>Drop a PPTX file here to start</p>
        </div>
      )}
      
      <button 
        className="manual-record-btn" 
        onClick={handleManualStart}
        disabled={!currentCourseId}
        style={{
          opacity: isListening ? 0.3 : 0.7,
          pointerEvents: isListening ? 'none' : 'auto'
        }}
        title={isListening ? 'Recording automatically (will stop when you finish speaking)' : 'Manually start/stop recording'}
      >
        {isListening ? 'Recording... (Auto-stop on silence)' : 'Start Recording'}
      </button>
      
      <SettingsPanel 
        isOpen={settingsOpen}
        onClose={() => {
          setSettingsOpen(false);
          // Update settings ref and state
          const updatedSettings = getSettings();
          settingsRef.current = updatedSettings;
          setSettings(updatedSettings);
          // Reload active course if changed (only if tutor exists)
          if (tutorEngine) {
            loadActiveCourse();
          }
        }}
        currentCourseId={currentCourseId}
        onCourseChange={(courseId) => {
          // Change course silently - don't auto-start, wait for user interaction
          initializeTutor(courseId, false);
        }}
      />
      
      <UpdateNotification />
      </div>
    </>
  );
}

export default TutorScreen;
