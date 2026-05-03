// Search Routes
const express = require('express');
const router = express.Router();
const searchController = require('../controllers/searchController');
const { runTrackingCheck } = require('../services/priceTrackerService');

/**
 * GET /search - Search with geolocation
 * Query params: ?q=search_query
 */
router.get('/search', searchController.handleSearch);

/**
 * GET /tracking/run - Trigger tracking run manually (dev/admin)
 */
router.get('/tracking/run', async (req, res) => {
  try {
    await runTrackingCheck();
    res.json({ ok: true, message: 'Tracking check completed.' });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

module.exports = router;
