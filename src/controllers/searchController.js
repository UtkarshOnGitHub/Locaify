const {
  searchGamesByTitle,
  getGameDetailsWithDeals,
  getDealDetails,
  getStores,
  compareDeals
} = require('../services/gameDealsApiService');

const handleGames = async (req, res) => {
  try {
    const { title, id } = req.query;

    if (id) {
      const game = await getGameDetailsWithDeals(id);
      const comparison = compareDeals(game.deals);
      return res.json({
        game,
        recommendation: comparison.bestDeal,
        deals: comparison.deals
      });
    }

    if (!title) {
      return res.status(400).json({
        error: 'Missing query. Use ?title=game-title or ?id=gameID.'
      });
    }

    const games = await searchGamesByTitle(title);
    return res.json({ query: title, games });
  } catch (error) {
    console.error('Game deal API error:', error.message);
    return res.status(500).json({
      error: error.message
    });
  }
};

const handleDeal = async (req, res) => {
  try {
    const { id } = req.query;

    if (!id) {
      return res.status(400).json({ error: 'Missing query. Use ?id=dealID.' });
    }

    const deal = await getDealDetails(id);
    return res.json({ deal });
  } catch (error) {
    console.error('Deal API error:', error.message);
    return res.status(500).json({
      error: error.message
    });
  }
};

const handleStores = async (req, res) => {
  try {
    const forceRefresh = String(req.query.refresh || 'false').toLowerCase() === 'true';
    const stores = await getStores({ forceRefresh });
    return res.json({ stores });
  } catch (error) {
    console.error('Stores API error:', error.message);
    return res.status(500).json({
      error: error.message
    });
  }
};

const handleSearch = async (req, res) => {
  req.query.title = req.query.title || req.query.q;
  return handleGames(req, res);
};

module.exports = {
  handleSearch,
  handleGames,
  handleDeal,
  handleStores
};
