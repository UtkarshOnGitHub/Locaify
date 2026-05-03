// Groq LLM Service
const axios = require('axios');
const { GROQ_API_KEY, GROQ_CONFIG } = require('../config/constants');

/**
 * Refine user query using Groq LLM for better search results
 * @param {string} userMessage - User's original message
 * @returns {Promise<string>} Refined query for Tavily
 */
const refineQuery = async (userMessage) => {
  try {
    if (!GROQ_API_KEY) {
      console.warn('⚠️  GROQ_API_KEY not set, using original message');
      return userMessage;
    }

    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: GROQ_CONFIG.model,
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant that refines user queries into clear, concise search queries. Keep the refined query to one sentence. Return ONLY the refined query, nothing else.'
          },
          {
            role: 'user',
            content: `Refine this query for a web search in India: "${userMessage}"`
          }
        ],
        temperature: GROQ_CONFIG.temperature,
        max_tokens: GROQ_CONFIG.max_tokens
      },
      {
        headers: {
          'Authorization': `Bearer ${GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const refinedQuery = response.data.choices[0].message.content.trim();
    console.log(`📝 Refined Query: "${refinedQuery}"`);
    return refinedQuery;
  } catch (error) {
    console.error('❌ Query refinement error:', error.message);
    return userMessage; // Fallback to original query
  }
};

/**
 * Format Tavily search results into a nice WhatsApp message
 * @param {string} originalQuery - Original user message
 * @param {string} refinedQuery - Refined query sent to Tavily
 * @param {Object} tavilyResults - Results from Tavily API
 * @returns {Promise<string>} Formatted message for WhatsApp
 */
const formatSearchResults = async (originalQuery, refinedQuery, tavilyResults) => {
  try {
    if (!tavilyResults || !tavilyResults.results || tavilyResults.results.length === 0) {
      return `🤔 No results found for "${originalQuery}". Try rephrasing your question.`;
    }

    const results = tavilyResults.results.slice(0, 3); // Top 3 results
    
    let message = `🔍 *Search Results*\n`;
    message += `• User question: ${originalQuery}\n`;
    message += `• Refined query: ${refinedQuery}\n\n`;
    
    results.forEach((result, index) => {
      message += `*${index + 1}. ${result.title || 'Untitled'}*\n`;
      message += `${result.content || 'No description available'}\n`;
      message += `🔗 Source: ${result.url || 'N/A'}\n\n`;
    });

    // Add summary using Groq if available
    if (GROQ_API_KEY && results.length > 0) {
      message += await generateSummary(refinedQuery, results);
    }

    return message;
  } catch (error) {
    console.error('❌ Format results error:', error.message);
    return 'An error occurred while formatting results.';
  }
};

/**
 * Generate a summary of search results using Groq
 * @param {string} query - Original query
 * @param {Array} results - Search results
 * @returns {Promise<string>} Summary message
 */
const generateSummary = async (query, results) => {
  try {
    const resultsText = results
      .map((r, i) => `Result ${i + 1}: ${r.title}\n${r.content}`)
      .join('\n\n');

    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: GROQ_CONFIG.model,
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant that creates concise summaries of search results. Keep summaries brief and relevant. Use bullet points.'
          },
          {
            role: 'user',
            content: `Summarize the key information from these search results about "${query}":\n\n${resultsText}`
          }
        ],
        temperature: 0.3,
        max_tokens: 300
      },
      {
        headers: {
          'Authorization': `Bearer ${GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const summary = response.data.choices[0].message.content.trim();
    return `*📌 Summary:*\n${summary}`;
  } catch (error) {
    console.error('❌ Summary generation error:', error.message);
    return '';
  }
};

module.exports = {
  refineQuery,
  formatSearchResults,
  generateSummary
};
