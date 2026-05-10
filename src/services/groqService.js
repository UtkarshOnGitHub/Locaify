const axios = require('axios');
const { GROQ_API_KEY, GROQ_CONFIG } = require('../config/constants');

const parseUserIntent = async (userMessage) => {
  try {
    if (!GROQ_API_KEY) {
      return {
        intent: 'unknown',
        gameTitle: userMessage,
        targetPrice: null,
        storePreference: null
      };
    }

    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: GROQ_CONFIG.model,
        messages: [
          {
            role: 'system',
            content: `
Extract game deal assistant intent as compact JSON.

Allowed intents:
- search_deals
- track_game
- track_store
- target_price
- unknown

Return only JSON with:
{
  "intent": "...",
  "gameTitle": "...",
  "targetPrice": number|null,
  "storePreference": string|null
}
`
          },
          {
            role: 'user',
            content: userMessage
          }
        ],
        temperature: 0.1,
        max_tokens: 160
      },
      {
        headers: {
          Authorization: `Bearer ${GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const content = response?.data?.choices?.[0]?.message?.content?.trim();
    if (!content) {
      return {
        intent: 'unknown',
        gameTitle: userMessage,
        targetPrice: null,
        storePreference: null
      };
    }

    return JSON.parse(content);
  } catch (error) {
    console.error('parseUserIntent error:', error.message);
    return {
      intent: 'unknown',
      gameTitle: userMessage,
      targetPrice: null,
      storePreference: null
    };
  }
};

module.exports = {
  parseUserIntent
};
