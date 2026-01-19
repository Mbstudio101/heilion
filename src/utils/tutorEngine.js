// TutorEngine - State machine for Teach -> Check -> Challenge loop

export const TUTOR_STATES = {
  IDLE: 'idle',
  INTRO: 'intro',        // After PPTX ingest: summarize lecture
  TEACH: 'teach',        // Brief explanation (<= 45 seconds)
  CHECK: 'check',        // Direct understanding question (definition/recall)
  CHALLENGE: 'challenge', // Application question (scenario/compare/predict)
  GRADE: 'grade',        // Grading answer
  ADAPT: 'adapt',        // Adjust difficulty based on score
  SPACED: 'spaced'       // Revisit weak concept (without saying "review")
};

export class TutorEngine {
  constructor(sessionId, courseId, persona, teacherStyle, difficulty) {
    this.sessionId = sessionId;
    this.courseId = courseId;
    this.persona = persona;
    this.teacherStyle = teacherStyle; // friendly, strict, socratic
    this.difficulty = difficulty; // easy, medium, hard
    this.state = TUTOR_STATES.IDLE;
    this.questionHistory = [];
    this.attempts = [];
    this.weakConcepts = [];
    this.currentQuestion = null;
    this.spacedReviewCounter = 0;
  }

  async professorNextStep() {
    try {
      switch (this.state) {
        case TUTOR_STATES.IDLE:
          // Transition to INTRO if course just ingested
          // Try courses table first, fallback to decks
          let courseResult = await window.electronAPI.dbQuery(
            'SELECT * FROM courses WHERE id = ?',
            [this.courseId]
          );
          if (!courseResult.success || !courseResult.data.length) {
            courseResult = await window.electronAPI.dbQuery(
              'SELECT * FROM decks WHERE id = ?',
              [this.courseId]
            );
          }
          if (courseResult.success && courseResult.data.length > 0) {
            this.state = TUTOR_STATES.INTRO;
            return await this.generateIntroStep();
          }
          // Otherwise go to TEACH
          this.state = TUTOR_STATES.TEACH;
          return await this.generateTeachStep();

        case TUTOR_STATES.INTRO:
          // After intro, move to TEACH
          this.state = TUTOR_STATES.TEACH;
          return await this.generateTeachStep();

        case TUTOR_STATES.TEACH:
          // After teaching, ask a CHECK question
          this.state = TUTOR_STATES.CHECK;
          return await this.generateCheckQuestion();

        case TUTOR_STATES.CHECK:
        case TUTOR_STATES.CHALLENGE:
          // After asking question, wait for answer
          // This is handled by submitSpokenAnswer
          return { type: 'waiting', message: 'Waiting for student answer' };

        case TUTOR_STATES.GRADE:
          // After grading, adapt and decide next step
          return await this.generateAdaptStep();

        case TUTOR_STATES.ADAPT:
          // Decide next state based on mastery
          if (this.shouldSpacedReview()) {
            this.state = TUTOR_STATES.SPACED;
            return await this.generateSpacedStep();
          } else if (this.lastScore >= 70) {
            this.state = TUTOR_STATES.CHALLENGE;
            return await this.generateChallengeQuestion();
          } else {
            this.state = TUTOR_STATES.TEACH;
            return await this.generateTeachStep();
          }

        case TUTOR_STATES.SPACED:
          // After spaced review, go back to main flow
          this.state = TUTOR_STATES.CHECK;
          return await this.generateCheckQuestion();

        default:
          this.state = TUTOR_STATES.TEACH;
          return await this.generateTeachStep();
      }
    } catch (error) {
      console.error('TutorEngine error:', error);
      return { type: 'error', message: error.message };
    }
  }

  async generateIntroStep() {
    // Get course summary (using decks table)
    const courseResult = await window.electronAPI.dbQuery(
      'SELECT * FROM decks WHERE id = ?',
      [this.courseId]
    );

    const slidesResult = await window.electronAPI.dbQuery(
      'SELECT COUNT(*) as count FROM slides WHERE course_id = ? OR deck_id = ?',
      [this.courseId, this.courseId]
    );

    const slideCount = slidesResult.success ? slidesResult.data[0]?.count || 0 : 0;

    const introText = `Welcome to today's lecture. We'll be covering ${slideCount} main topics. I'll explain each concept, then quiz you to make sure you understand. Let's begin.`;

    return {
      type: 'intro',
      speakText: introText,
      state: this.state
    };
  }

  async generateTeachStep() {
    // Get next concept to teach based on mastery
    // For now, use slides since concepts table may not exist
    const slideResult = await window.electronAPI.dbQuery(
      `SELECT s.*, COALESCE(m.mastery_level, 0) as mastery_score
       FROM slides s
       LEFT JOIN mastery m ON (s.course_id = m.course_id OR s.deck_id = m.course_id) AND s.id = m.slide_id
       WHERE s.course_id = ? OR s.deck_id = ?
       ORDER BY COALESCE(m.mastery_level, 0) ASC, s.slide_number ASC
       LIMIT 1`,
      [this.courseId, this.courseId]
    );
    
    if (slideResult.success && slideResult.data.length > 0) {
      const slide = slideResult.data[0];
      const teachText = `${slide.title || `Slide ${slide.slide_number}`}. ${slide.content || ''}`.substring(0, 300);
      
      return {
        type: 'teach',
        speakText: teachText,
        state: this.state,
        slideId: slide.id
      };
    }
    
    // Fallback: any slide (check both course_id and deck_id)
    const fallbackSlide = await window.electronAPI.dbQuery(
      'SELECT * FROM slides WHERE course_id = ? OR deck_id = ? ORDER BY slide_number LIMIT 1',
      [this.courseId, this.courseId]
    );
      
    if (fallbackSlide.success && fallbackSlide.data.length > 0) {
      const slide = fallbackSlide.data[0];
      const teachText = `${slide.title || `Slide ${slide.slide_number}`}. ${slide.content || ''}`.substring(0, 300);
      
      return {
        type: 'teach',
        speakText: teachText,
        state: this.state,
        slideId: slide.id
      };
    }

    return { type: 'error', message: 'No slides found' };
  }

  async generateCheckQuestion() {
    // Get a definition/recall question (CHECK type)
    // Note: SQLite doesn't support RANDOM(), use random selection in JS or ORDER BY rowid
    const questionResult = await window.electronAPI.dbQuery(
      `SELECT * FROM questions 
       WHERE deck_id = ? 
       ORDER BY id
       LIMIT 50`,
      [this.courseId]
    );

    let questions = [];
    if (questionResult.success && questionResult.data) {
      questions = questionResult.data.filter(q => 
        q.question_text && (
          q.question_text.includes('What is') || 
          q.question_text.includes('Define') || 
          q.question_text.includes('Explain')
        )
      );
    }

    if (questions.length === 0) {
      // Fallback: any question
      const fallback = await window.electronAPI.dbQuery(
        'SELECT * FROM questions WHERE deck_id = ? ORDER BY id LIMIT 50',
        [this.courseId]
      );
      
      if (fallback.success && fallback.data && fallback.data.length > 0) {
        questions = fallback.data;
      }
    }
    
    if (questions.length > 0) {
      // Randomly select from filtered questions
      const selected = questions[Math.floor(Math.random() * questions.length)];
      this.currentQuestion = selected;
      return {
        type: 'check',
        speakText: selected.question_text,
        questionId: selected.id,
        rubric: {
          idealAnswer: selected.correct_answer || selected.ideal_answer,
          keyPoints: []
        },
        state: this.state
      };
    }

    return { type: 'error', message: 'No questions available' };
  }

  async generateChallengeQuestion() {
    // Get an application question (CHALLENGE type)
    const questionResult = await window.electronAPI.dbQuery(
      `SELECT * FROM questions 
       WHERE deck_id = ?
       ORDER BY id
       LIMIT 100`,
      [this.courseId]
    );

    let questions = [];
    if (questionResult.success && questionResult.data) {
      questions = questionResult.data.filter(q =>
        q.question_text && (
          q.question_text.includes('How would') ||
          q.question_text.includes('Apply') ||
          q.question_text.includes('Compare')
        )
      );
    }

    if (questions.length === 0 && questionResult.success && questionResult.data) {
      // Fallback: use any questions
      questions = questionResult.data;
    }

    if (questions.length > 0) {
      const selected = questions[Math.floor(Math.random() * questions.length)];
      this.currentQuestion = selected;
      return {
        type: 'challenge',
        speakText: selected.question_text,
        questionId: selected.id,
        rubric: {
          idealAnswer: selected.correct_answer || selected.ideal_answer,
          keyPoints: []
        },
        state: this.state
      };
    }

    // If no challenge questions, go to CHECK
    this.state = TUTOR_STATES.CHECK;
    return await this.generateCheckQuestion();
  }

  async generateSpacedStep() {
    // Revisit a weak concept without saying "review"
    if (this.weakConcepts.length === 0) {
      // Get weak concepts from mastery
      const weakResult = await window.electronAPI.dbQuery(
        `SELECT concept, mastery_level 
         FROM mastery 
         WHERE deck_id = ? AND mastery_level < 0.6
         ORDER BY mastery_level ASC
         LIMIT 1`,
        [this.courseId]
      );

      if (weakResult.success && weakResult.data && weakResult.data.length > 0) {
        this.weakConcepts.push(weakResult.data[0].concept);
      }
    }

    if (this.weakConcepts.length > 0) {
      // Get any question from this course
      const questionResult = await window.electronAPI.dbQuery(
        `SELECT * FROM questions 
         WHERE deck_id = ?
         ORDER BY id
         LIMIT 50`,
        [this.courseId]
      );

      if (questionResult.success && questionResult.data && questionResult.data.length > 0) {
        const selected = questionResult.data[Math.floor(Math.random() * questionResult.data.length)];
        this.currentQuestion = selected;
        return {
          type: 'spaced',
          speakText: selected.question_text,
          questionId: selected.id,
          rubric: {
            idealAnswer: selected.correct_answer || selected.ideal_answer,
            keyPoints: []
          },
          state: this.state
        };
      }
    }

    // Fallback: regular check question
    this.state = TUTOR_STATES.CHECK;
    return await this.generateCheckQuestion();
  }

  async generateAdaptStep() {
    // Determine next difficulty and state based on last score
    const lastAttempt = this.attempts[this.attempts.length - 1];
    if (!lastAttempt) {
      this.state = TUTOR_STATES.CHECK;
      return await this.generateCheckQuestion();
    }

    this.lastScore = lastAttempt.score;

    if (lastAttempt.score < 50) {
      // Score too low - simplify and teach again
      if (this.difficulty !== 'easy') {
        // Adjust difficulty down for next question
      }
      return {
        type: 'adapt',
        message: 'Let me explain this differently',
        nextState: TUTOR_STATES.TEACH,
        adjustedDifficulty: 'easy'
      };
    } else if (lastAttempt.score < 70) {
      // Partial understanding - check again with simpler question
      return {
        type: 'adapt',
        message: 'Good start, but let\'s make sure we cover everything',
        nextState: TUTOR_STATES.CHECK,
        adjustedDifficulty: this.difficulty
      };
    } else {
      // Good score - challenge with harder question
      return {
        type: 'adapt',
        message: 'Excellent! Let\'s apply this concept',
        nextState: TUTOR_STATES.CHALLENGE,
        adjustedDifficulty: this.difficulty === 'easy' ? 'medium' : 'hard'
      };
    }
  }

  shouldSpacedReview() {
    // Every 3-5 questions, do a spaced review
    this.spacedReviewCounter++;
    if (this.spacedReviewCounter >= 4) {
      this.spacedReviewCounter = 0;
      return this.weakConcepts.length > 0;
    }
    return false;
  }

  recordAttempt(questionId, transcript, gradeResult) {
    this.attempts.push({
      questionId,
      transcript,
      score: gradeResult.score,
      timestamp: Date.now()
    });

    // Update weak concepts
    if (gradeResult.score < 60 && gradeResult.missingPoints) {
      gradeResult.missingPoints.forEach(point => {
        if (!this.weakConcepts.includes(point)) {
          this.weakConcepts.push(point);
        }
      });
    }

    this.state = TUTOR_STATES.GRADE;
  }

  getCurrentQuestion() {
    return this.currentQuestion;
  }
}
