// Tavily Search Service
const { tavily } = require('@tavily/core');
const { TAVILY_API_KEY, TAVILY_CONFIG } = require('../config/constants');

// Country code to country name mapping for Tavily
const COUNTRY_MAP = {
  'IN': 'india',
  'US': 'usa',
  'UK': 'uk',
  'CA': 'canada',
  'AU': 'australia',
  'DE': 'germany',
  'FR': 'france',
  'JP': 'japan',
  'CN': 'china',
  'BR': 'brazil'
};

/**
 * Search with Tavily API with location context
 * @param {string} query - Search query
 * @param {Object} location - Location object with country code
 * @returns {Promise<Object|null>} Search results or null if error
 */
const searchWithLocation = async (query, location) => {
  try {
    if (!TAVILY_API_KEY) {
      throw new Error('TAVILY_API_KEY is not configured');
    }

    const tvly = tavily({ apiKey: TAVILY_API_KEY });

    // Map country code to Tavily format
    const countryName = location?.country 
      ? COUNTRY_MAP[location.country] || location.country.toLowerCase() 
      : 'india';

    console.log(`🔍 Searching: "${query}"`);
    console.log(`📍 Location: ${location?.countryName || 'India'} (${location?.timezone || 'Asia/Kolkata'})`);
    if (location?.coordinates) {
      console.log(`📌 Coordinates: ${location.coordinates}`);
    }

    const response = await tvly.search(query, {
      searchDepth: TAVILY_CONFIG.searchDepth,
      country: countryName,
      max_results: TAVILY_CONFIG.max_results
    });

    console.log('✅ Search completed successfully');
    return response;
  } catch (error) {
    console.error('❌ Search error:', error.message);
    return null;
  }
};

module.exports = {
  searchWithLocation
};
