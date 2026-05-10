const cron = require('node-cron');
const TrackedGame = require('../models/TrackedGame');
const { TRACKING_CONFIG } = require('../config/constants');
const { getDealDetails } = require('./gameDealsApiService');
const {
  sendReply,
  buildBetterDealMessage,
  buildDealHeartbeatMessage,
  buildTargetHitMessage
} = require('./whatsappService');

let monitoringTask = null;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const shouldNotifyBetterDeal = (track, newPrice) => {
  if (!track.lastCheckedPrice) return false;
  if (newPrice >= track.lastCheckedPrice) return false;

  // Dedupe repeated notifications for unchanged lower prices.
  if (track.lastNotifiedPrice && track.lastNotifiedPrice === newPrice) return false;
  return true;
};

const shouldNotifyTargetHit = (track, newPrice) => {
  if (!track.targetPrice) return false;
  if (newPrice > track.targetPrice) return false;
  if (track.lastNotifiedPrice && track.lastNotifiedPrice === newPrice) return false;
  return true;
};

const runDealMonitoringCheck = async () => {
  const now = new Date();
  console.log('Running game deal monitoring check...');

  const tracks = await TrackedGame.find({
    isActive: true,
    dealID: { $ne: null },
    $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }]
  })
    .limit(TRACKING_CONFIG.maxTracksPerRun)
    .sort({ updatedAt: 1 });

  for (const track of tracks) {
    const deal = await getDealDetails(track.dealID);
    const newPrice = deal.price;

    if (!Number.isFinite(newPrice)) {
      console.log(`Deal price unavailable for deal ${track.dealID}`);
      continue;
    }

    const isBypassMode = TRACKING_CONFIG.bypassPriceCheck;
    const isBetterDeal = shouldNotifyBetterDeal(track, newPrice);
    const isTargetHit = shouldNotifyTargetHit(track, newPrice);
    const shouldNotify = isBypassMode || isBetterDeal || isTargetHit;
    const gameTitle = deal.title || track.gameTitle;
    const storeName = deal.storeName || track.storeName;
    const purchaseUrl = deal.purchaseUrl || track.purchaseUrl;

    if (shouldNotify) {
      let message;

      if (isBypassMode) {
        message = buildDealHeartbeatMessage({
          gameTitle,
          storeName,
          newPrice,
          url: purchaseUrl,
          currency: track.currency
        });
      } else if (isTargetHit) {
        message = buildTargetHitMessage({
          gameTitle,
          storeName,
          targetPrice: track.targetPrice,
          newPrice,
          url: purchaseUrl,
          currency: track.currency
        });
      } else {
        message = buildBetterDealMessage({
          gameTitle,
          storeName,
          oldPrice: track.lastCheckedPrice,
          newPrice,
          url: purchaseUrl,
          currency: track.currency
        });
      }

      await sendReply(track.userPhone, message);
    }

    const updates = {
      gameTitle,
      storeName,
      purchaseUrl,
      lastCheckedPrice: newPrice,
      lastCheckedAt: new Date(),
      checkCount: (track.checkCount || 0) + 1
    };

    if (shouldNotify) {
      updates.lastNotifiedPrice = newPrice;
    }
    if (track.expiresAt && track.expiresAt <= now) {
      updates.isActive = false;
    }
    if (track.trackingMode === 'until_better_deal' && (isBetterDeal || isTargetHit)) {
      updates.isActive = false;
    }

    await TrackedGame.updateOne({ _id: track._id }, { $set: updates });
    await sleep(TRACKING_CONFIG.requestDelayMs);
  }

  await TrackedGame.updateMany(
    { isActive: true, expiresAt: { $ne: null, $lte: now } },
    { $set: { isActive: false } }
  );
};

const startDealMonitoringCron = () => {
  if (monitoringTask) return monitoringTask;

  monitoringTask = cron.schedule(TRACKING_CONFIG.cronExpression, async () => {
    try {
      await runDealMonitoringCheck();
    } catch (error) {
      console.error('Deal monitoring cron error:', error.message);
    }
  });

  console.log(`Deal monitoring cron started: ${TRACKING_CONFIG.cronExpression}`);
  console.log(`Price check bypass mode: ${TRACKING_CONFIG.bypassPriceCheck}`);
  return monitoringTask;
};

module.exports = {
  startDealMonitoringCron,
  runDealMonitoringCheck,
  shouldNotifyBetterDeal,
  shouldNotifyTargetHit
};
