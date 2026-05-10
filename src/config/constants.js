// Configuration and Constants
module.exports = {
  PORT: process.env.PORT || 3000,
  VERIFY_TOKEN: process.env.VERIFY_TOKEN,
  GENERAL_TOKEN: (process.env.GENERAL_TOKEN || '').trim(),
  CHEAPSHARK_API_BASE_URL: process.env.CHEAPSHARK_API_BASE_URL,
  GROQ_API_KEY: process.env.GROQ_API_KEY,
  MONGODB_URI: process.env.MONGODB_URI,
  
  // Phone configuration
  PHONE_NUMBER_ID: process.env.PHONE_NUMBER_ID || '1053035681233537',
  GRAPH_API_VERSION: process.env.GRAPH_API_VERSION || 'v25.0',
  
  // Groq configuration reserved for future conversational intent parsing
  GROQ_CONFIG: {
    model: 'mixtral-8x7b-32768',
    temperature: 0.3,
    max_tokens: 500
  },

  // Deal monitoring configuration
  TRACKING_CONFIG: {
    cronExpression: process.env.TRACKING_CRON || '0 */6 * * *',
    maxTracksPerRun: Number(process.env.TRACKING_MAX_TRACKS_PER_RUN || 25),
    requestTimeoutMs: Number(process.env.TRACKING_REQUEST_TIMEOUT_MS || 12000),
    requestDelayMs: Number(process.env.TRACKING_REQUEST_DELAY_MS || 1000),
    defaultCurrency: process.env.TRACKING_CURRENCY || 'USD',
    defaultRegion: process.env.TRACKING_REGION || 'GLOBAL',
    bypassPriceCheck: String(process.env.TRACKING_BYPASS_PRICE_CHECK || 'false').toLowerCase() === 'true'
  }
};
