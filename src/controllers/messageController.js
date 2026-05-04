// Message Controller (Refactored with structured templates)
const Message = require('../models/Message');
const { sendReply } = require('../services/whatsappService');
const { getLocation } = require('../services/locationService');
const { searchWithLocation } = require('../services/tavilyService');
const { refineQuery, formatSearchResults } = require('../services/groqService');
const TrackedProduct = require('../models/TrackedProduct');

// ================= TEMPLATE HELPERS =================
const buildFooter = () => {
  return '\n──────────────\n⚙️ Reply STOP to cancel tracking';
};

const buildButtons = (options = []) => {
  return options.slice(0, 3).map((option, index) => ({
    id: `opt_${index + 1}`,
    title: option.substring(0, 20)
  }));
};

const formatMessage = ({ title, body }) => {
  return (
    `${title ? `🔥 *${title}*\n\n` : ''}` +
    `${body}` +
    buildFooter()
  );
};

// ================= STATE =================
const receivedMessages = [];
const userSearchCache = new Map();
const trackSessions = new Map();
const processedMessageIds = new Set();
const MAX_PROCESSED_MESSAGE_IDS = 1000;

const TRACK_COMMAND_REGEX = /^track(?:\s+this)?(?:\s+([1-3]))?$/i;

// ================= HELPERS =================
const normalizeText = (text) => {
  if (!text) return '';
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\u0000-\u007F]+/g, ' ') // strip emoji/non-ascii
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const parseDurationChoice = (text) => {
  const normalized = normalizeText(text);

  if (/\b(1|one|3|three)\b/.test(normalized) || normalized.includes('3 days') || normalized.includes('three days')) {
    return { trackingMode: 'duration', days: 3 };
  }
  if (/\b(2|two|7|seven)\b/.test(normalized) || normalized.includes('7 days') || normalized.includes('seven days')) {
    return { trackingMode: 'duration', days: 7 };
  }
  if (normalized.includes('until drop') || normalized.includes('until price drops') || normalized.includes('until dropped')) {
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

const rememberProcessedMessage = (messageId) => {
  if (!messageId) return;

  processedMessageIds.add(messageId);
  if (processedMessageIds.size <= MAX_PROCESSED_MESSAGE_IDS) return;

  const oldestMessageId = processedMessageIds.values().next().value;
  processedMessageIds.delete(oldestMessageId);
};

const extractPriceFromResult = (result) => {
  const blob = `${result?.title || ''} ${result?.content || ''}`;
  const match = blob.match(/(?:₹|rs\.?|inr)\s?([\d,]{3,})/i);
  if (!match) return null;
  return parseCurrencyNumber(match[1]);
};

const buildDurationPrompt = (result) => {
  return formatMessage({
    title: 'Tracking Setup',
    body: `📦 ${result.title}\n\nHow long should I track this?`
  });
};

const buildProductInsightMessage = (product) => {
  return formatMessage({
    title: 'Price Insight',
    body: `🎧 ${product.title || product.url}\n💰 ${product.price || '₹ N/A'}\n\nI can track it for you and notify you instantly when it hits a better price.`
  });
};

const buildProductActionButtons = () => ([
  { id: 'start_tracking', title: 'Start Tracking' },
  { id: 'set_target_price', title: 'Set Target Price' },
  { id: 'cancel', title: 'Cancel' }
]);

const buildTargetPrompt = () => {
  return formatMessage({
    title: 'Target Price',
    body: 'Send your desired price in INR or reply Skip.'
  });
};

const buildCancelledMessage = () => {
  return formatMessage({
    title: 'Tracking Cancelled',
    body: 'No problem. You can search again anytime.'
  });
};

// ================= WEBHOOK =================
const handleWebhook = async (req, res) => {
  if (req.body?.object !== 'whatsapp_business_account') {
    return res.status(200).end();
  }

  // Meta retries webhooks when the endpoint does not acknowledge quickly.
  // Acknowledge first, then process so retries do not create duplicate replies.
  res.status(200).end();

  try {
    const body = req.body;

    const entries = body.entry || [];

    for (const entry of entries) {
      for (const change of entry.changes || []) {
        const messages = change.value?.messages || [];

        for (const message of messages) {
          if (message.id && processedMessageIds.has(message.id)) {
            console.log(`Skipping duplicate webhook message: ${message.id}`);
            continue;
          }
          rememberProcessedMessage(message.id);

          const fromPhone = message.from;

          let messageText = '';
          if (message.type === 'text') {
            messageText = (message.text?.body || '').trim();
          } else if (message.type === 'interactive') {
            messageText = message.interactive?.button_reply?.title || '';
          }

          if (!fromPhone || !messageText) {
            continue;
          }

          receivedMessages.push(new Message({
            messageId: message.id,
            messageBody: messageText,
            messageType: message.type,
            from: fromPhone,
            timestamp: new Date()
          }));

            const normalizedText = normalizeText(messageText);

            if (['1', '2', '3', 'one', 'two', 'three'].includes(normalizedText)) {
              messageText = `track ${normalizedText.replace(/[^0-9]/g, '')}`;
            }

            if (['stop', 'cancel', 'unsubscribe'].includes(normalizedText)) {
              trackSessions.delete(fromPhone);
              await sendReply(fromPhone,
                buildCancelledMessage(),
                buildButtons(['New search'])
              );
              continue;
            }

            const activeSession = trackSessions.get(fromPhone);
            const cachedResults = userSearchCache.get(fromPhone) || [];

            // ================= TRACK COMMAND =================
            const trackMatch = messageText.match(TRACK_COMMAND_REGEX);

            if (trackMatch) {
              const index = trackMatch[1] ? Number(trackMatch[1]) - 1 : 0;
              const chosen = cachedResults[index];

              if (!chosen) {
                await sendReply(fromPhone,
                formatMessage({
                  title: 'No Results',
                  body: 'Search first before tracking.'
                }),
                buildButtons(['New search'])
              );
                continue;
              }

              trackSessions.set(fromPhone, {
                state: 'action_selection',
                product: chosen,
                productName: chosen.title,
                url: chosen.url,
                basePrice: extractPriceFromResult(chosen)
              });

              await sendReply(fromPhone, buildProductInsightMessage(chosen), buildProductActionButtons());
              continue;
            }

            // ================= ACTION SELECTION =================
            if (activeSession?.state === 'action_selection') {
              const normalized = messageText.toLowerCase();

              if (normalized.includes('start tracking')) {
                trackSessions.set(fromPhone, {
                  ...activeSession,
                  state: 'awaiting_duration'
                });

                await sendReply(fromPhone, buildDurationPrompt(activeSession.product), buildButtons(['3 days', '7 days', 'Until price drops']));
                continue;
              }

              if (normalized.includes('set target')) {
                trackSessions.set(fromPhone, {
                  ...activeSession,
                  state: 'awaiting_target'
                });

                await sendReply(fromPhone, buildTargetPrompt(), buildButtons(['Skip']));
                continue;
              }

              if (normalized === 'cancel') {
                trackSessions.delete(fromPhone);
                await sendReply(fromPhone, buildCancelledMessage());
                continue;
              }

              await sendReply(fromPhone,
                formatMessage({
                  title: 'Choose an action',
                  body: 'Use one of the buttons or reply with a valid option.'
                }),
                buildButtons(['Start Tracking', 'Set Target Price', 'Cancel'])
              );
              continue;
            }

            // ================= DURATION =================
            if (activeSession?.state === 'awaiting_duration') {
              const parsed = parseDurationChoice(messageText);

              if (!parsed) {
                await sendReply(fromPhone,
                  formatMessage({
                    title: 'Invalid Choice',
                    body: 'Please select a valid duration.'
                  }),
                  buildButtons(['3 days', '7 days', 'Until price drops'])
                );
                continue;
              }

              trackSessions.set(fromPhone, {
                ...activeSession,
                state: 'awaiting_target',
                ...parsed
              });

              await sendReply(fromPhone,
                formatMessage({
                  title: 'Set Target Price',
                  body: 'Enter your desired price (₹) or skip.'
                }),
                buildButtons(['Skip'])
              );
              continue;
            }

            // ================= TARGET =================
            if (activeSession?.state === 'awaiting_target') {
              const targetPrice = /^skip$/i.test(messageText)
                ? null
                : parseCurrencyNumber(messageText);

              if (messageText.toLowerCase() !== 'skip' && !targetPrice) {
                await sendReply(fromPhone,
                  formatMessage({
                    title: 'Invalid Price',
                    body: 'Enter valid price or skip.'
                  }),
                  buildButtons(['Skip'])
                );
                continue;
              }

              await TrackedProduct.findOneAndUpdate(
                { userPhone: fromPhone, url: activeSession.url },
                {
                  userPhone: fromPhone,
                  productName: activeSession.productName,
                  url: activeSession.url,
                  lastCheckedPrice: targetPrice || 0,
                  targetPrice,
                  isActive: true
                },
                { upsert: true }
              );

              trackSessions.delete(fromPhone);

              await sendReply(fromPhone,
                formatMessage({
                  title: 'Tracking Started',
                  body: `📦 ${activeSession.productName}\n\nYou will be notified on price drop.`
                }),
                buildButtons(['View tracked items', 'New search'])
              );
              continue;
            }

            // ================= SEARCH =================
            const location = getLocation();
            const refinedQuery = await refineQuery(messageText);
            const searchResults = await searchWithLocation(refinedQuery, location);

            if (searchResults?.results?.length) {
              userSearchCache.set(fromPhone, searchResults.results);
            }

            const topOptions = (searchResults?.results || []).slice(0, 3);

            const messageOut = formatMessage({
              title: 'Top Deals Found',
              body: topOptions
                .map((item, i) => `${i + 1}. ${item.title}\n💰 ${item.price || 'N/A'}`)
                .join('\n\n')
            });

            const trackButtons = topOptions.map((item, i) => ({
              id: `track_${i + 1}`,
              title: `Track ${i + 1}`
            }));

            await sendReply(fromPhone, messageOut, trackButtons);
        }
      }
    }
  } catch (err) {
    console.error(err);
  }
};

const verifyWebhook = (req, res, verifyToken) => {
  const { 'hub.mode': mode, 'hub.challenge': challenge, 'hub.verify_token': token } = req.query;
  if (mode === 'subscribe' && token === verifyToken) {
    console.log('WEBHOOK VERIFIED');
    return res.status(200).send(challenge);
  }
  return res.status(403).end();
};

const getAllMessages = (req, res) => {
  res.json({
    total: receivedMessages.length,
    messages: receivedMessages
  });
};

const getLatestMessage = (req, res) => {
  const latest = receivedMessages[receivedMessages.length - 1] || null;
  res.json({ latestMessage: latest });
};

module.exports = {
  handleWebhook,
  verifyWebhook,
  getAllMessages,
  getLatestMessage
};
