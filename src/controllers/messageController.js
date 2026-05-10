const Message = require('../models/Message');
const TrackedGame = require('../models/TrackedGame');
const { sendReply } = require('../services/whatsappService');
const {
  searchGamesByTitle,
  getGameDetailsWithDeals,
  compareDeals
} = require('../services/gameDealsApiService');
const { TRACKING_CONFIG } = require('../config/constants');

const buildFooter = () => {
  return '\n--------------\nReply STOP to cancel tracking';
};

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

const formatMessage = ({ title, body }) => {
  return `${title ? `*${title}*\n\n` : ''}${body}${buildFooter()}`;
};

const receivedMessages = [];
const userGameCache = new Map();
const userDealCache = new Map();
const trackSessions = new Map();
const processedMessageIds = new Set();
const MAX_PROCESSED_MESSAGE_IDS = 1000;

const SELECT_GAME_REGEX = /^(?:game|select)\s+([1-3])$/i;
const TRACK_COMMAND_REGEX = /^track(?:\s+this)?(?:\s+(?:deal\s+)?([1-9]))?$/i;
const TRACK_ALL_REGEX = /^track\s+all(?:\s+stores)?$/i;
const NUMBER_SHORTCUTS = { one: '1', two: '2', three: '3' };

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
  const normalized = normalizeText(text);

  if (/\b(1|one)\b/.test(normalized) || normalized.includes('3 days') || normalized.includes('three days')) {
    return { trackingMode: 'duration', days: 3 };
  }
  if (/\b(2|two)\b/.test(normalized) || normalized.includes('7 days') || normalized.includes('seven days')) {
    return { trackingMode: 'duration', days: 7 };
  }
  if (
    /\b(3|three)\b/.test(normalized) ||
    normalized.includes('until better deal') ||
    normalized.includes('until price drops') ||
    normalized.includes('until drop')
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

  const oldestMessageId = processedMessageIds.values().next().value;
  processedMessageIds.delete(oldestMessageId);
};

const getMessageText = (message) => {
  if (message.type === 'text') {
    return (message.text?.body || '').trim();
  }

  if (message.type === 'interactive') {
    return (
      message.interactive?.button_reply?.title ||
      message.interactive?.list_reply?.title ||
      ''
    ).trim();
  }

  return '';
};

const formatPrice = (price) => {
  if (!Number.isFinite(price)) return 'N/A';
  return `${TRACKING_CONFIG.defaultCurrency} ${price.toFixed(2)}`;
};

const formatHistoricalLow = (cheapestPriceEver) => {
  if (!Number.isFinite(cheapestPriceEver?.price)) return 'Historical low: N/A';
  const dateText = cheapestPriceEver.date
    ? cheapestPriceEver.date.toISOString().slice(0, 10)
    : 'date unknown';
  return `Historical low: ${formatPrice(cheapestPriceEver.price)} (${dateText})`;
};

const buildGameSearchResultsMessage = (games) => {
  return formatMessage({
    title: 'Matching Games',
    body: games
      .map((game, index) => (
        `${index + 1}. ${game.title}\n` +
        `Best seen now: ${formatPrice(game.cheapestPrice)}`
      ))
      .join('\n\n')
  });
};

const buildDealResultsMessage = ({ title, cheapestPriceEver, deals, bestDeal }) => {
  const dealLines = deals.slice(0, 3).map((deal, index) => (
    `${index + 1}. ${deal.storeName}\n` +
    `Price: ${formatPrice(deal.price)}\n` +
    `Discount: ${deal.savings}%\n` +
    `Buy: ${deal.purchaseUrl}`
  ));

  const recommendation = bestDeal
    ? `Recommended: ${bestDeal.storeName} at ${formatPrice(bestDeal.price)}`
    : 'Recommended: No available deal found';

  return formatMessage({
    title: title || 'Game Deals',
    body: [
      recommendation,
      formatHistoricalLow(cheapestPriceEver),
      '',
      ...dealLines,
      '',
      'Reply Track All to monitor every listed store.'
    ].join('\n')
  });
};

const buildDurationPrompt = (session) => {
  const scopeText = session.trackingScope === 'all_stores'
    ? 'all available stores'
    : session.deals[0]?.storeName || 'this store';

  return formatMessage({
    title: 'Tracking Setup',
    body: `${session.gameTitle}\nTracking: ${scopeText}\n\nHow long should I watch this game deal?`
  });
};

const buildTargetPrompt = () => {
  return formatMessage({
    title: 'Target Price',
    body: `Send your desired price in ${TRACKING_CONFIG.defaultCurrency} or reply Skip.`
  });
};

const buildCancelledMessage = () => {
  return formatMessage({
    title: 'Tracking Cancelled',
    body: 'No problem. You can search for another game anytime.'
  });
};

const getExpiryDate = ({ trackingMode, days }) => {
  if (trackingMode !== 'duration' || !days) return null;
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
};

const buildTrackingSession = ({ fromPhone, dealCache, trackingScope, deals }) => {
  const session = {
    state: 'awaiting_duration',
    gameID: dealCache.gameID,
    gameTitle: dealCache.gameTitle,
    trackingScope,
    deals
  };

  trackSessions.set(fromPhone, session);
  return session;
};

const saveTrackingSession = async ({ fromPhone, session, targetPrice }) => {
  const trackingMode = session.trackingMode || 'duration';
  const expiresAt = getExpiryDate({
    trackingMode,
    days: session.days
  });

  for (const deal of session.deals) {
    const baselinePrice = deal.price || targetPrice || 0;

    await TrackedGame.findOneAndUpdate(
      { userPhone: fromPhone, gameID: session.gameID, dealID: deal.dealID },
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
        isActive: true
      },
      { upsert: true, setDefaultsOnInsert: true }
    );
  }
};

const showGameDeals = async (fromPhone, game) => {
  const gameDetails = await getGameDetailsWithDeals(game.gameID);
  const comparison = compareDeals(gameDetails.deals);
  const topDeals = comparison.deals.slice(0, 3);

  if (!topDeals.length) {
    await sendReply(
      fromPhone,
      formatMessage({
        title: 'No Deals Found',
        body: `I found ${game.title}, but there are no active store deals right now.`
      })
    );
    return;
  }

  userDealCache.set(fromPhone, {
    gameID: game.gameID,
    gameTitle: gameDetails.title || game.title,
    deals: comparison.deals,
    cheapestPriceEver: gameDetails.cheapestPriceEver
  });

  const actionButtons = ['Track All', ...topDeals.slice(0, 2).map((deal, index) => `Track ${index + 1}`)];

  await sendReply(
    fromPhone,
    buildDealResultsMessage({
      title: gameDetails.title || game.title,
      cheapestPriceEver: gameDetails.cheapestPriceEver,
      deals: topDeals,
      bestDeal: comparison.bestDeal
    }),
    buildButtons(actionButtons)
  );
};

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
          let messageText = getMessageText(message);

          if (!fromPhone || !messageText) {
            continue;
          }

          receivedMessages.push(new Message({
            messageId: message.id,
            messageBody: messageText,
            messageType: message.type,
            from: fromPhone,
            receivedAt: new Date().toISOString()
          }));

          const normalizedText = normalizeText(messageText);
          const activeSession = trackSessions.get(fromPhone);
          const cachedGames = userGameCache.get(fromPhone) || [];
          const dealCache = userDealCache.get(fromPhone);

          if (!activeSession && ['1', '2', '3', 'one', 'two', 'three'].includes(normalizedText)) {
            messageText = dealCache?.deals?.length
              ? `track ${NUMBER_SHORTCUTS[normalizedText] || normalizedText}`
              : `game ${NUMBER_SHORTCUTS[normalizedText] || normalizedText}`;
          }

          if (['stop', 'cancel', 'unsubscribe'].includes(normalizedText)) {
            trackSessions.delete(fromPhone);
            await sendReply(fromPhone, buildCancelledMessage(), buildButtons(['New search']));
            continue;
          }

          const gameMatch = messageText.match(SELECT_GAME_REGEX);
          if (gameMatch) {
            const chosen = cachedGames[Number(gameMatch[1]) - 1];

            if (!chosen) {
              await sendReply(
                fromPhone,
                formatMessage({
                  title: 'No Cached Games',
                  body: 'Search for a game first, then choose one of the listed matches.'
                }),
                buildButtons(['New search'])
              );
              continue;
            }

            await showGameDeals(fromPhone, chosen);
            continue;
          }

          if (TRACK_ALL_REGEX.test(messageText)) {
            if (!dealCache?.deals?.length) {
              await sendReply(
                fromPhone,
                formatMessage({
                  title: 'No Deals Selected',
                  body: 'Choose a game first, then I can track all available stores.'
                })
              );
              continue;
            }

            const session = buildTrackingSession({
              fromPhone,
              dealCache,
              trackingScope: 'all_stores',
              deals: dealCache.deals
            });

            await sendReply(fromPhone, buildDurationPrompt(session), buildButtons(['3 days', '7 days', 'Until better deal']));
            continue;
          }

          const trackMatch = messageText.match(TRACK_COMMAND_REGEX);
          if (trackMatch) {
            if (!dealCache?.deals?.length) {
              await sendReply(
                fromPhone,
                formatMessage({
                  title: 'No Deals Selected',
                  body: 'Choose a game first, then choose a store deal to track.'
                }),
                buildButtons(['New search'])
              );
              continue;
            }

            const index = trackMatch[1] ? Number(trackMatch[1]) - 1 : 0;
            const chosenDeal = dealCache.deals[index];

            if (!chosenDeal) {
              await sendReply(
                fromPhone,
                formatMessage({
                  title: 'Invalid Deal',
                  body: 'Choose one of the listed deal numbers.'
                })
              );
              continue;
            }

            const session = buildTrackingSession({
              fromPhone,
              dealCache,
              trackingScope: 'store_specific',
              deals: [chosenDeal]
            });

            await sendReply(fromPhone, buildDurationPrompt(session), buildButtons(['3 days', '7 days', 'Until better deal']));
            continue;
          }

          if (activeSession?.state === 'awaiting_duration') {
            const parsed = parseDurationChoice(messageText);

            if (!parsed) {
              await sendReply(
                fromPhone,
                formatMessage({
                  title: 'Invalid Choice',
                  body: 'Please select a valid tracking duration.'
                }),
                buildButtons(['3 days', '7 days', 'Until better deal'])
              );
              continue;
            }

            trackSessions.set(fromPhone, {
              ...activeSession,
              state: 'awaiting_target',
              ...parsed
            });

            await sendReply(fromPhone, buildTargetPrompt(), buildButtons(['Skip']));
            continue;
          }

          if (activeSession?.state === 'awaiting_target') {
            const skippedTarget = /^skip$/i.test(messageText);
            const targetPrice = skippedTarget ? null : parseCurrencyNumber(messageText);

            if (!skippedTarget && !targetPrice) {
              await sendReply(
                fromPhone,
                formatMessage({
                  title: 'Invalid Price',
                  body: `Enter a valid ${TRACKING_CONFIG.defaultCurrency} price or reply Skip.`
                }),
                buildButtons(['Skip'])
              );
              continue;
            }

            await saveTrackingSession({ fromPhone, session: activeSession, targetPrice });
            trackSessions.delete(fromPhone);

            await sendReply(
              fromPhone,
              formatMessage({
                title: 'Tracking Started',
                body:
                  `${activeSession.gameTitle}\n` +
                  `Stores tracked: ${activeSession.deals.length}\n\n` +
                  'You will be notified when a better deal or target price is detected.'
              }),
              buildButtons(['New search'])
            );
            continue;
          }

          const games = await searchGamesByTitle(messageText);
          const topGames = games.slice(0, 3);

          if (!topGames.length) {
            await sendReply(
              fromPhone,
              formatMessage({
                title: 'No Games Found',
                body: 'I could not find matching games. Try the title again with fewer words.'
              })
            );
            continue;
          }

          userGameCache.set(fromPhone, topGames);
          userDealCache.delete(fromPhone);

          await sendReply(
            fromPhone,
            buildGameSearchResultsMessage(topGames),
            topGames.map((game, index) => ({
              id: `game_${game.gameID}`,
              title: `Game ${index + 1}`
            }))
          );
        }
      }
    }
  } catch (err) {
    console.error('Webhook handling error:', err.message);
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
