// Search Controller
const { searchWithLocation } = require('../services/tavilyService');
const { getLocation } = require('../services/locationService');
const { refineQuery, formatSearchResults } = require('../services/groqService');

/**
 * Handle search API requests with AI-powered query refinement
 */
const handleSearch = async (req, res) => {
  const query = req.query.q || 'default search';

  // Get location (hardcoded to India)
  const location = getLocation();

  console.log(`\n🔍 Search API called`);
  console.log(`   Query: "${query}"`);
  console.log(`   Location: ${location.countryName}`);

  try {
    // Step 1: Refine query using Groq LLM
    const refinedQuery = await refineQuery(query);
    
    // Step 2: Search with Tavily using refined query
    const results = await searchWithLocation(refinedQuery, location);

    // Step 3: Format results nicely with both queries
    const formattedResponse = await formatSearchResults(query, refinedQuery, results);

    res.json({
      originalQuery: query,
      refinedQuery: refinedQuery,
      location,
      results: results,
      formattedResponse: formattedResponse
    });
  } catch (error) {
    console.error('Search error:', error.message);
    res.status(500).json({
      query,
      error: error.message
    });
  }
};

module.exports = {
  handleSearch
};
