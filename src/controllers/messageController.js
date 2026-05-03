// Message Controller
const Message = require('../models/Message');
const { sendReply } = require('../services/whatsappService');
const { getLocation } = require('../services/locationService');
const { searchWithLocation } = require('../services/tavilyService');
const { refineQuery, formatSearchResults } = require('../services/groqService');
const TrackedProduct = require('../models/TrackedProduct');

// Store all received messages in memory
const receivedMessages = [];
const userSearchCache = new Map();
const trackSessions = new Map();

const TRACK_COMMAND_REGEX = /^track(?:\s+this)?(?:\s+([1-3]))?$/i;

const parseDurationChoice = (text) => {
  const normalized = (text || '').trim().toLowerCase();

  if (['1', '3 days', 'three days'].includes(normalized)) {
    return { trackingMode: 'duration', days: 3 };
  }
  if (['2', '7 days', 'seven days'].includes(normalized)) {
    return { trackingMode: 'duration', days: 7 };
  }
  if (['3', 'until drop', 'until price drops', 'until dropped'].includes(normalized)) {
    return { trackingMode: 'until_drop', days: null };
  }

  return null;
};

const parseCurrencyNumber = (text) => {
  if (!text) return null;
  const cleaned = text.replace(/[^\d.]/g, '');
  const value = Number(cleaned);
  return Number.isFinite(value) && value > 0 ? Math.round(value) : null;
};

const extractPriceFromResult = (result) => {
  const blob = `${result?.title || ''} ${result?.content || ''}`;
  const match = blob.match(/(?:₹|rs\.?|inr)\s?([\d,]{3,})/i);
  if (!match) return null;
  return parseCurrencyNumber(match[1]);
};

const buildDurationPrompt = (result) => {
  const lines = [];
  lines.push(`Tracking request: ${result.title || result.url}`);
  lines.push('');
  lines.push('Track for how long?');
  lines.push('1) 3 days');
  lines.push('2) 7 days');
  lines.push('3) Until price drops');
  lines.push('');
  lines.push('Reply with 1, 2, or 3.');
  return lines.join('\n');
};

const buildSearchFooter = () => (
  'Do you want to track prices for a product from these results?\n\n' +
  'Reply with:\n' +
  '- track 1\n' +
  '- track 2\n' +
  '- track 3'
);

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
            const messageText = (message.text?.body || 'Non-text message').trim();

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

            const activeSession = trackSessions.get(fromPhone);
            const trackMatch = messageText.match(TRACK_COMMAND_REGEX);
            const cachedResults = userSearchCache.get(fromPhone) || [];

            if (activeSession?.state === 'awaiting_duration') {
              const parsed = parseDurationChoice(messageText);
              if (!parsed) {
                await sendReply(fromPhone, 'Please reply with 1, 2, or 3 for tracking duration.');
                return;
              }

              const expiresAt = parsed.days
                ? new Date(Date.now() + parsed.days * 24 * 60 * 60 * 1000)
                : null;

              trackSessions.set(fromPhone, {
                ...activeSession,
                state: 'awaiting_target',
                trackingMode: parsed.trackingMode,
                expiresAt
              });

              await sendReply(
                fromPhone,
                'Set an optional target price in INR (example: 55000), or reply "skip".'
              );
              return;
            }

            if (activeSession?.state === 'awaiting_target') {
              const wantsSkip = /^skip$/i.test(messageText);
              const targetPrice = wantsSkip ? null : parseCurrencyNumber(messageText);

              if (!wantsSkip && !targetPrice) {
                await sendReply(fromPhone, 'Please send a valid price (example: 54999) or reply "skip".');
                return;
              }

              const baselinePrice = activeSession.basePrice || targetPrice || 0;
              await TrackedProduct.findOneAndUpdate(
                { userPhone: fromPhone, url: activeSession.url },
                {
                  userPhone: fromPhone,
                  productName: activeSession.productName,
                  url: activeSession.url,
                  source: 'tavily',
                  baselinePrice,
                  lastCheckedPrice: baselinePrice,
                  targetPrice,
                  trackingMode: activeSession.trackingMode,
                  expiresAt: activeSession.expiresAt,
                  isActive: true
                },
                { new: true, upsert: true, setDefaultsOnInsert: true }
              );

              trackSessions.delete(fromPhone);
              await sendReply(
                fromPhone,
                `Tracking started for "${activeSession.productName}". ` +
                `Mode: ${activeSession.trackingMode === 'until_drop' ? 'Until drop' : 'Duration'}. ` +
                `${targetPrice ? `Target: INR ${targetPrice}.` : 'No target set.'}`
              );
              return;
            }

            if (trackMatch) {
              const requestedIndex = trackMatch[1] ? Number(trackMatch[1]) - 1 : 0;
              const chosen = cachedResults[requestedIndex];

              if (!chosen) {
                await sendReply(fromPhone, 'No recent results found to track. Search first, then reply "track 1".');
                return;
              }

              trackSessions.set(fromPhone, {
                state: 'awaiting_duration',
                productName: chosen.title || 'Tracked Product',
                url: chosen.url,
                basePrice: extractPriceFromResult(chosen)
              });

              await sendReply(fromPhone, buildDurationPrompt(chosen));
              return;
            }

            // 🤖 AI-POWERED SEARCH: REFINE QUERY AND SEARCH
            console.log('\n🔄 Processing message with AI...');

            const refinedQuery = await refineQuery(messageText);
            const searchResults = await searchWithLocation(refinedQuery, location);
            const formattedResponse = await formatSearchResults(messageText, refinedQuery, searchResults);

            if (searchResults?.results?.length) {
              userSearchCache.set(fromPhone, searchResults.results.slice(0, 3));
            }

            await sendReply(fromPhone, `${formattedResponse}\n\n${buildSearchFooter()}`);
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
