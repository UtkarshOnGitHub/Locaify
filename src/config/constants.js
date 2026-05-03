// Configuration and Constants
module.exports = {
  PORT: process.env.PORT || 3000,
  VERIFY_TOKEN: process.env.VERIFY_TOKEN,
  GENERAL_TOKEN: (process.env.GENERAL_TOKEN || '').trim(),
  TAVILY_API_KEY: process.env.TAVILY_API_KEY,
  GROQ_API_KEY: process.env.GROQ_API_KEY,
  
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
  }
};
