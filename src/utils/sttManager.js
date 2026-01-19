// Speech-to-Text manager with fallback logic

export async function transcribe(audioFilePath, settings) {
  const provider = settings?.sttProvider || 'local';
  // Default to true for fallback if not explicitly set to false
  const useFallback = settings?.sttFallback !== false;

  try {
    // Check if HuBERT + Llama 3 is enabled and available
    if (provider === 'hubert-llama') {
      return await hubertLlamaTranscribe(audioFilePath, settings);
    }
    
    if (provider === 'cloud') {
      // Check if API key exists before attempting cloud STT
      const keyResult = await window.electronAPI.getApiKey('stt');
      if (!keyResult.success || !keyResult.key) {
        // No API key available - automatically fall back to local (always use fallback when no key)
        console.warn('Cloud STT API key not found - automatically falling back to local Whisper');
        return await localWhisperTranscribe(audioFilePath, settings);
      }

      // API key exists - try cloud STT with fallback
      try {
        return await cloudSTTTranscribe(audioFilePath, settings);
      } catch (error) {
        console.error('Cloud STT failed:', error);
        // Always fall back if cloud fails, regardless of settings
        console.log('Cloud STT failed, falling back to local Whisper...');
        return await localWhisperTranscribe(audioFilePath, settings);
      }
    } else {
      // Local provider - try whisper.cpp first
      const result = await localWhisperTranscribe(audioFilePath, settings);
      
      // If whisper.cpp is not found and fallback is enabled, try cloud STT automatically
      if (!result.success && result.needsCloud && useFallback) {
        console.warn('Whisper.cpp not available - automatically trying cloud STT fallback');
        
        // Check if OpenAI API key exists (used for Whisper API)
        let keyResult = await window.electronAPI.getApiKey('openai');
        if (!keyResult || !keyResult.success || !keyResult.key) {
          keyResult = await window.electronAPI.getApiKey('stt');
        }
        
        if (keyResult && keyResult.success && keyResult.key) {
          try {
            const cloudResult = await cloudSTTTranscribe(audioFilePath, settings);
            if (cloudResult.success) {
              console.log('✓ Successfully using cloud STT as fallback');
              return cloudResult;
            }
          } catch (error) {
            console.error('Cloud STT fallback also failed:', error);
            // Continue to show helpful error message
          }
        }
        
        // No cloud API key - return silent failure (will be handled by UI)
        return {
          success: false,
          error: '',
          suggestion: '',
          needsCloud: true
        };
      }
      
      return result;
    }
  } catch (error) {
    console.error('STT transcription failed:', error);
    return { success: false, error: error.message };
  }
}

export async function localWhisperTranscribe(audioFilePath, settings) {
  try {
    // Get model name from settings (default: base.en)
    const modelName = settings?.whisperModel || 'base.en';
    
    // Call whisper.cpp via Electron main process (pass model name)
    const result = await window.electronAPI.runWhisper(audioFilePath, modelName);
    
    if (result.success) {
      return { success: true, transcript: result.transcript };
    } else {
      // Provide helpful error message if whisper.cpp is not found
      const errorMsg = result.error || 'Whisper transcription failed';
      const suggestion = result.suggestion || '';
      
      if (errorMsg.includes('not found') || errorMsg.includes('ENOENT')) {
        return { 
          success: false, 
          error: '',
          suggestion: '',
          needsCloud: true
        };
      }
      
      return { 
        success: false, 
        error: errorMsg,
        suggestion 
      };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function hubertLlamaTranscribe(audioFilePath, settings) {
  try {
    // Check if HuBERT + Llama 3 service is available
    if (!window.electronAPI.checkHubertLlama) {
      return {
        success: false,
        error: 'HuBERT + Llama 3 integration not available',
        suggestion: 'This feature requires the HuBERT + Llama 3 sidecar service'
      };
    }
    
    const availability = await window.electronAPI.checkHubertLlama();
    if (!availability || !availability.available) {
      return {
        success: false,
        error: 'HuBERT + Llama 3 service is not running',
        suggestion: 'Please start the HuBERT + Llama 3 service or use another STT provider'
      };
    }
    
    // Build context from course/conversation if available
    let context = '';
    if (settings?.activeCourseId) {
      context = `Student is working on course ID: ${settings.activeCourseId}. `;
    }
    if (settings?.selectedPersona) {
      context += `Tutor persona: ${settings.selectedPersona}. `;
    }
    if (settings?.difficulty) {
      context += `Difficulty level: ${settings.difficulty}. `;
    }
    
    // Call HuBERT + Llama 3 service
    const result = await window.electronAPI.transcribeWithHubertLlama(audioFilePath, context);
    
    if (result.success) {
      // HuBERT+Llama returns both transcript and response
      // For STT, we primarily need the transcript
      return { 
        success: true, 
        transcript: result.transcript || result.response || '',
        // Also include full response for advanced use cases
        fullResponse: result.response 
      };
    } else {
      return { 
        success: false, 
        error: result.error || 'HuBERT + Llama 3 transcription failed' 
      };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function cloudSTTTranscribe(audioFilePath, settings) {
  try {
    // OpenAI Whisper API uses the same API key as OpenAI's other services
    // Try 'openai' first, then fall back to 'stt' for backward compatibility
    let keyResult = await window.electronAPI.getApiKey('openai');
    if (!keyResult || !keyResult.success || !keyResult.key) {
      keyResult = await window.electronAPI.getApiKey('stt');
    }
    
    if (!keyResult || !keyResult.success || !keyResult.key) {
      throw new Error('OpenAI API key not found. Please add your OpenAI API key in Settings (API Keys section).');
    }

    const apiKey = keyResult.key;

    // Read audio file and send to OpenAI Whisper API
    // Use the main process to read the file (renderer can't access file system directly)
    const result = await window.electronAPI.transcribeWithOpenAI(audioFilePath, apiKey);
    
    if (result.success) {
      return { success: true, transcript: result.transcript };
    } else {
      return { success: false, error: result.error || 'OpenAI Whisper API transcription failed' };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
}
