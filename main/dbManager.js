// Database Manager - Handles all SQLite operations
const path = require('path');
const { app } = require('electron');
const Database = require('better-sqlite3');

let db = null;

function initDatabase() {
  const dbPath = path.join(app.getPath('userData'), 'heilion.db');
  db = new Database(dbPath);
  
  // Create tables (using "courses" instead of "decks" for consistency)
  db.exec(`
    -- Main courses table (renamed from decks)
    CREATE TABLE IF NOT EXISTS courses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      file_path TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    
    -- Legacy decks table for migration compatibility (will be removed later)
    CREATE TABLE IF NOT EXISTS decks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      file_path TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE TABLE IF NOT EXISTS slides (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      course_id INTEGER,
      deck_id INTEGER,
      slide_number INTEGER NOT NULL,
      title TEXT,
      content TEXT,
      notes TEXT,
      FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
      FOREIGN KEY (deck_id) REFERENCES decks(id) ON DELETE CASCADE
    );
    
    -- FTS5 virtual table for full-text search
    -- Using simple FTS5 table (not external content) for easier maintenance
    CREATE VIRTUAL TABLE IF NOT EXISTS slide_fts USING fts5(
      course_id UNINDEXED,
      slide_number UNINDEXED,
      title,
      bodyText,
      notesText
    );
    
    -- Triggers to keep FTS in sync with slides
    CREATE TRIGGER IF NOT EXISTS slides_ai AFTER INSERT ON slides BEGIN
      INSERT INTO slide_fts(rowid, course_id, slide_number, title, bodyText, notesText)
      VALUES (new.id, COALESCE(new.course_id, new.deck_id), new.slide_number, new.title, new.content, new.notes);
    END;
    
    CREATE TRIGGER IF NOT EXISTS slides_ad AFTER DELETE ON slides BEGIN
      DELETE FROM slide_fts WHERE rowid = old.id;
    END;
    
    CREATE TRIGGER IF NOT EXISTS slides_au AFTER UPDATE ON slides BEGIN
      UPDATE slide_fts SET
        course_id = COALESCE(new.course_id, new.deck_id),
        slide_number = new.slide_number,
        title = new.title,
        bodyText = new.content,
        notesText = new.notes
      WHERE rowid = new.id;
    END;
    
    CREATE TABLE IF NOT EXISTS course_questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      course_id INTEGER NOT NULL,
      slide_id INTEGER,
      question_text TEXT NOT NULL,
      correct_answer TEXT,
      points INTEGER DEFAULT 100,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
      FOREIGN KEY (slide_id) REFERENCES slides(id) ON DELETE CASCADE
    );
    
    -- Legacy questions table for migration
    CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      deck_id INTEGER NOT NULL,
      slide_id INTEGER,
      question_text TEXT NOT NULL,
      correct_answer TEXT,
      points INTEGER DEFAULT 100,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (deck_id) REFERENCES decks(id) ON DELETE CASCADE,
      FOREIGN KEY (slide_id) REFERENCES slides(id) ON DELETE CASCADE
    );
    
    CREATE TABLE IF NOT EXISTS attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question_id INTEGER NOT NULL,
      user_answer TEXT,
      transcript TEXT,
      score INTEGER,
      feedback TEXT,
      polished_answer TEXT,
      follow_up_question TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (question_id) REFERENCES course_questions(id) ON DELETE CASCADE
    );
    
    CREATE TABLE IF NOT EXISTS mastery (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      course_id INTEGER NOT NULL,
      slide_id INTEGER,
      concept TEXT,
      mastery_level REAL DEFAULT 0.0,
      last_practiced DATETIME,
      FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
      FOREIGN KEY (slide_id) REFERENCES slides(id) ON DELETE CASCADE,
      UNIQUE(course_id, slide_id, concept)
    );
    
    CREATE TABLE IF NOT EXISTS course_outline (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      course_id INTEGER NOT NULL,
      topic_title TEXT NOT NULL,
      subtopics TEXT, -- JSON array
      learning_objectives TEXT, -- JSON array
      topic_order INTEGER,
      FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
    );
    
    CREATE TABLE IF NOT EXISTS course_concepts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      course_id INTEGER NOT NULL,
      term TEXT NOT NULL,
      definition TEXT,
      relationships TEXT, -- JSON array
      FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
      UNIQUE(course_id, term)
    );
    
    CREATE TABLE IF NOT EXISTS course_misconceptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      course_id INTEGER NOT NULL,
      topic TEXT,
      misconception TEXT NOT NULL,
      correction TEXT,
      confusing_pairs TEXT, -- JSON array
      FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
    );
  `);
  
  // Check and migrate schema if needed
  try {
    // Check if slides table has course_id column
    const slidesInfo = db.prepare("PRAGMA table_info(slides)").all();
    const hasCourseId = slidesInfo.some(col => col.name === 'course_id');
    const hasDeckId = slidesInfo.some(col => col.name === 'deck_id');
    
    // Add course_id if missing
    if (!hasCourseId) {
      try {
        db.exec('ALTER TABLE slides ADD COLUMN course_id INTEGER');
      } catch (e) {
        // Column may already exist or table missing - ignore
      }
    }
    
    // Add deck_id if missing (for legacy support)
    if (!hasDeckId) {
      try {
        db.exec('ALTER TABLE slides ADD COLUMN deck_id INTEGER');
      } catch (e) {
        // Column may already exist - ignore
      }
    }
    
    // Migrate data from decks to courses if needed
    const coursesCheck = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='courses'").get();
    const decksCheck = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='decks'").get();
    
    if (coursesCheck && decksCheck) {
      // Copy any decks that don't exist in courses
      db.exec(`
        INSERT OR IGNORE INTO courses (id, name, file_path, created_at)
        SELECT id, name, file_path, created_at FROM decks;
      `);
      
      // Update slides to have course_id from deck_id
      db.exec(`
        UPDATE slides SET course_id = deck_id WHERE course_id IS NULL AND deck_id IS NOT NULL;
      `);
    }
  } catch (error) {
    // Migration check failed (non-fatal) - ignore
  }
  
  return db;
}

function getDatabase() {
  if (!db) {
    return initDatabase();
  }
  return db;
}

function queryDatabase(query, params = []) {
  try {
    const database = getDatabase();
    const stmt = database.prepare(query);
    if (query.trim().toLowerCase().startsWith('select')) {
      return { success: true, data: stmt.all(params) };
    } else {
      return { success: true, data: stmt.run(params) };
    }
  } catch (error) {
    console.error('Database error:', error);
    return { success: false, error: error.message };
  }
}

function closeDatabase() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = {
  initDatabase,
  getDatabase,
  queryDatabase,
  closeDatabase
};
