// Speech-to-Text manager with fallback logic

export async function transcribe(audioFilePath, settings) {
  const provider = settings?.sttProvider || 'local';
  const useFallback = settings?.sttFallback !== false;

  try {
    if (provider === 'cloud') {
      try {
        return await cloudSTTTranscribe(audioFilePath, settings);
      } catch (error) {
        console.error('Cloud STT failed:', error);
        if (useFallback) {
          console.log('Falling back to local Whisper...');
          return await localWhisperTranscribe(audioFilePath, settings);
        }
        throw error;
      }
    } else {
      return await localWhisperTranscribe(audioFilePath, settings);
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
      return { success: false, error: result.error || 'Whisper transcription failed' };
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
