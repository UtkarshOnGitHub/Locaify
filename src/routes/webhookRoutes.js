// Webhook Routes
const express = require('express');
const router = express.Router();
const messageController = require('../controllers/messageController');
const { VERIFY_TOKEN } = require('../config/constants');

/**
 * GET / - Webhook verification
 * Required for Facebook/WhatsApp webhook setup
 */
router.get('/', (req, res) => {
  messageController.verifyWebhook(req, res, VERIFY_TOKEN);
});

/**
 * POST / - Receive webhook messages
 * Handles incoming WhatsApp messages
 */
router.post('/', messageController.handleWebhook);

/**
 * GET /messages - Get all received messages
 */
router.get('/messages', messageController.getAllMessages);

/**
 * GET /latest - Get latest received message
 */
router.get('/latest', messageController.getLatestMessage);

module.exports = router;
