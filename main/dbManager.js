// Database Manager - Handles all SQLite operations
const path = require('path');
const { app } = require('electron');
const Database = require('better-sqlite3');

let db = null;

function initDatabase() {
  const dbPath = path.join(app.getPath('userData'), 'heilion.db');
  db = new Database(dbPath);
  
  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS decks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      file_path TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE TABLE IF NOT EXISTS slides (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      deck_id INTEGER NOT NULL,
      slide_number INTEGER NOT NULL,
      title TEXT,
      content TEXT,
      notes TEXT,
      FOREIGN KEY (deck_id) REFERENCES decks(id) ON DELETE CASCADE
    );
    
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
      FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
    );
    
    CREATE TABLE IF NOT EXISTS mastery (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      deck_id INTEGER NOT NULL,
      slide_id INTEGER,
      concept TEXT,
      mastery_level REAL DEFAULT 0.0,
      last_practiced DATETIME,
      FOREIGN KEY (deck_id) REFERENCES decks(id) ON DELETE CASCADE,
      FOREIGN KEY (slide_id) REFERENCES slides(id) ON DELETE CASCADE,
      UNIQUE(deck_id, slide_id, concept)
    );
    
    CREATE TABLE IF NOT EXISTS course_outline (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      deck_id INTEGER NOT NULL,
      topic_title TEXT NOT NULL,
      subtopics TEXT, -- JSON array
      learning_objectives TEXT, -- JSON array
      topic_order INTEGER,
      FOREIGN KEY (deck_id) REFERENCES decks(id) ON DELETE CASCADE
    );
    
    CREATE TABLE IF NOT EXISTS course_concepts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      deck_id INTEGER NOT NULL,
      term TEXT NOT NULL,
      definition TEXT,
      relationships TEXT, -- JSON array
      FOREIGN KEY (deck_id) REFERENCES decks(id) ON DELETE CASCADE,
      UNIQUE(deck_id, term)
    );
    
    CREATE TABLE IF NOT EXISTS course_misconceptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      deck_id INTEGER NOT NULL,
      topic TEXT,
      misconception TEXT NOT NULL,
      correction TEXT,
      confusing_pairs TEXT, -- JSON array
      FOREIGN KEY (deck_id) REFERENCES decks(id) ON DELETE CASCADE
    );
  `);
  
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
