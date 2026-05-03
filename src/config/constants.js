// Configuration and Constants
module.exports = {
  PORT: process.env.PORT || 3000,
  VERIFY_TOKEN: process.env.VERIFY_TOKEN,
  GENERAL_TOKEN: (process.env.GENERAL_TOKEN || '').trim(),
  TAVILY_API_KEY: process.env.TAVILY_API_KEY,
  GROQ_API_KEY: process.env.GROQ_API_KEY,
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/locaify',
  
  // Phone configuration
  PHONE_NUMBER_ID: '1053035681233537',
  GRAPH_API_VERSION: 'v25.0',
  
  // Default Location
  DEFAULT_LOCATION: {
    country: 'IN',
    countryName: 'India',
    region: 'Asia/Kolkata',
    timezone: 'Asia/Kolkata',
    coordinates: '28.7041, 77.1025', // New Delhi
    city: 'India'
  },
  
  // Tavily Configuration
  TAVILY_CONFIG: {
    searchDepth: 'advanced',
    max_results: 5
  },
  
  // Groq Configuration
  GROQ_CONFIG: {
    model: 'mixtral-8x7b-32768',
    temperature: 0.3,
    max_tokens: 500
  },

  // Price tracking configuration
  TRACKING_CONFIG: {
    cronExpression: process.env.TRACKING_CRON || '0 */6 * * *',
    maxTracksPerRun: Number(process.env.TRACKING_MAX_TRACKS_PER_RUN || 25),
    requestTimeoutMs: Number(process.env.TRACKING_REQUEST_TIMEOUT_MS || 12000),
    requestDelayMs: Number(process.env.TRACKING_REQUEST_DELAY_MS || 1000),
    defaultCurrency: process.env.TRACKING_CURRENCY || 'INR',
    bypassPriceCheck: String(process.env.TRACKING_BYPASS_PRICE_CHECK || 'false').toLowerCase() === 'true'
  }
};
