// Search Routes
const express = require('express');
const router = express.Router();
const searchController = require('../controllers/searchController');

/**
 * GET /search - Search with geolocation
 * Query params: ?q=search_query
 */
router.get('/search', searchController.handleSearch);

module.exports = router;
