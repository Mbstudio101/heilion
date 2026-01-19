// Course Brain Builder - Uses LLM to build structured course knowledge
import axios from 'axios';

/**
 * Build structured course outline with topics, subtopics, and learning objectives
 */
export async function buildCourseOutline(deckId, slides, settings) {
  try {
    // Combine all slide content for LLM
    const slideContent = slides.map((slide, idx) => 
      `Slide ${slide.slide_number}: ${slide.title || 'Untitled'}\n${slide.content || ''}\n${slide.notes || ''}`
    ).join('\n\n');

    const prompt = `You are an expert educator analyzing a lecture presentation. Extract and structure the course content.

LECTURE SLIDES:
${slideContent.substring(0, 8000)} ${slideContent.length > 8000 ? '...' : ''}

Create a structured course outline with:
1. Main topics (3-6 topics)
2. Subtopics for each topic (2-4 per topic)
3. Learning objectives (what students should learn from each topic)

Respond with ONLY valid JSON in this exact format:
{
  "topics": [
    {
      "title": "Topic Name",
      "subtopics": ["Subtopic 1", "Subtopic 2"],
      "learningObjectives": ["Objective 1", "Objective 2"]
    }
  ]
}

CRITICAL: Respond ONLY with valid JSON. No markdown, no explanation, just the JSON object.`;

    const ollamaUrl = settings?.ollamaUrl || 'http://localhost:11434';
    const ollamaModel = settings?.ollamaModel || 'llama2';

    const response = await axios.post(`${ollamaUrl}/api/chat`, {
      model: ollamaModel,
      messages: [
        { role: 'system', content: 'You are an expert educator. Always respond with valid JSON only.' },
        { role: 'user', content: prompt }
      ],
      stream: false
    });

    let result;
    const content = response.data.message.content;
    
    // Try to parse JSON from response
    try {
      result = JSON.parse(content);
    } catch {
      // Try to extract JSON from markdown or text
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('Could not parse JSON from LLM response');
      }
    }

    return { success: true, outline: result };
  } catch (error) {
    console.error('Failed to build course outline:', error);
    // Fallback to simple outline
    return {
      success: true,
      outline: {
        topics: slides.slice(0, 5).map(slide => ({
          title: slide.title || `Slide ${slide.slide_number}`,
          subtopics: [],
          learningObjectives: []
        }))
      }
    };
  }
}

/**
 * Extract concept definitions and relationships
 */
export async function extractConceptsAndRelationships(deckId, slides, settings) {
  try {
    const slideContent = slides.map((slide, idx) => 
      `Slide ${slide.slide_number}: ${slide.title || 'Untitled'}\n${slide.content || ''}`
    ).join('\n\n');

    const prompt = `You are an expert analyzing a lecture to extract key concepts and their relationships.

LECTURE CONTENT:
${slideContent.substring(0, 8000)} ${slideContent.length > 8000 ? '...' : ''}

Extract:
1. Key terms/concepts (10-20 most important)
2. Definitions for each concept
3. Relationships between concepts (e.g., "X causes Y", "A differs from B", "C is a type of D")

Respond with ONLY valid JSON in this exact format:
{
  "concepts": [
    {
      "term": "Concept Name",
      "definition": "Clear definition of the concept",
      "relationships": ["X is related to Y", "A differs from B"]
    }
  ]
}

CRITICAL: Respond ONLY with valid JSON. No markdown, no explanation, just the JSON object.`;

    const ollamaUrl = settings?.ollamaUrl || 'http://localhost:11434';
    const ollamaModel = settings?.ollamaModel || 'llama2';

    const response = await axios.post(`${ollamaUrl}/api/chat`, {
      model: ollamaModel,
      messages: [
        { role: 'system', content: 'You are an expert analyzing concepts. Always respond with valid JSON only.' },
        { role: 'user', content: prompt }
      ],
      stream: false
    });

    let result;
    const content = response.data.message.content;
    
    try {
      result = JSON.parse(content);
    } catch {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('Could not parse JSON from LLM response');
      }
    }

    return { success: true, concepts: result };
  } catch (error) {
    console.error('Failed to extract concepts:', error);
    // Fallback to simple concept extraction
    return {
      success: true,
      concepts: {
        concepts: slides.slice(0, 10).map(slide => ({
          term: slide.title || `Slide ${slide.slide_number}`,
          definition: (slide.content || '').substring(0, 150),
          relationships: []
        }))
      }
    };
  }
}

/**
 * Identify common misconceptions
 */
export async function identifyMisconceptions(deckId, slides, settings) {
  try {
    const slideContent = slides.map((slide, idx) => 
      `Slide ${slide.slide_number}: ${slide.title || 'Untitled'}\n${slide.content || ''}`
    ).join('\n\n');

    const prompt = `You are an expert educator identifying common student misconceptions.

LECTURE CONTENT:
${slideContent.substring(0, 8000)} ${slideContent.length > 8000 ? '...' : ''}

Identify:
1. Common mistakes students make when learning this material (5-10 misconceptions)
2. Confusing concept pairs that students often mix up
3. Areas where students typically struggle

Respond with ONLY valid JSON in this exact format:
{
  "misconceptions": [
    {
      "topic": "Topic or concept name",
      "misconception": "What students often get wrong",
      "correction": "The correct understanding",
      "confusingPairs": ["Term A", "Term B"] // if applicable
    }
  ]
}

CRITICAL: Respond ONLY with valid JSON. No markdown, no explanation, just the JSON object.`;

    const ollamaUrl = settings?.ollamaUrl || 'http://localhost:11434';
    const ollamaModel = settings?.ollamaModel || 'llama2';

    const response = await axios.post(`${ollamaUrl}/api/chat`, {
      model: ollamaModel,
      messages: [
        { role: 'system', content: 'You are an expert educator. Always respond with valid JSON only.' },
        { role: 'user', content: prompt }
      ],
      stream: false
    });

    let result;
    const content = response.data.message.content;
    
    try {
      result = JSON.parse(content);
    } catch {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('Could not parse JSON from LLM response');
      }
    }

    return { success: true, misconceptions: result };
  } catch (error) {
    console.error('Failed to identify misconceptions:', error);
    // Return empty misconceptions on error
    return {
      success: true,
      misconceptions: {
        misconceptions: []
      }
    };
  }
}
