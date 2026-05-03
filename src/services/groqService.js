const axios = require('axios');
const { GROQ_API_KEY, GROQ_CONFIG } = require('../config/constants');

/**
 * Refine user query into a high-intent search query
 */
const refineQuery = async (userMessage) => {
  try {
    if (!GROQ_API_KEY) return userMessage;

    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: GROQ_CONFIG.model,
        messages: [
          {
            role: 'system',
            content: `
You convert user input into a high-quality Google search query.

Rules:
- One short sentence only
- No explanation
- Include "India" if relevant
- Add intent (best, price, near me, etc.)
- Remove unnecessary words
`
          },
          {
            role: 'user',
            content: userMessage
          }
        ],
        temperature: 0.2,
        max_tokens: 50
      },
      {
        headers: {
          Authorization: `Bearer ${GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return response?.data?.choices?.[0]?.message?.content?.trim() || userMessage;
  } catch (error) {
    console.error('❌ refineQuery error:', error.message);
    return userMessage;
  }
};

/**
 * Format Tavily results into CLEAN WhatsApp output
 */
const formatSearchResults = async (originalQuery, refinedQuery, tavilyResults) => {
  try {
    if (!tavilyResults?.results?.length) {
      return `❌ No results found for "${originalQuery}". Try a different query.`;
    }

    const results = tavilyResults.results.slice(0, 3);

    // Clean + structured formatting
    let message = `🔍 *Results for:* ${originalQuery}\n\n`;

    results.forEach((r, i) => {
      const title = r.title?.trim() || 'No title';
      const desc = (r.content || '')
        .replace(/\s+/g, ' ')
        .slice(0, 120); // trim noise

      message += `*${i + 1}. ${title}*\n`;
      message += `📄 ${desc}...\n`;
      message += `🔗 ${r.url}\n\n`;
    });

    // Add summary
    const summary = await generateSummary(originalQuery, results);
    if (summary) message += summary;

    return message.trim();
  } catch (error) {
    console.error('❌ formatSearchResults error:', error.message);
    return '⚠️ Error formatting results.';
  }
};

/**
 * Generate ULTRA CLEAN bullet summary
 */
const generateSummary = async (query, results) => {
  try {
    if (!GROQ_API_KEY) return '';

    const compactResults = results
      .map((r) => `${r.title}: ${r.content}`)
      .join('\n');

    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: GROQ_CONFIG.model,
        messages: [
          {
            role: 'system',
            content: `
You summarize search results into SHORT bullet points.

Rules:
- Max 4 bullets
- Each bullet < 12 words
- No intro text
- No conclusion
- No repetition
- Focus only on useful insights
`
          },
          {
            role: 'user',
            content: `Query: ${query}\n\nResults:\n${compactResults}`
          }
        ],
        temperature: 0.2,
        max_tokens: 120
      },
      {
        headers: {
          Authorization: `Bearer ${GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const summary = response?.data?.choices?.[0]?.message?.content?.trim();

    if (!summary) return '';

    return `📌 *Key Insights:*\n${summary}`;
  } catch (error) {
    console.error('❌ summary error:', error.message);
    return '';
  }
};

module.exports = {
  refineQuery,
  formatSearchResults,
  generateSummary
};