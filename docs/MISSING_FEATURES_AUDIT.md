# Missing Features Audit - PPTX Import & Course Brain Pipeline

## Summary
After auditing the codebase against the specified PPTX import → Course Brain pipeline, here are the gaps:

---

## ✅ What's Implemented

1. **Drag & Drop UI** - `TutorScreen.js` has `handleDrop()` that accepts PPTX files
2. **PPTX Parsing** - `pptxParser.js` extracts slides and notes
3. **Database Storage** - Saves decks, slides, questions to SQLite
4. **Basic Study Pack** - `buildStudyPack()` extracts outline and key terms (simple word frequency)
5. **Question Generation** - `generateQuestionBank()` creates 30 questions from slides
6. **Voice Loop** - Working: Wake → Record → STT → LLM → TTS

---

## ❌ What's Missing

### 1. Event Emissions (CRITICAL)

**Missing Events:**
- `EVENTS.COURSE_IMPORT_STARTED` - When user drops PPTX
- `EVENTS.COURSE_SAVED { courseId, path }` - After copying PPTX to app storage
- `EVENTS.PPTX_PARSED { courseId, slideCount }` - After parsing completes
- `EVENTS.COURSE_DB_UPDATED { courseId }` - After SQLite writes
- `EVENTS.COURSE_BRAIN_BUILD_STARTED` - When LLM brain building begins
- `EVENTS.COURSE_BRAIN_BUILD_PROGRESS { pct }` - Optional progress updates
- `EVENTS.COURSE_BRAIN_READY` - When brain building completes
- `EVENTS.COURSE_READY { courseId }` - When everything is ready for chat

**Files to Update:**
- `src/utils/eventBus.js` - Add new event types
- `src/utils/deckManager.js` - Emit events at each stage
- `src/screens/TutorScreen.js` - Subscribe to events for UI updates

---

### 2. PPTX File Copying to App Storage (REQUIRED)

**Current Behavior:**
- `deckManager.js` saves `file_path` as the original path (e.g., `/Users/marvens/Downloads/Lecture.pptx`)
- No copying to app storage directory

**Required Behavior:**
- Copy PPTX to: `~/Library/Application Support/Heilion/Courses/<courseId>/source.pptx`
- Update DB to reference the copied file path
- This ensures the app doesn't rely on external paths

**Files to Update:**
- `main.js` - Add IPC handler for copying file to app storage
- `src/utils/deckManager.js` - Call copy function after file selection

---

### 3. Course Brain Building - LLM-Based (REQUIRED)

**Current Implementation:**
- `buildStudyPack()` does simple text extraction:
  - Outline = slide titles joined
  - Key terms = word frequency (no NLP/AI)
  - Concepts = slide titles with truncated content

**Required Implementation (4A-4D):**

**4A) Course Outline (Topics/Subtopic/Objectives)**
- Use LLM to extract structured outline:
  ```json
  {
    "topics": [
      {
        "title": "Introduction to Biology",
        "subtopics": ["Cell Structure", "Organelles"],
        "learningObjectives": ["Define cell", "Identify organelles"]
      }
    ]
  }
  ```

**4B) Concept Definitions & Relationships**
- Extract key terms with definitions
- Identify relationships: "X causes Y", "A differs from B"
- Store in structured format (new table or JSON column)

**4C) Misconception Identification**
- Use LLM to identify common student mistakes
- Confusing pairs (e.g., "mitosis vs meiosis")
- Store for smart help later

**4D) Question Bank with Rubrics**
- Current: Questions stored but missing rubric fields
- Required fields in `questions` table:
  - `idealAnswer` (exists as `correct_answer`)
  - `keyPoints` (array - currently extracted but not stored)
  - `commonMistakes` (array - missing)

**Files to Update:**
- `main/dbManager.js` - Add `key_points` JSON column, `common_mistakes` JSON column
- `src/utils/deckManager.js` - Add LLM calls for outline, concepts, misconceptions
- Create new utility: `src/utils/courseBrainBuilder.js`

---

### 4. Active Course Management (REQUIRED)

**Missing:**
- No `active_course_id` in settings or DB
- No logic to set course as active after import
- No context switching when active course changes

**Required:**
- Add `activeCourseId` to settings/localStorage
- After import: `setActiveCourse(courseId)`
- Tutor engine should use active course automatically
- UI should show current active course

**Files to Update:**
- `src/utils/appBootstrap.js` - Add `activeCourseId` to default settings
- `src/utils/deckManager.js` - Set active course after import
- `src/utils/tutorEngine.js` - Use active course from settings

---

### 5. Grounded Prompts (RAG-Style Retrieval) (CRITICAL)

**Current Behavior:**
- `tutorSession.js` `gradeAnswer()` only includes deck name in context
- No retrieval of relevant slide snippets when answering user questions
- LLM responds without course-specific content retrieval

**Required Behavior:**
- When user asks a question, retrieve relevant slides/concepts
- Build prompt with: `retrieved_slides + question + LLM response`
- Use semantic search or keyword matching to find relevant content

**Implementation:**
```javascript
async function buildGroundedPrompt(userQuestion, courseId) {
  // 1. Retrieve relevant slides (keyword/semantic search)
  const relevantSlides = await retrieveRelevantSlides(userQuestion, courseId);
  
  // 2. Retrieve relevant concepts/definitions
  const relevantConcepts = await retrieveRelevantConcepts(userQuestion, courseId);
  
  // 3. Build context
  const context = `
    Course Content:
    ${relevantSlides.map(s => `Slide ${s.slide_number}: ${s.content}`).join('\n')}
    
    Key Concepts:
    ${relevantConcepts.map(c => `${c.concept}: ${c.description}`).join('\n')}
    
    Student Question: ${userQuestion}
  `;
  
  return context;
}
```

**Files to Update:**
- `src/utils/tutorSession.js` - Add `buildGroundedPrompt()` before LLM call
- `src/utils/tutorEngine.js` - Use grounded prompts for chat responses

---

### 6. Orb State Updates During Import (UI FEEDBACK)

**Missing:**
- No `EVENTS.ORB_STATE("thinking")` emissions during import stages
- Orb doesn't show visual feedback during parsing/brain building

**Required:**
- Emit `EVENTS.ORB_STATE("thinking")` at import start
- Keep orb in thinking state during all stages
- Emit `EVENTS.ORB_STATE("idle")` when `COURSE_READY`

**Files to Update:**
- `src/utils/deckManager.js` - Emit orb state events
- `src/screens/TutorScreen.js` - Already subscribes to orb state events

---

### 7. Question Bank Rubrics Storage (DATABASE SCHEMA)

**Current Schema:**
```sql
CREATE TABLE questions (
  id INTEGER PRIMARY KEY,
  deck_id INTEGER,
  slide_id INTEGER,
  question_text TEXT,
  correct_answer TEXT,  -- exists
  points INTEGER
);
```

**Missing Columns:**
- `key_points` TEXT (JSON array)
- `common_mistakes` TEXT (JSON array)
- `ideal_answer` TEXT (alias for correct_answer, or separate)
- `difficulty` TEXT (exists in code but not in schema)

**Files to Update:**
- `main/dbManager.js` - Add migration for new columns
- `src/utils/deckManager.js` - Save keyPoints and commonMistakes when generating questions

---

## Implementation Priority

1. **HIGH**: Event emissions (enables UI feedback)
2. **HIGH**: PPTX file copying (ensures portability)
3. **HIGH**: Grounded prompts (core "professor" functionality)
4. **MEDIUM**: Course brain LLM building (enhances quality)
5. **MEDIUM**: Active course management (enables multi-course)
6. **LOW**: Orb state updates (UX polish)
7. **LOW**: Question rubrics schema (future enhancement)

---

## Testing Checklist

After implementing, verify:

- [ ] Drop PPTX → See "Importing lecture..." toast
- [ ] Orb switches to thinking state during import
- [ ] File copied to `~/Library/Application Support/Heilion/Courses/<id>/source.pptx`
- [ ] Events emitted at each stage (check console)
- [ ] Course brain includes structured outline, concepts, misconceptions
- [ ] Questions have keyPoints and commonMistakes in DB
- [ ] Active course set after import
- [ ] Asking question retrieves relevant slides (check LLM prompt)
- [ ] Orb returns to idle after `COURSE_READY`
