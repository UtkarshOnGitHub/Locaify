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

const buildOptions = (options = []) => {
  return options.map((opt, i) => `${i + 1}️⃣ ${opt}`).join('\n');
};

const formatMessage = ({ title, body, options = [] }) => {
  return (
    `${title ? `🔥 *${title}*\n\n` : ''}` +
    `${body}\n\n` +
    `${options.length ? '👉 Choose an option:\n' + buildOptions(options) : ''}` +
    buildFooter()
  );
};

// ================= STATE =================
const receivedMessages = [];
const userSearchCache = new Map();
const trackSessions = new Map();

const TRACK_COMMAND_REGEX = /^track(?:\s+this)?(?:\s+([1-3]))?$/i;

// ================= HELPERS =================
const parseDurationChoice = (text) => {
  const normalized = (text || '').trim().toLowerCase();

  if (['1', '3 days'].includes(normalized)) return { trackingMode: 'duration', days: 3 };
  if (['2', '7 days'].includes(normalized)) return { trackingMode: 'duration', days: 7 };
  if (['3', 'until drop'].includes(normalized)) return { trackingMode: 'until_drop', days: null };

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
  return formatMessage({
    title: 'Tracking Setup',
    body: `📦 ${result.title}\n\nHow long should I track this?`,
    options: ['3 days', '7 days', 'Until price drops']
  });
};

// ================= WEBHOOK =================
const handleWebhook = async (req, res) => {
  try {
    const body = req.body;

    if (body.object === 'whatsapp_business_account') {
      const entries = body.entry || [];

      for (const entry of entries) {
        for (const change of entry.changes || []) {
          const messages = change.value?.messages || [];

          for (const message of messages) {
            const fromPhone = message.from;

            let messageText = '';
            if (message.type === 'text') {
              messageText = (message.text?.body || '').trim();
            } else if (message.type === 'interactive') {
              messageText = message.interactive?.button_reply?.title || '';
            }

            // normalize simple choices
            if (['1', '2', '3'].includes(messageText)) {
              messageText = `track ${messageText}`;
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
                    body: 'Search first before tracking.',
                    options: ['New search']
                  })
                );
                return;
              }

              trackSessions.set(fromPhone, {
                state: 'awaiting_duration',
                productName: chosen.title,
                url: chosen.url,
                basePrice: extractPriceFromResult(chosen)
              });

              await sendReply(fromPhone, buildDurationPrompt(chosen));
              return;
            }

            // ================= DURATION =================
            if (activeSession?.state === 'awaiting_duration') {
              const parsed = parseDurationChoice(messageText);

              if (!parsed) {
                await sendReply(fromPhone,
                  formatMessage({
                    title: 'Invalid Choice',
                    body: 'Please select a valid duration.',
                    options: ['3 days', '7 days', 'Until price drops']
                  })
                );
                return;
              }

              trackSessions.set(fromPhone, {
                ...activeSession,
                state: 'awaiting_target',
                ...parsed
              });

              await sendReply(fromPhone,
                formatMessage({
                  title: 'Set Target Price',
                  body: 'Enter your desired price (₹) or skip.',
                  options: ['Skip']
                })
              );
              return;
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
                    body: 'Enter valid price or skip.',
                    options: ['Skip']
                  })
                );
                return;
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
                  body: `📦 ${activeSession.productName}\n\nYou will be notified on price drop.`,
                  options: ['View tracked items', 'New search']
                })
              );
              return;
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
                .join('\n\n'),
              options: [
                'Track 1',
                'Track 2',
                'Track 3',
                'Show more',
                'New search'
              ]
            });

            await sendReply(fromPhone, messageOut);
          }
        }
      }
    }
  } catch (err) {
    console.error(err);
  }

  res.status(200).end();
};

module.exports = { handleWebhook };
