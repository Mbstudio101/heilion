// Deck import and management functions
import { parsePPTX, parsePPTXFromBuffer } from './pptxParser';
import { eventBus, EVENTS } from './eventBus';
import { buildCourseOutline, extractConceptsAndRelationships, identifyMisconceptions } from './courseBrainBuilder';

export async function importDeckFromPPTX(filePath) {
  try {
    // Emit import started event
    eventBus.emit(EVENTS.COURSE_IMPORT_STARTED);
    eventBus.emit(EVENTS.ORB_STATE, 'thinking');

    // Import PPTX via Electron dialog
    const result = await window.electronAPI.importPPTX();
    if (!result.success || !result.filePath) {
      return { success: false, error: 'File selection cancelled' };
    }

    const filePath = result.filePath;
    
    // Parse PPTX (will use parsePPTXFromBuffer if fileData is provided)
    eventBus.emit(EVENTS.COURSE_BRAIN_BUILD_STARTED);
    const parseResult = result.fileData 
      ? await parsePPTXFromBuffer(result.fileData)
      : await parsePPTX(filePath);
    
    if (!parseResult.success) {
      return { success: false, error: parseResult.error };
    }

    // Emit parsed event
    eventBus.emit(EVENTS.PPTX_PARSED, { slideCount: parseResult.slides.length });

    // Extract filename
    const fileName = filePath.split('/').pop().replace('.pptx', '') || 'Imported Deck';

    // Create deck in DB (get deckId first)
    const deckResult = await window.electronAPI.dbQuery(
      'INSERT INTO decks (name, file_path) VALUES (?, ?)',
      [fileName, filePath]
    );

    if (!deckResult.success) {
      return { success: false, error: 'Failed to save deck' };
    }

    const deckId = deckResult.data.lastInsertRowid;

    // Copy PPTX to app storage
    const copyResult = await window.electronAPI.copyPPTXToStorage(filePath, deckId);
    if (copyResult.success) {
      // Update DB with storage path
      await window.electronAPI.dbQuery(
        'UPDATE decks SET file_path = ? WHERE id = ?',
        [copyResult.destinationPath, deckId]
      );
      eventBus.emit(EVENTS.COURSE_SAVED, { courseId: deckId, path: copyResult.destinationPath });
    } else {
      // Continue even if copy fails (using original path)
      console.warn('Failed to copy PPTX to storage, using original path:', copyResult.error);
      eventBus.emit(EVENTS.COURSE_SAVED, { courseId: deckId, path: filePath });
    }

    // Save slides
    for (const slide of parseResult.slides) {
      await window.electronAPI.dbQuery(
        'INSERT INTO slides (deck_id, slide_number, title, content, notes) VALUES (?, ?, ?, ?, ?)',
        [deckId, slide.slideNumber, slide.title, slide.content, slide.notes]
      );
    }

    // Emit DB updated event
    eventBus.emit(EVENTS.COURSE_DB_UPDATED, { courseId: deckId });

    // Build study pack (includes LLM-based course brain building)
    // Progress events are emitted inside buildStudyPack
    await buildStudyPack(deckId);
    
    // Generate question bank
    eventBus.emit(EVENTS.COURSE_BRAIN_BUILD_PROGRESS, { pct: 90 });
    await generateQuestionBank(deckId, 30);

    // Emit brain ready event
    eventBus.emit(EVENTS.COURSE_BRAIN_READY);

    // Set as active course
    await setActiveCourse(deckId);

    // Emit course ready event
    eventBus.emit(EVENTS.COURSE_READY, { courseId: deckId });
    eventBus.emit(EVENTS.ORB_STATE, 'idle');

    return { success: true, deckId };
  } catch (error) {
    console.error('Import deck failed:', error);
    eventBus.emit(EVENTS.ORB_STATE, 'idle');
    return { success: false, error: error.message };
  }
}

export async function buildStudyPack(deckId) {
  try {
    // Get all slides for the deck
    const slidesResult = await window.electronAPI.dbQuery(
      'SELECT * FROM slides WHERE deck_id = ? ORDER BY slide_number',
      [deckId]
    );

    if (!slidesResult.success || !slidesResult.data.length) {
      return { success: false, error: 'No slides found' };
    }

    const slides = slidesResult.data;

    // Get settings for LLM configuration
    const { getSettings } = await import('./appBootstrap');
    const settings = getSettings();

    // Check if Ollama is available (try to call it)
    let useLLM = false;
    try {
      const ollamaCheck = await window.electronAPI.checkOllama();
      useLLM = ollamaCheck?.available === true;
    } catch (e) {
      console.warn('Could not check Ollama availability, falling back to simple extraction');
    }

    if (useLLM) {
      // Use LLM-based course brain building
      try {
        // 1. Build structured course outline
        eventBus.emit(EVENTS.COURSE_BRAIN_BUILD_PROGRESS, { pct: 20 });
        const outlineResult = await buildCourseOutline(deckId, slides, settings);
        
        if (outlineResult.success && outlineResult.outline?.topics) {
          // Store outline in database
          for (let i = 0; i < outlineResult.outline.topics.length; i++) {
            const topic = outlineResult.outline.topics[i];
            await window.electronAPI.dbQuery(
              `INSERT INTO course_outline (deck_id, topic_title, subtopics, learning_objectives, topic_order)
               VALUES (?, ?, ?, ?, ?)`,
              [
                deckId,
                topic.title || '',
                JSON.stringify(topic.subtopics || []),
                JSON.stringify(topic.learningObjectives || []),
                i
              ]
            );
          }
        }

        // 2. Extract concepts and relationships
        eventBus.emit(EVENTS.COURSE_BRAIN_BUILD_PROGRESS, { pct: 50 });
        const conceptsResult = await extractConceptsAndRelationships(deckId, slides, settings);
        
        if (conceptsResult.success && conceptsResult.concepts?.concepts) {
          // Store concepts in database
          for (const concept of conceptsResult.concepts.concepts) {
            await window.electronAPI.dbQuery(
              `INSERT OR IGNORE INTO course_concepts (deck_id, term, definition, relationships)
               VALUES (?, ?, ?, ?)`,
              [
                deckId,
                concept.term || '',
                concept.definition || '',
                JSON.stringify(concept.relationships || [])
              ]
            );

            // Also store in mastery table for tracking
            await window.electronAPI.dbQuery(
              `INSERT OR IGNORE INTO mastery (deck_id, slide_id, concept, mastery_level, last_practiced)
               VALUES (?, ?, ?, 0, CURRENT_TIMESTAMP)`,
              [deckId, null, concept.term || '']
            );
          }
        }

        // 3. Identify misconceptions
        eventBus.emit(EVENTS.COURSE_BRAIN_BUILD_PROGRESS, { pct: 80 });
        const misconceptionsResult = await identifyMisconceptions(deckId, slides, settings);
        
        if (misconceptionsResult.success && misconceptionsResult.misconceptions?.misconceptions) {
          // Store misconceptions in database
          for (const misc of misconceptionsResult.misconceptions.misconceptions) {
            await window.electronAPI.dbQuery(
              `INSERT INTO course_misconceptions (deck_id, topic, misconception, correction, confusing_pairs)
               VALUES (?, ?, ?, ?, ?)`,
              [
                deckId,
                misc.topic || '',
                misc.misconception || '',
                misc.correction || '',
                JSON.stringify(misc.confusingPairs || [])
              ]
            );
          }
        }

        eventBus.emit(EVENTS.COURSE_BRAIN_BUILD_PROGRESS, { pct: 100 });

        return {
          success: true,
          outline: outlineResult.outline,
          concepts: conceptsResult.concepts,
          misconceptions: misconceptionsResult.misconceptions,
          method: 'llm'
        };
      } catch (llmError) {
        console.error('LLM-based brain building failed, falling back to simple extraction:', llmError);
        // Fall through to simple extraction
      }
    }

    // Fallback: Simple extraction (original method)
    const outline = slides.map(s => s.title).filter(Boolean).join('\n');

    // Extract key terms (simple word extraction)
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

    // Extract concepts (grouped by slide)
    const concepts = slides.map(slide => ({
      slideId: slide.id,
      concept: slide.title || `Slide ${slide.slide_number}`,
      description: slide.content.substring(0, 200)
    }));

    // Store in mastery table for tracking
    for (const concept of concepts) {
      await window.electronAPI.dbQuery(
        `INSERT OR IGNORE INTO mastery (deck_id, slide_id, concept, mastery_level, last_practiced)
         VALUES (?, ?, ?, 0, CURRENT_TIMESTAMP)`,
        [deckId, concept.slideId, concept.concept]
      );
    }

    return { success: true, outline, keyTerms, concepts, method: 'simple' };
  } catch (error) {
    console.error('Build study pack failed:', error);
    return { success: false, error: error.message };
  }
}

export async function generateQuestionBank(deckId, count = 30) {
  try {
    // Get slides
    const slidesResult = await window.electronAPI.dbQuery(
      'SELECT * FROM slides WHERE deck_id = ? ORDER BY slide_number',
      [deckId]
    );

    if (!slidesResult.success) {
      return { success: false, error: 'Failed to load slides' };
    }

    const slides = slidesResult.data;
    const questions = [];

    // Generate questions - at least 2-3 per slide until we reach count
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
          deckId,
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
      'SELECT id, slide_number FROM slides WHERE deck_id = ?',
      [deckId]
    );

    if (savedSlides.success) {
      savedSlides.data.forEach(slide => {
        slideMap.set(slide.slide_number, slide.id);
      });
    }

    for (const q of questions) {
      await window.electronAPI.dbQuery(
        'INSERT INTO questions (deck_id, slide_id, question_text, correct_answer) VALUES (?, ?, ?, ?)',
        [q.deckId, q.slideId || null, q.questionText, q.idealAnswer]
      );
    }

    return { success: true, questions, count: questions.length };
  } catch (error) {
    console.error('Generate question bank failed:', error);
    return { success: false, error: error.message };
  }
}

function extractKeyPoints(text) {
  // Simple extraction - split by sentences, take first few
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 20);
  return sentences.slice(0, 5).map(s => s.trim());
}

export async function getDeckLibrary() {
  try {
    const result = await window.electronAPI.dbQuery(
      'SELECT * FROM decks ORDER BY created_at DESC'
    );
    return { success: true, decks: result.data || [] };
  } catch (error) {
    return { success: false, error: error.message, decks: [] };
  }
}

export async function getDeck(deckId) {
  try {
    const deckResult = await window.electronAPI.dbQuery(
      'SELECT * FROM decks WHERE id = ?',
      [deckId]
    );

    if (!deckResult.success || !deckResult.data.length) {
      return { success: false, error: 'Deck not found' };
    }

    const deck = deckResult.data[0];

    // Get slides
    const slidesResult = await window.electronAPI.dbQuery(
      'SELECT * FROM slides WHERE deck_id = ? ORDER BY slide_number',
      [deckId]
    );

    // Get questions
    const questionsResult = await window.electronAPI.dbQuery(
      'SELECT * FROM questions WHERE deck_id = ?',
      [deckId]
    );

    return {
      success: true,
      deck,
      slides: slidesResult.data || [],
      questions: questionsResult.data || []
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function deleteDeck(deckId) {
  try {
    // Delete deck (cascades to slides and questions)
    const result = await window.electronAPI.dbQuery(
      'DELETE FROM decks WHERE id = ?',
      [deckId]
    );
    return { success: result.success };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Set active course (imported from appBootstrap to avoid circular dependency)
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
