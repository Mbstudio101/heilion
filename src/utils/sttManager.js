// Speech-to-Text manager with fallback logic

export async function transcribe(audioFilePath, settings) {
  const provider = settings?.sttProvider || 'local';
  // Default to true for fallback if not explicitly set to false
  const useFallback = settings?.sttFallback !== false;

  try {
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
        
        // Check if cloud STT API key exists
        const keyResult = await window.electronAPI.getApiKey('stt');
        if (keyResult.success && keyResult.key) {
          try {
            const cloudResult = await cloudSTTTranscribe(audioFilePath, settings);
            if (cloudResult.success) {
              return cloudResult;
            }
          } catch (error) {
            // Cloud also failed - return original error with helpful message
            return {
              success: false,
              error: 'Speech-to-Text unavailable. Please install whisper.cpp or configure cloud STT in settings.',
              suggestion: 'Install whisper.cpp: https://github.com/ggerganov/whisper.cpp or add STT API key in settings'
            };
          }
        }
        
        // No cloud API key - return helpful error message
        return {
          success: false,
          error: 'Speech-to-Text unavailable. Please install whisper.cpp or configure cloud STT API key in settings.',
          suggestion: 'Install whisper.cpp: https://github.com/ggerganov/whisper.cpp or add STT API key in settings'
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
    // Call whisper.cpp via Electron main process
    const result = await window.electronAPI.runWhisper(audioFilePath);
    
    if (result.success) {
      return { success: true, transcript: result.transcript };
    } else {
      // Provide helpful error message if whisper.cpp is not found
      const errorMsg = result.error || 'Whisper transcription failed';
      const suggestion = result.suggestion || '';
      
      if (errorMsg.includes('not found') || errorMsg.includes('ENOENT')) {
        return { 
          success: false, 
          error: 'Whisper.cpp not installed. Please install whisper.cpp or use cloud STT.',
          suggestion: 'Install whisper.cpp: https://github.com/ggerganov/whisper.cpp',
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

export async function cloudSTTTranscribe(audioFilePath, settings) {
  try {
    // Get API key
    const keyResult = await window.electronAPI.getApiKey('stt');
    if (!keyResult.success || !keyResult.key) {
      throw new Error('STT API key not found');
    }

    // Read audio file and convert to base64 or form data
    // For now, placeholder - would need to read file in main process
    // In production, use OpenAI Whisper API or Google Speech-to-Text
    
    // Placeholder implementation
    throw new Error('Cloud STT not yet implemented - use OpenAI Whisper API or Google STT');
  } catch (error) {
    return { success: false, error: error.message };
  }
}
