// Course import and management functions (PATCH 2: renamed from deckManager)
import { eventBus, EVENTS } from './eventBus';
import { buildCourseOutline, extractConceptsAndRelationships, identifyMisconceptions } from './courseBrainBuilder';

/**
 * PATCH 1 & 2: Import course from PPTX file path
 * - Parsing happens in main process (no large IPC transfer)
 * - Uses "course" terminology throughout
 */
export async function importCourseFromPPTX(sourcePath = null) {
  try {
    // PATCH 3: Event 1 - Import started
    eventBus.emit(EVENTS.COURSE_IMPORT_STARTED, { sourcePath });
    eventBus.emit(EVENTS.ORB_STATE, 'thinking');

    let filePath = sourcePath;
    
    // If no path provided, show file dialog
    if (!filePath) {
      const dialogResult = await window.electronAPI.importPPTX();
      if (!dialogResult.success || !dialogResult.filePath) {
        eventBus.emit(EVENTS.ORB_STATE, 'idle');
        return { success: false, error: 'File selection cancelled' };
      }
      filePath = dialogResult.filePath;
    }

    // PATCH 1: Call main process handler (parses in main, returns metadata only)
    const result = await window.electronAPI.importCourseFromPath(filePath);
    
    if (!result.success) {
      eventBus.emit(EVENTS.ORB_STATE, 'idle');
      return { success: false, error: result.error };
    }

    const { courseId, storedPath, slideCount } = result;

    // PATCH 3: Event 2 - Course saved
    eventBus.emit(EVENTS.COURSE_SAVED, { courseId, storedPath });

    // PATCH 3: Event 3 - PPTX parsed
    eventBus.emit(EVENTS.PPTX_PARSED, { courseId, slideCount });

    // PATCH 3: Event 4 - DB updated (slides saved, FTS triggers fired)
    eventBus.emit(EVENTS.COURSE_DB_UPDATED, { courseId });

    // PATCH 3: Event 5 - Index built (FTS is ready)
    eventBus.emit(EVENTS.COURSE_INDEX_BUILT, { courseId });

    // PATCH 6: Brain build happens async in background
    // Don't await - let it run in background
    buildCourseBrainAsync(courseId);

    // PATCH 5: Skip automatic question generation
    // Questions will be generated on-demand when user requests practice

    // Set as active course
    await setActiveCourse(courseId);

    // PATCH 3: Event 9 - Course ready (user can start talking immediately)
    eventBus.emit(EVENTS.COURSE_READY, { courseId });
    
    // PATCH 7: Orb state - listening if wake word enabled, else idle
    const { getSettings } = await import('./appBootstrap');
    const settings = getSettings();
    const orbState = settings.wakeWordEnabled ? 'listening' : 'idle';
    eventBus.emit(EVENTS.ORB_STATE, orbState);

    return { success: true, courseId };
  } catch (error) {
    console.error('Import course failed:', error);
    eventBus.emit(EVENTS.ORB_STATE, 'idle');
    return { success: false, error: error.message };
  }
}

/**
 * PATCH 6: Build course brain asynchronously in background
 * Progress events are emitted but doesn't block user interaction
 */
async function buildCourseBrainAsync(courseId) {
  try {
    // PATCH 3: Event 6 - Brain build started
    eventBus.emit(EVENTS.COURSE_BRAIN_BUILD_STARTED, { courseId });

    // Get slides (check both course_id and deck_id for compatibility)
    let slidesResult = await window.electronAPI.dbQuery(
      'SELECT * FROM slides WHERE course_id = ? OR deck_id = ? ORDER BY slide_number',
      [courseId, courseId]
    );

    if (!slidesResult.success || !slidesResult.data.length) {
      // Try alternative query
      slidesResult = await window.electronAPI.dbQuery(
        'SELECT * FROM slides WHERE deck_id = ? ORDER BY slide_number',
        [courseId]
      );
      
      if (!slidesResult.success || !slidesResult.data.length) {
        console.warn('No slides found for brain building');
        return;
      }
    }

    const slides = slidesResult.data;

    // Get settings for LLM configuration
    const { getSettings } = await import('./appBootstrap');
    const settings = getSettings();

    // Check if Ollama is available
    let useLLM = false;
    try {
      const ollamaCheck = await window.electronAPI.checkOllama();
      useLLM = ollamaCheck?.available === true;
    } catch (e) {
      console.warn('Could not check Ollama availability, using fallback');
    }

    if (useLLM) {
      // LLM-based course brain building
      try {
        // 1. Build structured course outline (20%)
        eventBus.emit(EVENTS.COURSE_BRAIN_BUILD_PROGRESS, { courseId, pct: 20, stage: 'outline' });
        const outlineResult = await buildCourseOutline(courseId, slides, settings);
        
        if (outlineResult.success && outlineResult.outline?.topics) {
          for (let i = 0; i < outlineResult.outline.topics.length; i++) {
            const topic = outlineResult.outline.topics[i];
            await window.electronAPI.dbQuery(
              `INSERT INTO course_outline (course_id, topic_title, subtopics, learning_objectives, topic_order)
               VALUES (?, ?, ?, ?, ?)`,
              [
                courseId,
                topic.title || '',
                JSON.stringify(topic.subtopics || []),
                JSON.stringify(topic.learningObjectives || []),
                i
              ]
            );
          }
        }

        // 2. Extract concepts and relationships (50%)
        eventBus.emit(EVENTS.COURSE_BRAIN_BUILD_PROGRESS, { courseId, pct: 50, stage: 'concepts' });
        const conceptsResult = await extractConceptsAndRelationships(courseId, slides, settings);
        
        if (conceptsResult.success && conceptsResult.concepts?.concepts) {
          for (const concept of conceptsResult.concepts.concepts) {
            await window.electronAPI.dbQuery(
              `INSERT OR IGNORE INTO course_concepts (course_id, term, definition, relationships)
               VALUES (?, ?, ?, ?)`,
              [
                courseId,
                concept.term || '',
                concept.definition || '',
                JSON.stringify(concept.relationships || [])
              ]
            );

            // Also store in mastery table for tracking
            await window.electronAPI.dbQuery(
              `INSERT OR IGNORE INTO mastery (course_id, slide_id, concept, mastery_level, last_practiced)
               VALUES (?, ?, ?, 0, CURRENT_TIMESTAMP)`,
              [courseId, null, concept.term || '']
            );
          }
        }

        // 3. Identify misconceptions (80%)
        eventBus.emit(EVENTS.COURSE_BRAIN_BUILD_PROGRESS, { courseId, pct: 80, stage: 'misconceptions' });
        const misconceptionsResult = await identifyMisconceptions(courseId, slides, settings);
        
        if (misconceptionsResult.success && misconceptionsResult.misconceptions?.misconceptions) {
          for (const misc of misconceptionsResult.misconceptions.misconceptions) {
            await window.electronAPI.dbQuery(
              `INSERT INTO course_misconceptions (course_id, topic, misconception, correction, confusing_pairs)
               VALUES (?, ?, ?, ?, ?)`,
              [
                courseId,
                misc.topic || '',
                misc.misconception || '',
                misc.correction || '',
                JSON.stringify(misc.confusingPairs || [])
              ]
            );
          }
        }

        eventBus.emit(EVENTS.COURSE_BRAIN_BUILD_PROGRESS, { courseId, pct: 100, stage: 'complete' });
      } catch (llmError) {
        console.error('LLM-based brain building failed, using fallback:', llmError);
        // Fall through to simple extraction
        buildCourseBrainFallback(courseId, slides);
      }
    } else {
      // Fallback: Simple extraction
      buildCourseBrainFallback(courseId, slides);
    }

    // PATCH 3: Event 8 - Brain ready
    eventBus.emit(EVENTS.COURSE_BRAIN_READY, { courseId });
  } catch (error) {
    console.error('Course brain building failed:', error);
    // Still emit ready event so app doesn't hang
    eventBus.emit(EVENTS.COURSE_BRAIN_READY, { courseId });
  }
}

/**
 * Fallback brain building (when Ollama unavailable)
 */
async function buildCourseBrainFallback(courseId, slides) {
  // Simple outline from slide titles
  const outline = slides.map(s => s.title).filter(Boolean).join('\n');

  // Extract key terms (word frequency)
  const allText = slides.map(s => `${s.content} ${s.notes}`).join(' ');
  const words = allText.toLowerCase().match(/\b[a-z]{4,}\b/g) || [];
  const wordFreq = {};
  words.forEach(word => {
    wordFreq[word] = (wordFreq[word] || 0) + 1;
  });
  const keyTerms = Object.entries(wordFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 50)
    .map(([term]) => term);

  // Extract concepts (one per slide)
  const concepts = slides.map(slide => ({
    slideId: slide.id,
    concept: slide.title || `Slide ${slide.slide_number}`,
    description: slide.content.substring(0, 200)
  }));

  // Store in mastery table
  for (const concept of concepts) {
    await window.electronAPI.dbQuery(
      `INSERT OR IGNORE INTO mastery (course_id, slide_id, concept, mastery_level, last_practiced)
       VALUES (?, ?, ?, 0, CURRENT_TIMESTAMP)`,
      [courseId, concept.slideId, concept.concept]
    );
  }
}

/**
 * PATCH 5: Generate questions on-demand (not automatic)
 * Called when user requests practice mode
 */
export async function generateQuestionBankOnDemand(courseId, count = 10) {
  try {
    // Get slides (check both course_id and deck_id)
    const slidesResult = await window.electronAPI.dbQuery(
      'SELECT * FROM slides WHERE course_id = ? OR deck_id = ? ORDER BY slide_number',
      [courseId, courseId]
    );

    if (!slidesResult.success) {
      return { success: false, error: 'Failed to load slides' };
    }

    const slides = slidesResult.data;
    const questions = [];

    // Generate questions - 2-3 per slide until we reach count
    let questionIndex = 0;
    while (questions.length < count && questionIndex < slides.length * 3) {
      const slideIndex = Math.floor(questionIndex / 3);
      const slide = slides[slideIndex % slides.length];

      const qType = questionIndex % 3;

      let questionText, idealAnswer, difficulty;

      if (qType === 0) {
        // Definition/comprehension
        questionText = `What is ${slide.title || 'the main concept'}?`;
        idealAnswer = slide.content.substring(0, 300);
        difficulty = 'easy';
      } else if (qType === 1) {
        // Explanation
        questionText = `Explain the key points about "${slide.title || `Slide ${slide.slide_number}`}"`;
        idealAnswer = slide.content || slide.notes;
        difficulty = 'medium';
      } else {
        // Application
        questionText = `How would you apply the concepts from "${slide.title || `Slide ${slide.slide_number}`}"?`;
        idealAnswer = slide.notes || slide.content.substring(0, 300);
        difficulty = 'hard';
      }

      if (questionText && idealAnswer && idealAnswer.length > 50) {
        questions.push({
          courseId,
          slideId: slide.id,
          questionText,
          idealAnswer,
          difficulty,
          keyPoints: extractKeyPoints(idealAnswer),
          slideRefs: [slide.slide_number]
        });
      }

      questionIndex++;
    }

    // Save questions to DB
    const slideMap = new Map();
    const savedSlides = await window.electronAPI.dbQuery(
      'SELECT id, slide_number FROM slides WHERE course_id = ? OR deck_id = ?',
      [courseId, courseId]
    );

    if (savedSlides.success) {
      savedSlides.data.forEach(slide => {
        slideMap.set(slide.slide_number, slide.id);
      });
    }

    for (const q of questions) {
      await window.electronAPI.dbQuery(
        'INSERT INTO course_questions (course_id, slide_id, question_text, correct_answer) VALUES (?, ?, ?, ?)',
        [q.courseId, q.slideId || null, q.questionText, q.idealAnswer]
      );
    }

    return { success: true, questions, count: questions.length };
  } catch (error) {
    console.error('Generate question bank failed:', error);
    return { success: false, error: error.message };
  }
}

function extractKeyPoints(text) {
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 20);
  return sentences.slice(0, 5).map(s => s.trim());
}

/**
 * PATCH 4: Get relevant slides for grounding LLM responses
 */
export async function getRelevantSlidesForQuery(courseId, query, limit = 5) {
  try {
    const result = await window.electronAPI.searchRelevantSlides(courseId, query, limit);
    return result.success ? result.slides : [];
  } catch (error) {
    console.error('Failed to retrieve relevant slides:', error);
    return [];
  }
}

/**
 * PATCH 4: Build grounded prompt with slide context
 */
export async function buildGroundedPrompt(userQuestion, courseId) {
  if (!courseId) return '';
  
  try {
    const relevantSlides = await getRelevantSlidesForQuery(courseId, userQuestion, 5);
    
    if (relevantSlides.length === 0) {
      return ''; // No context available
    }
    
    const contextParts = relevantSlides.map((slide, idx) => {
      const parts = [];
      if (slide.title) parts.push(`Title: ${slide.title}`);
      if (slide.content) parts.push(`Content: ${slide.content.substring(0, 300)}${slide.content.length > 300 ? '...' : ''}`);
      if (slide.notes) parts.push(`Notes: ${slide.notes.substring(0, 200)}${slide.notes.length > 200 ? '...' : ''}`);
      
      return `[Slide ${slide.slide_number}]\n${parts.join('\n')}`;
    });
    
    return `\n\nRELEVANT SLIDE CONTENT:\n${contextParts.join('\n\n')}\n`;
  } catch (error) {
    console.error('Failed to build grounded prompt:', error);
    return '';
  }
}

// Legacy compatibility functions (for gradual migration)
export async function getCourseLibrary() {
  try {
    // Try courses table first, fallback to decks
    const result = await window.electronAPI.dbQuery(
      'SELECT * FROM courses ORDER BY created_at DESC'
    );
    if (result.success && result.data.length > 0) {
      return { success: true, courses: result.data || [] };
    }
    // Fallback to legacy decks table
    const legacyResult = await window.electronAPI.dbQuery(
      'SELECT * FROM decks ORDER BY created_at DESC'
    );
    return { success: true, courses: legacyResult.data || [] };
  } catch (error) {
    return { success: false, error: error.message, courses: [] };
  }
}

export async function getCourse(courseId) {
  try {
    // Try courses table first
    const courseResult = await window.electronAPI.dbQuery(
      'SELECT * FROM courses WHERE id = ?',
      [courseId]
    );

    let course;
    if (courseResult.success && courseResult.data.length > 0) {
      course = courseResult.data[0];
    } else {
      // Fallback to legacy decks table
      const legacyResult = await window.electronAPI.dbQuery(
        'SELECT * FROM decks WHERE id = ?',
        [courseId]
      );
      if (!legacyResult.success || !legacyResult.data.length) {
        return { success: false, error: 'Course not found' };
      }
      course = legacyResult.data[0];
    }

    // Get slides (check both course_id and deck_id)
    const slidesResult = await window.electronAPI.dbQuery(
      'SELECT * FROM slides WHERE course_id = ? OR deck_id = ? ORDER BY slide_number',
      [courseId, courseId]
    );

    // Get questions
    const questionsResult = await window.electronAPI.dbQuery(
      'SELECT * FROM course_questions WHERE course_id = ?',
      [courseId]
    );

    return {
      success: true,
      course,
      slides: slidesResult.data || [],
      questions: questionsResult.data || []
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function deleteCourse(courseId) {
  try {
    const result = await window.electronAPI.dbQuery(
      'DELETE FROM courses WHERE id = ?',
      [courseId]
    );
    return { success: result.success };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function setActiveCourse(courseId) {
  try {
    const { updateSettings } = await import('./appBootstrap');
    updateSettings({ activeCourseId: courseId });
    return { success: true, courseId };
  } catch (error) {
    console.error('Failed to set active course:', error);
    return { success: false, error: error.message };
  }
}

// Legacy exports for compatibility
export const importDeckFromPPTX = importCourseFromPPTX;
export const getDeckLibrary = getCourseLibrary;
export const getDeck = getCourse;
export const deleteDeck = deleteCourse;
