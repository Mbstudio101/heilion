import axios from 'axios';
import { eventBus, EVENTS } from './eventBus';

const PERSONA_PROMPTS = {
  Aries: 'You are an enthusiastic and energetic tutor. Be direct and motivational. Use phrases like "Let\'s go!", "You\'ve got this!", and "Great energy!"',
  Taurus: 'You are a patient and methodical tutor. Be thorough and encouraging. Use phrases like "Take your time", "Well thought out", and "Let\'s build on that"',
  Gemini: 'You are an engaging and versatile tutor. Be conversational and adaptive. Use phrases like "Interesting perspective!", "Let\'s explore that", and "Great connection!"',
  Cancer: 'You are a nurturing and supportive tutor. Be empathetic and caring. Use phrases like "I understand", "You\'re doing great", and "Let\'s take care of that concept"',
  Leo: 'You are a confident and inspiring tutor. Be encouraging and celebratory. Use phrases like "Excellent!", "Show that knowledge!", and "You\'re shining!"',
  Virgo: 'You are a precise and detail-oriented tutor. Be thorough and analytical. Use phrases like "Let\'s be precise", "Good attention to detail", and "Let\'s refine that"',
  Libra: 'You are a balanced and diplomatic tutor. Be fair and considerate. Use phrases like "Let\'s find the balance", "Well-rounded answer", and "Good perspective"',
  Scorpio: 'You are an intense and insightful tutor. Be deep and transformative. Use phrases like "Let\'s dig deeper", "Powerful insight", and "Let\'s master this"',
  Sagittarius: 'You are an adventurous and philosophical tutor. Be expansive and inspiring. Use phrases like "Think bigger!", "Great journey of learning", and "Let\'s explore the why"',
  Capricorn: 'You are a structured and disciplined tutor. Be organized and goal-oriented. Use phrases like "Let\'s build systematically", "Solid foundation", and "Excellent structure"',
  Aquarius: 'You are an innovative and forward-thinking tutor. Be creative and open-minded. Use phrases like "Interesting angle!", "Let\'s think differently", and "Creative approach"',
  Pisces: 'You are an intuitive and compassionate tutor. Be understanding and imaginative. Use phrases like "I see what you mean", "Let\'s flow with that", and "Beautiful insight"'
};

export function getPersonaPrompt(persona, teacherStyle = true, difficulty = 'medium') {
  const basePrompt = PERSONA_PROMPTS[persona] || PERSONA_PROMPTS.Virgo;
  
  const styleModifier = teacherStyle 
    ? 'You are a helpful tutor. Be encouraging, clear, and supportive.'
    : 'You are a mentor. Be direct and honest.';
  
  const difficultyModifier = difficulty === 'easy'
    ? 'Keep feedback simple and clear.'
    : difficulty === 'hard'
    ? 'Provide detailed, advanced feedback.'
    : 'Provide balanced feedback.';
  
  return `${basePrompt} ${styleModifier} ${difficultyModifier}`;
}

export async function gradeAnswer(deckContext, question, transcriptText, personaConfig) {
  const persona = personaConfig?.persona || 'Virgo';
  const personaPrompt = getPersonaPrompt(persona, true, personaConfig?.difficulty || 'medium');
  const llmProvider = personaConfig?.llmProvider || 'local';
  const settings = personaConfig;
  
  const gradingPrompt = `${personaPrompt}

You are grading a student's spoken answer to this question:
QUESTION: ${question.question_text}

The correct answer should cover: ${question.correct_answer || question.idealAnswer || 'Key concepts from the slide'}

Student's answer (transcript): ${transcriptText}

${deckContext ? `Context: This is from deck "${deckContext.name}".` : ''}

Grade this answer and provide a JSON response with EXACTLY these fields:
{
  "score": 85,
  "covered_points": ["point A", "point B"],
  "missing_points": ["concept A", "concept B"],
  "feedback": "Great start! You covered... However...",
  "polished_answer": "The complete answer would be...",
  "follow_up_question": "To deepen your understanding, consider..."
}

CRITICAL: Respond ONLY with valid JSON. No markdown, no explanation, just the JSON object.`;

  if (llmProvider === 'local') {
    return await gradeWithOllama(gradingPrompt, settings);
  } else {
    return await gradeWithCloud(gradingPrompt, settings);
  }
}

async function gradeWithOllama(prompt, settings) {
  try {
    const ollamaUrl = settings.ollamaUrl || 'http://localhost:11434';
    const ollamaModel = settings.ollamaModel || 'llama2';
    
    const response = await axios.post(`${ollamaUrl}/api/chat`, {
      model: ollamaModel,
      messages: [
        { role: 'system', content: 'You are a helpful tutor grading student answers. Always respond with valid JSON.' },
        { role: 'user', content: prompt }
      ],
      stream: false
    });
    
    let result;
    if (typeof response.data.message.content === 'string') {
      try {
        result = JSON.parse(response.data.message.content);
      } catch {
        // If JSON parsing fails, try to extract JSON from response
        const content = response.data.message.content;
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          result = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('Could not parse JSON from response');
        }
      }
    } else {
      result = response.data.message.content;
    }
    
    // Emit grade ready event
    eventBus.emit(EVENTS.GRADE_READY, result);
    
    return {
      success: true,
      score: result.score || 0,
      coveredPoints: result.covered_points || [],
      missingPoints: result.missing_points || [],
      feedback: result.feedback || '',
      polishedAnswer: result.polished_answer || '',
      followUpQuestion: result.follow_up_question || ''
    };
  } catch (error) {
    console.error('Ollama grading failed:', error);
    throw error;
  }
}

async function gradeWithCloud(prompt, settings) {
  // Cloud LLM integration (OpenAI, Anthropic, etc.)
  // This would use keytar to get API keys
  try {
    // Placeholder - implement with actual cloud API
    return {
      success: false,
      error: 'Cloud LLM not yet implemented'
    };
  } catch (error) {
    console.error('Cloud LLM grading failed:', error);
    throw error;
  }
}

// Session management
const activeSessions = new Map();

export async function startSession(deckId, persona) {
  try {
    const sessionId = `session_${deckId}_${Date.now()}`;
    
    const session = {
      id: sessionId,
      deckId: parseInt(deckId),
      persona,
      startedAt: new Date().toISOString(),
      questionsAsked: [],
      attempts: []
    };
    
    activeSessions.set(sessionId, session);
    
    return { success: true, sessionId, session };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function selectNextQuestion(sessionId) {
  try {
    const session = activeSessions.get(sessionId);
    if (!session) {
      return { success: false, error: 'Session not found' };
    }

    const question = await getNextQuestion(session.deckId, null);
    if (question) {
      session.currentQuestionId = question.id;
      return { success: true, question };
    }
    
    return { success: false, error: 'No questions available' };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function askQuestion(sessionId, questionId) {
  try {
    const session = activeSessions.get(sessionId);
    if (!session) {
      return { success: false, error: 'Session not found' };
    }

    // Get question
    const questionResult = await window.electronAPI.dbQuery(
      'SELECT * FROM questions WHERE id = ?',
      [questionId]
    );

    if (!questionResult.success || !questionResult.data.length) {
      return { success: false, error: 'Question not found' };
    }

    const question = questionResult.data[0];
    session.currentQuestionId = questionId;
    session.questionsAsked.push(questionId);

    // Get persona prompt for TTS
    const settings = JSON.parse(localStorage.getItem('heilion-settings') || '{}');
    const persona = session.persona || settings.selectedPersona || 'Virgo';

    // Ask question via TTS (this will trigger SPEAK_START/END events)
    await speak(question.question_text, persona);

    return { success: true, question };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function submitAnswer(sessionId, questionId, transcriptText) {
  try {
    const session = activeSessions.get(sessionId);
    if (!session) {
      return { success: false, error: 'Session not found' };
    }

    // Get question and deck context
    const questionResult = await window.electronAPI.dbQuery(
      'SELECT * FROM questions WHERE id = ?',
      [questionId]
    );

    if (!questionResult.success || !questionResult.data.length) {
      return { success: false, error: 'Question not found' };
    }

    const question = questionResult.data[0];

    // Get deck for context
    const deckResult = await window.electronAPI.dbQuery(
      'SELECT * FROM decks WHERE id = ?',
      [session.deckId]
    );

    const deckContext = deckResult.success ? deckResult.data[0] : null;

    // Get persona config
    const settings = JSON.parse(localStorage.getItem('heilion-settings') || '{}');
    const persona = session.persona || settings.selectedPersona || 'Virgo';

    // Grade answer
    const gradeResult = await gradeAnswer(
      deckContext,
      question,
      transcriptText,
      { persona, difficulty: settings.difficulty || 'medium', ...settings }
    );

    if (!gradeResult.success) {
      return { success: false, error: gradeResult.error || 'Grading failed' };
    }

    // Save attempt
    await saveAttempt(
      questionId,
      transcriptText,
      transcriptText,
      gradeResult
    );

    // Update mastery
    const slideResult = await window.electronAPI.dbQuery(
      'SELECT slide_id FROM questions WHERE id = ?',
      [questionId]
    );
    const slideId = slideResult.success && slideResult.data[0]?.slide_id;
    if (slideId) {
      await updateMastery(session.deckId, slideId, null, gradeResult.score);
    }

    session.attempts.push({
      questionId,
      transcript: transcriptText,
      score: gradeResult.score,
      timestamp: new Date().toISOString()
    });

    return { success: true, ...gradeResult };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function endSession(sessionId) {
  const session = activeSessions.get(sessionId);
  if (session) {
    activeSessions.delete(sessionId);
    return { success: true };
  }
  return { success: false, error: 'Session not found' };
}

export async function getNextQuestion(deckId, userId) {
  // Get questions with mastery levels
  const masteryResult = await window.electronAPI.dbQuery(
    `SELECT q.id, q.question_text, q.correct_answer, 
            COALESCE(SUM(a.score), 0) / COUNT(a.id) as avg_score,
            COUNT(a.id) as attempt_count
     FROM questions q
     LEFT JOIN attempts a ON q.id = a.question_id
     WHERE q.deck_id = ?
     GROUP BY q.id
     ORDER BY avg_score ASC, attempt_count ASC
     LIMIT 1`,
    [deckId]
  );
  
  if (masteryResult.success && masteryResult.data.length > 0) {
    return masteryResult.data[0];
  }
  
  // Fallback: get any question
  const fallbackResult = await window.electronAPI.dbQuery(
    'SELECT * FROM questions WHERE deck_id = ? LIMIT 1',
    [deckId]
  );
  
  if (fallbackResult.success && fallbackResult.data.length > 0) {
    return fallbackResult.data[0];
  }
  
  return null;
}

export async function saveAttempt(questionId, userAnswer, transcript, gradeResult) {
  return await window.electronAPI.dbQuery(
    `INSERT INTO attempts 
     (question_id, user_answer, transcript, score, feedback, polished_answer, follow_up_question)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      questionId,
      userAnswer,
      transcript,
      gradeResult.score,
      gradeResult.feedback,
      gradeResult.polishedAnswer,
      gradeResult.followUpQuestion
    ]
  );
}

export async function updateMastery(deckId, slideId, concept, score) {
  const masteryLevel = score / 100; // Normalize to 0-1
  
  return await window.electronAPI.dbQuery(
    `INSERT INTO mastery (deck_id, slide_id, concept, mastery_level, last_practiced)
     VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(deck_id, slide_id, concept) 
     DO UPDATE SET mastery_level = (mastery_level + ?) / 2, last_practiced = CURRENT_TIMESTAMP`,
    [deckId, slideId, concept || 'general', masteryLevel, masteryLevel]
  );
}
