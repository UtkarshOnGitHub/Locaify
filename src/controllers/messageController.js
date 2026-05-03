// Message Controller
const Message = require('../models/Message');
const { sendReply } = require('../services/whatsappService');
const { getLocation } = require('../services/locationService');
const { searchWithLocation } = require('../services/tavilyService');
const { refineQuery, formatSearchResults } = require('../services/groqService');

// Store all received messages in memory
const receivedMessages = [];

/**
 * Handle webhook verification (GET request)
 */
const verifyWebhook = (req, res, verifyToken) => {
  const { 'hub.mode': mode, 'hub.challenge': challenge, 'hub.verify_token': token } = req.query;

  if (mode === 'subscribe' && token === verifyToken) {
    console.log('WEBHOOK VERIFIED');
    res.status(200).send(challenge);
  } else {
    res.status(403).end();
  }
};

/**
 * Handle incoming webhook messages (POST request)
 */
const handleWebhook = async (req, res) => {
  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
  console.log(`\n\nWebhook received ${timestamp}\n`);

  // Get location (hardcoded to India)
  const location = getLocation();
  console.log(`📍 Location: ${location.countryName}`);
  console.log(`📌 Coordinates: ${location.coordinates}`);

  console.log(JSON.stringify(req.body, null, 2));

  // EXTRACT MESSAGE DATA FROM WEBHOOK
  try {
    const body = req.body;

    if (body.object === 'whatsapp_business_account') {
      const entries = body.entry || [];

      entries.forEach(entry => {
        const changes = entry.changes || [];

        changes.forEach(change => {
          const value = change.value || {};
          const messages = value.messages || [];

          // Extract each message
          messages.forEach(async (message) => {
            const fromPhone = message.from;
            const messageText = message.text?.body || 'Non-text message';

            // Create message object
            const messageData = new Message({
              from: fromPhone,
              messageId: message.id,
              messageBody: messageText,
              messageType: message.type
            });

            // Store in array
            receivedMessages.push(messageData);

            // Log extracted data
            console.log('\n✅ EXTRACTED MESSAGE:');
            console.log(`   From: ${fromPhone}`);
            console.log(`   Message: ${messageText}`);
            console.log(`   Type: ${message.type}`);

            // 🤖 AI-POWERED SEARCH: REFINE QUERY AND SEARCH
            console.log('\n🔄 Processing message with AI...');
            
            // Step 1: Refine the query using Groq LLM
            const refinedQuery = await refineQuery(messageText);
            
            // Step 2: Search with Tavily using refined query
            const searchResults = await searchWithLocation(refinedQuery, location);
            
            // Step 3: Format results nicely with original and refined queries
            const formattedResponse = await formatSearchResults(messageText, refinedQuery, searchResults);
            
            // Step 4: Send formatted response back to user
            await sendReply(fromPhone, formattedResponse);
          });
        });
      });
    }
  } catch (error) {
    console.error('Error processing:', error.message);
  }

  res.status(200).end();
};

/**
 * Get all received messages
 */
const getAllMessages = (req, res) => {
  res.json({
    total: receivedMessages.length,
    messages: receivedMessages.map(msg => msg.toJSON())
  });
};

/**
 * Get latest message
 */
const getLatestMessage = (req, res) => {
  const latest = receivedMessages[receivedMessages.length - 1];
  res.json({
    latestMessage: latest ? latest.toJSON() : 'No messages yet'
  });
};

module.exports = {
  verifyWebhook,
  handleWebhook,
  getAllMessages,
  getLatestMessage,
  receivedMessages
};
