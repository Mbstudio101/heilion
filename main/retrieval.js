// Slide Retrieval using FTS5 Full-Text Search
const { getDatabase } = require('./dbManager');

/**
 * Search for relevant slides using FTS5
 * @param {number} courseId - Course ID
 * @param {string} query - Search query (user question/transcript)
 * @param {number} limit - Maximum number of results (default: 5)
 * @returns {Array} Array of slide objects with relevance
 */
function searchRelevantSlides(courseId, query, limit = 5) {
  try {
    const db = getDatabase();
    
    // FTS5 search across title, bodyText, and notesText
    // Use bm25() for ranking (better than rank in FTS5)
    const searchQuery = `
      SELECT 
        s.id,
        s.course_id,
        s.slide_number,
        s.title,
        s.content,
        s.notes,
        snippet(slide_fts, 2, '<mark>', '</mark>', '...', 32) as snippet
      FROM slide_fts
      JOIN slides s ON slide_fts.rowid = s.id
      WHERE slide_fts.course_id = ? 
        AND slide_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `;
    
    // Prepare query terms for FTS5 (simple word matching)
    // FTS5 uses space-separated terms, quote phrases
    const searchTerms = query
      .split(/\s+/)
      .filter(term => term.length > 2) // Filter short words
      .map(term => term.replace(/[^\w\s]/g, '')) // Remove punctuation
      .join(' OR '); // OR for broader matching
    
    if (!searchTerms) {
      // Fallback: return first N slides if query is too short (check both course_id and deck_id)
      const fallbackQuery = `
        SELECT * FROM slides 
        WHERE course_id = ? OR deck_id = ?
        ORDER BY slide_number 
        LIMIT ?
      `;
      const stmt = db.prepare(fallbackQuery);
      return stmt.all(courseId, courseId, limit);
    }
    
    const stmt = db.prepare(searchQuery);
    const results = stmt.all(courseId, searchTerms, limit);
    
    return results || [];
  } catch (error) {
    console.error('FTS search error:', error);
    // Fallback to simple keyword search
    try {
      const db = getDatabase();
      const fallbackQuery = `
        SELECT * FROM slides 
        WHERE (course_id = ? OR deck_id = ?)
          AND (title LIKE ? OR content LIKE ? OR notes LIKE ?)
        ORDER BY slide_number 
        LIMIT ?
      `;
      const searchPattern = `%${query}%`;
      const stmt = db.prepare(fallbackQuery);
      return stmt.all(courseId, courseId, searchPattern, searchPattern, searchPattern, limit);
    } catch (fallbackError) {
      console.error('Fallback search error:', fallbackError);
      return [];
    }
  }
}

/**
 * Build context string from relevant slides for LLM prompt
 * @param {number} courseId - Course ID
 * @param {string} query - User question
 * @param {number} maxSlides - Maximum slides to include (default: 5)
 * @returns {string} Formatted context string
 */
function buildSlideContext(courseId, query, maxSlides = 5) {
  const relevantSlides = searchRelevantSlides(courseId, query, maxSlides);
  
  if (relevantSlides.length === 0) {
    return '';
  }
  
  const contextParts = relevantSlides.map((slide, idx) => {
    const parts = [];
    if (slide.title) parts.push(`Title: ${slide.title}`);
    if (slide.content) parts.push(`Content: ${slide.content.substring(0, 300)}${slide.content.length > 300 ? '...' : ''}`);
    if (slide.notes) parts.push(`Notes: ${slide.notes.substring(0, 200)}${slide.notes.length > 200 ? '...' : ''}`);
    
    return `[Slide ${slide.slide_number}]\n${parts.join('\n')}`;
  });
  
  return `\n\nRELEVANT SLIDE CONTENT:\n${contextParts.join('\n\n')}\n`;
}

module.exports = {
  searchRelevantSlides,
  buildSlideContext
};
