const Message = require('../models/Message');
const TrackedGame = require('../models/TrackedGame');
const { sendReply, sendImageReply } = require('../services/whatsappService');
const {
  searchGamesByTitle,
  getGameDetailsWithDeals,
  compareDeals
} = require('../services/gameDealsApiService');
const { TRACKING_CONFIG: _TRACKING_CONFIG } = require('../config/constants'); // reserved for future use

// ---------------------------------------------------------------------------
// Currency
// ---------------------------------------------------------------------------

const USD_TO_INR = 84; // Fixed conversion rate — replace with live rate if needed

const toINR = (usdPrice) => {
  if (!Number.isFinite(usdPrice)) return null;
  return Math.round(usdPrice * USD_TO_INR);
};

const formatINR = (usdPrice) => {
  const inr = toINR(usdPrice);
  if (inr === null) return 'N/A';
  return `₹${inr.toLocaleString('en-IN')}`;
};

// ---------------------------------------------------------------------------
// Button helpers
// ---------------------------------------------------------------------------

const buildButtons = (options = []) => {
  return options.slice(0, 3).map((option, index) => {
    if (typeof option === 'string') {
      return { id: `opt_${index + 1}`, title: option.substring(0, 20) };
    }
    return {
      id: option.id || `opt_${index + 1}`,
      title: String(option.title || option.label || `Option ${index + 1}`).substring(0, 20)
    };
  });
};

// ---------------------------------------------------------------------------
// In-memory state
// ---------------------------------------------------------------------------

const receivedMessages = [];
const userGameCache = new Map();   // phone -> single game object
const userDealCache = new Map();   // phone -> { gameID, gameTitle, deals, cheapestPriceEver }
const trackSessions = new Map();   // phone -> session object
const processedMessageIds = new Set();
const MAX_PROCESSED_MESSAGE_IDS = 1000;

// ---------------------------------------------------------------------------
// Regex patterns
// ---------------------------------------------------------------------------

const GO_AHEAD_REGEX = /^go\s*ahead$/i;
const REFINE_SEARCH_REGEX = /^refine\s*search$/i;
const TRACK_COMMAND_REGEX = /^track(?:\s+this)?(?:\s+(?:deal\s+)?([1-9]))?$/i;
const TRACK_ALL_REGEX = /^track\s+(all(\s+stores)?|across\s+all(\s+stores)?)$/i;
const TRACK_STORE_ID_REGEX = /^track_store_(\d+)$/;  // matches button IDs like track_store_0

// ---------------------------------------------------------------------------
// Text utilities
// ---------------------------------------------------------------------------

const normalizeText = (text) => {
  if (!text) return '';
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\u0000-\u007F]+/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const parseDurationChoice = (text) => {
  const n = normalizeText(text);
  if (/\b(1|one)\b/.test(n) || n.includes('3 days') || n.includes('three days')) {
    return { trackingMode: 'duration', days: 3 };
  }
  if (/\b(2|two)\b/.test(n) || n.includes('7 days') || n.includes('seven days')) {
    return { trackingMode: 'duration', days: 7 };
  }
  if (
    /\b(3|three)\b/.test(n) ||
    n.includes('until better deal') ||
    n.includes('until price drops') ||
    n.includes('until drop')
  ) {
    return { trackingMode: 'until_better_deal', days: null };
  }
  return null;
};

const parseCurrencyNumber = (text) => {
  if (!text) return null;
  const cleaned = String(text).replace(/[^\d.]/g, '');
  const value = Number(cleaned);
  return Number.isFinite(value) && value > 0 ? Math.round(value * 100) / 100 : null;
};

const rememberProcessedMessage = (messageId) => {
  if (!messageId) return;
  processedMessageIds.add(messageId);
  if (processedMessageIds.size <= MAX_PROCESSED_MESSAGE_IDS) return;
  processedMessageIds.delete(processedMessageIds.values().next().value);
};

const getMessageText = (message) => {
  if (message.type === 'text') return (message.text?.body || '').trim();
  if (message.type === 'interactive') {
    return (
      message.interactive?.button_reply?.title ||
      message.interactive?.list_reply?.title ||
      ''
    ).trim();
  }
  return '';
};

const getButtonId = (message) => {
  if (message.type === 'interactive') {
    return message.interactive?.button_reply?.id || null;
  }
  return null;
};

// ---------------------------------------------------------------------------
// Message builders
// ---------------------------------------------------------------------------

/**
 * Game search result card — shown after a title search.
 * Sent as an image message with "Go Ahead" and "Refine Search" buttons.
 */
const buildGameResultCard = (game) => {
  const lines = [
    `*${game.title}*`,
    '',
    `💰 Best price: ${formatINR(game.cheapestPrice)}`,
    '',
    'Is this the game you were looking for?'
  ];
  return lines.join('\n');
};

/**
 * Deal results card — shown after game lookup.
 * Sent as an image message with tracking buttons.
 */
const buildDealResultsMessage = ({ title, cheapestPriceEver, deals, bestDeal }) => {
  const topDeals = deals.slice(0, 3);

  const dealLines = topDeals.map((deal, index) => {
    const savingsText = deal.savings > 0 ? ` (-${Math.round(deal.savings)}%)` : '';
    return (
      `${index + 1}. *${deal.storeName}*\n` +
      `   ${formatINR(deal.price)}${savingsText}\n` +
      `   ${deal.purchaseUrl}`
    );
  });

  const bestLine = bestDeal
    ? `🏆 Best deal: *${bestDeal.storeName}* at ${formatINR(bestDeal.price)}`
    : '🏆 Best deal: Not available';

  const historicalLine = Number.isFinite(cheapestPriceEver?.price)
    ? `📉 All-time low: ${formatINR(cheapestPriceEver.price)}`
    : null;

  const lines = [
    `*${title}*`,
    '',
    bestLine,
    ...(historicalLine ? [historicalLine] : []),
    '',
    ...dealLines
  ];

  return lines.join('\n');
};

const buildDurationPrompt = (session) => {
  const scopeText =
    session.trackingScope === 'all_stores'
      ? 'all available stores'
      : session.deals[0]?.storeName || 'this store';

  return (
    `⏱ *Tracking Setup*\n\n` +
    `*${session.gameTitle}*\n` +
    `Tracking: ${scopeText}\n\n` +
    `How long should I monitor this deal?`
  );
};

const buildTargetPrompt = () => {
  return (
    `🎯 *Set a Target Price*\n\n` +
    `Send your desired price in INR (e.g. 500) or tap Skip.`
  );
};

const buildCancelledMessage = () => {
  return `✅ Tracking cancelled. Send any game name to start a new search.`;
};

const buildNoDealsMessage = (gameTitle) => {
  return (
    `*${gameTitle}*\n\n` +
    `No active store deals found right now.\n` +
    `Try again later or search for another game.`
  );
};

// ---------------------------------------------------------------------------
// Session helpers
// ---------------------------------------------------------------------------

const getExpiryDate = ({ trackingMode, days }) => {
  if (trackingMode !== 'duration' || !days) return null;
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
};

const buildTrackingSession = ({ fromPhone, dealCache, trackingScope, deals }) => {
  const session = {
    state: 'awaiting_duration',
    gameID: dealCache.gameID,
    gameTitle: dealCache.gameTitle,
    thumbnailUrl: dealCache.thumbnailUrl || null,
    trackingScope,
    deals
  };
  trackSessions.set(fromPhone, session);
  return session;
};

const saveTrackingSession = async ({ fromPhone, session, targetPrice }) => {
  const trackingMode = session.trackingMode || 'duration';
  const expiresAt = getExpiryDate({ trackingMode, days: session.days });

  // Always track a single deal — the best (cheapest) one from the session.
  // For 'all_stores' scope the best deal is deals[0] (already sorted by price).
  // For 'store_specific' scope there is exactly one deal in the array.
  const deal = session.deals[0];
  if (!deal) return;

  const baselinePrice = deal.price || targetPrice || 0;

  await TrackedGame.findOneAndUpdate(
    { userPhone: fromPhone, gameID: session.gameID },
    {
      userPhone: fromPhone,
      gameID: session.gameID,
      dealID: deal.dealID,
      gameTitle: session.gameTitle,
      purchaseUrl: deal.purchaseUrl,
      storeID: deal.storeID,
      storeName: deal.storeName,
      baselinePrice,
      lastCheckedPrice: baselinePrice,
      targetPrice,
      trackingMode,
      trackingScope: session.trackingScope,
      expiresAt,
      isActive: true,
      lastNotifiedPrice: null,
      checkCount: 0
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
};

// ---------------------------------------------------------------------------
// Core action: show deals for a game
// ---------------------------------------------------------------------------

const showGameDeals = async (fromPhone, game) => {
  const gameDetails = await getGameDetailsWithDeals(game.gameID);
  const comparison = compareDeals(gameDetails.deals);
  const topDeals = comparison.deals.slice(0, 3);

  if (!topDeals.length) {
    await sendReply(fromPhone, buildNoDealsMessage(gameDetails.title || game.title));
    return;
  }

  const gameTitle = gameDetails.title || game.title;
  const thumbnailUrl = gameDetails.thumbnailUrl || game.thumbnailUrl || null;

  userDealCache.set(fromPhone, {
    gameID: game.gameID,
    gameTitle,
    thumbnailUrl,
    deals: comparison.deals,
    cheapestPriceEver: gameDetails.cheapestPriceEver
  });

  const bodyText = buildDealResultsMessage({
    title: gameTitle,
    cheapestPriceEver: gameDetails.cheapestPriceEver,
    deals: topDeals,
    bestDeal: comparison.bestDeal
  });

  // Button 1: Track across all stores
  // Button 2: Track only on the best deal store (index 0)
  // WhatsApp button titles max 20 chars — use ID for routing, title for display
  const bestStoreName = topDeals[0]?.storeName || 'Best Store';
  const storeLabel = `Only on ${bestStoreName}`.substring(0, 20);

  const trackingButtons = [
    { id: 'track_all', title: 'Track All Stores' },
    { id: 'track_store_0', title: storeLabel }
  ];

  await sendImageReply(fromPhone, thumbnailUrl, bodyText, trackingButtons);
};

// ---------------------------------------------------------------------------
// Webhook handler
// ---------------------------------------------------------------------------

const handleWebhook = async (req, res) => {
  if (req.body?.object !== 'whatsapp_business_account') {
    return res.status(200).end();
  }

  res.status(200).end();

  try {
    const entries = req.body.entry || [];

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
          const messageText = getMessageText(message);

          if (!fromPhone || !messageText) continue;

          receivedMessages.push(new Message({
            messageId: message.id,
            messageBody: messageText,
            messageType: message.type,
            from: fromPhone,
            receivedAt: new Date().toISOString()
          }));

          const normalizedText = normalizeText(messageText);
          const buttonId = getButtonId(message);
          const activeSession = trackSessions.get(fromPhone);
          const cachedGame = userGameCache.get(fromPhone);
          const dealCache = userDealCache.get(fromPhone);

          // ── Cancel ──────────────────────────────────────────────────────
          if (['stop', 'cancel', 'unsubscribe'].includes(normalizedText)) {
            trackSessions.delete(fromPhone);
            await sendReply(fromPhone, buildCancelledMessage());
            continue;
          }

          // ── Awaiting refined search input ────────────────────────────────
          if (activeSession?.state === 'awaiting_refine') {
            trackSessions.delete(fromPhone);
            userGameCache.delete(fromPhone);
            userDealCache.delete(fromPhone);
            // Fall through to game search below
          }

          // ── "Go Ahead" — proceed with cached game ────────────────────────
          if (GO_AHEAD_REGEX.test(messageText)) {
            if (!cachedGame) {
              await sendReply(fromPhone, 'Search for a game first, then tap Go Ahead.');
              continue;
            }
            await showGameDeals(fromPhone, cachedGame);
            continue;
          }

          // ── "Refine Search" — ask user to retype ─────────────────────────
          if (REFINE_SEARCH_REGEX.test(messageText)) {
            trackSessions.set(fromPhone, { state: 'awaiting_refine' });
            await sendReply(
              fromPhone,
              `🔍 No problem. Send the game name again and I'll search for a better match.`
            );
            continue;
          }

          // ── Track All Stores (button ID or text fallback) ────────────────
          const isTrackAll = buttonId === 'track_all' || TRACK_ALL_REGEX.test(messageText);
          if (isTrackAll) {
            if (!dealCache?.deals?.length) {
              await sendReply(fromPhone, 'Search for a game first, then I can track all stores.');
              continue;
            }
            const session = buildTrackingSession({
              fromPhone,
              dealCache,
              trackingScope: 'all_stores',
              deals: dealCache.deals
            });
            await sendReply(
              fromPhone,
              buildDurationPrompt(session),
              buildButtons(['3 days', '7 days', 'Until better deal'])
            );
            continue;
          }

          // ── Track only on a specific store (button ID or text fallback) ──
          const storeIdMatch = buttonId?.match(TRACK_STORE_ID_REGEX) || messageText.match(TRACK_COMMAND_REGEX);
          if (storeIdMatch) {
            if (!dealCache?.deals?.length) {
              await sendReply(fromPhone, 'Search for a game first, then choose a deal to track.');
              continue;
            }
            // Button ID "track_store_0" → index 0; text "track 2" → index 1
            const index = buttonId?.match(TRACK_STORE_ID_REGEX)
              ? Number(buttonId.match(TRACK_STORE_ID_REGEX)[1])
              : (storeIdMatch[1] ? Number(storeIdMatch[1]) - 1 : 0);

            const chosenDeal = dealCache.deals[index];
            if (!chosenDeal) {
              await sendReply(fromPhone, 'That store is not in the list. Choose one of the shown deals.');
              continue;
            }
            const session = buildTrackingSession({
              fromPhone,
              dealCache,
              trackingScope: 'store_specific',
              deals: [chosenDeal]
            });
            await sendReply(
              fromPhone,
              buildDurationPrompt(session),
              buildButtons(['3 days', '7 days', 'Until better deal'])
            );
            continue;
          }

          // ── Awaiting duration ────────────────────────────────────────────
          if (activeSession?.state === 'awaiting_duration') {
            const parsed = parseDurationChoice(messageText);
            if (!parsed) {
              await sendReply(
                fromPhone,
                'Please choose a tracking duration.',
                buildButtons(['3 days', '7 days', 'Until better deal'])
              );
              continue;
            }
            trackSessions.set(fromPhone, { ...activeSession, state: 'awaiting_target', ...parsed });
            await sendReply(fromPhone, buildTargetPrompt(), buildButtons(['Skip']));
            continue;
          }

          // ── Awaiting target price ────────────────────────────────────────
          if (activeSession?.state === 'awaiting_target') {
            const skipped = /^skip$/i.test(messageText);
            const targetPriceINR = skipped ? null : parseCurrencyNumber(messageText);

            if (!skipped && !targetPriceINR) {
              await sendReply(
                fromPhone,
                'Enter a valid price in INR (e.g. 500) or tap Skip.',
                buildButtons(['Skip'])
              );
              continue;
            }

            // Store target price as USD internally for comparison with CheapShark prices
            const targetPriceUSD = targetPriceINR ? Math.round((targetPriceINR / USD_TO_INR) * 100) / 100 : null;

            await saveTrackingSession({ fromPhone, session: activeSession, targetPrice: targetPriceUSD });
            trackSessions.delete(fromPhone);

            const scopeLabel = activeSession.trackingScope === 'all_stores'
              ? 'across all stores'
              : `on ${activeSession.deals[0]?.storeName || 'selected store'}`;
            const targetLine = targetPriceINR
              ? `\nAlert when price drops below ₹${targetPriceINR.toLocaleString('en-IN')}`
              : '';

            await sendReply(
              fromPhone,
              `✅ *Tracking Started*\n\n` +
              `*${activeSession.gameTitle}*\n` +
              `Monitoring ${scopeLabel}` +
              targetLine +
              `\n\nI'll notify you when a better deal is found.`
            );
            continue;
          }

          // ── Default: treat as game title search ──────────────────────────
          const games = await searchGamesByTitle(messageText);

          if (!games.length) {
            await sendReply(
              fromPhone,
              `🔍 No games found for "*${messageText}*".\n\nTry a shorter or different title.`
            );
            continue;
          }

          // Pick best match: exact title match first, otherwise first result
          const normalizedQuery = normalizeText(messageText);
          const exactMatch = games.find(
            (g) => normalizeText(g.title) === normalizedQuery
          );
          const bestMatch = exactMatch || games[0];

          userGameCache.set(fromPhone, bestMatch);
          userDealCache.delete(fromPhone);

          const cardText = buildGameResultCard(bestMatch);
          const confirmButtons = buildButtons(['Go Ahead', 'Refine Search']);

          await sendImageReply(fromPhone, bestMatch.thumbnailUrl, cardText, confirmButtons);
        }
      }
    }
  } catch (err) {
    console.error('Webhook handling error:', err.message);
  }
};

// ---------------------------------------------------------------------------
// Utility handlers
// ---------------------------------------------------------------------------

const verifyWebhook = (req, res, verifyToken) => {
  const { 'hub.mode': mode, 'hub.challenge': challenge, 'hub.verify_token': token } = req.query;
  if (mode === 'subscribe' && token === verifyToken) {
    console.log('WEBHOOK VERIFIED');
    return res.status(200).send(challenge);
  }
  return res.status(403).end();
};

const getAllMessages = (_req, res) => {
  res.json({ total: receivedMessages.length, messages: receivedMessages });
};

const getLatestMessage = (_req, res) => {
  const latest = receivedMessages[receivedMessages.length - 1] || null;
  res.json({ latestMessage: latest });
};

module.exports = {
  handleWebhook,
  verifyWebhook,
  getAllMessages,
  getLatestMessage
};
