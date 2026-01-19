// PATCH 5: Intent detection for conversation modes

export const CONVERSATION_INTENTS = {
  CHAT: 'CHAT',           // Default: conversational Q&A
  EXPLAIN: 'EXPLAIN',     // "Explain X", "Tell me about Y"
  SUMMARIZE: 'SUMMARIZE', // "Summarize", "Give me an overview"
  PRACTICE: 'PRACTICE'    // "Quiz me", "Test me", "Practice", "Ask me questions"
};

/**
 * Detect user intent from transcript
 * @param {string} transcript - User's spoken input
 * @returns {string} Intent type
 */
export function detectIntent(transcript) {
  if (!transcript) return CONVERSATION_INTENTS.CHAT;
  
  const lower = transcript.toLowerCase().trim();
  
  // Practice mode triggers
  const practicePatterns = [
    /quiz me/i,
    /test me/i,
    /practice/i,
    /ask me (a )?question/i,
    /give me (a )?question/i,
    /let'?s practice/i,
    /i want to practice/i,
    /can you quiz me/i,
    /start (a )?quiz/i
  ];
  
  if (practicePatterns.some(pattern => pattern.test(lower))) {
    return CONVERSATION_INTENTS.PRACTICE;
  }
  
  // Summarize triggers
  const summarizePatterns = [
    /summarize/i,
    /summary/i,
    /overview/i,
    /give me (an )?overview/i,
    /what'?s (the )?summary/i,
    /brief (summary|overview)/i
  ];
  
  if (summarizePatterns.some(pattern => pattern.test(lower))) {
    return CONVERSATION_INTENTS.SUMMARIZE;
  }
  
  // Explain triggers
  const explainPatterns = [
    /explain/i,
    /tell me about/i,
    /what is/i,
    /what are/i,
    /how does/i,
    /how do/i,
    /describe/i,
    /can you explain/i
  ];
  
  if (explainPatterns.some(pattern => pattern.test(lower))) {
    return CONVERSATION_INTENTS.EXPLAIN;
  }
  
  // Default to chat
  return CONVERSATION_INTENTS.CHAT;
}

/**
 * Check if user is requesting practice mode
 */
export function isPracticeRequest(transcript) {
  return detectIntent(transcript) === CONVERSATION_INTENTS.PRACTICE;
}
