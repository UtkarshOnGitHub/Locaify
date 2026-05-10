// Search Routes
const express = require('express');
const router = express.Router();
const searchController = require('../controllers/searchController');
const { runDealMonitoringCheck } = require('../services/dealMonitorService');

/**
 * GET /search - Backward-compatible game search
 * Query params: ?q=game_title
 */
router.get('/search', searchController.handleSearch);

/**
 * GET /games - Search games or fetch details with all deals
 * Query params: ?title=game_title or ?id=gameID
 */
router.get('/games', searchController.handleGames);

/**
 * GET /stores - Fetch tracked store metadata
 * Query params: ?refresh=true to bypass cache
 */
router.get('/stores', searchController.handleStores);

/**
 * GET /deals - Fetch one deal by CheapShark dealID
 * Query params: ?id=dealID
 */
router.get('/deals', searchController.handleDeal);

/**
 * GET /deals/run - Trigger one deal-monitoring run manually (dev/admin)
 */
router.get('/deals/run', async (req, res) => {
  try {
    await runDealMonitoringCheck();
    res.json({ ok: true, message: 'Deal monitoring check completed.' });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

module.exports = router;
