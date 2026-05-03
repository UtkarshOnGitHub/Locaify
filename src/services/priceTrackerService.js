const cron = require('node-cron');
const TrackedProduct = require('../models/TrackedProduct');
const { TRACKING_CONFIG } = require('../config/constants');
const { fetchLatestPrice } = require('./priceExtractorService');
const {
  sendReply,
  buildPriceDropMessage,
  buildPriceHeartbeatMessage
} = require('./whatsappService');

let trackingTask = null;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const shouldNotifyPriceDrop = (track, newPrice) => {
  if (!track.lastCheckedPrice) return false;
  if (newPrice >= track.lastCheckedPrice) return false;

  // Dedupe repeated notifications for unchanged dropped price.
  if (track.lastNotifiedPrice && track.lastNotifiedPrice === newPrice) return false;
  return true;
};

const runTrackingCheck = async () => {
  const now = new Date();
  console.log('🔁 Running price tracking check...');

  const tracks = await TrackedProduct.find({
    isActive: true,
    $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }]
  })
    .limit(TRACKING_CONFIG.maxTracksPerRun)
    .sort({ updatedAt: 1 });

  for (const track of tracks) {
    const extracted = await fetchLatestPrice(track.url);
    if (!extracted.ok) {
      console.log(`⚠️ Price extraction failed for ${track.url}: ${extracted.errorType}`);
      continue;
    }

    const newPrice = extracted.price;
    const isBypassMode = TRACKING_CONFIG.bypassPriceCheck;
    const isDrop = shouldNotifyPriceDrop(track, newPrice);
    const shouldNotify = isBypassMode || isDrop;

    if (shouldNotify) {
      const message = isBypassMode
        ? buildPriceHeartbeatMessage({
            productName: track.productName,
            newPrice,
            url: track.url,
            currency: track.currency
          })
        : buildPriceDropMessage({
            productName: track.productName,
            oldPrice: track.lastCheckedPrice,
            newPrice,
            url: track.url,
            currency: track.currency
          });

      await sendReply(
        track.userPhone,
        message
      );
    }

    const updates = {
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
    if (track.trackingMode === 'until_drop' && isDrop) {
      updates.isActive = false;
    }

    await TrackedProduct.updateOne({ _id: track._id }, { $set: updates });
    await sleep(TRACKING_CONFIG.requestDelayMs);
  }

  await TrackedProduct.updateMany(
    { isActive: true, expiresAt: { $ne: null, $lte: now } },
    { $set: { isActive: false } }
  );
};

const startTrackingCron = () => {
  if (trackingTask) return trackingTask;

  trackingTask = cron.schedule(TRACKING_CONFIG.cronExpression, async () => {
    try {
      await runTrackingCheck();
    } catch (error) {
      console.error('❌ Tracking cron error:', error.message);
    }
  });

  console.log(`⏱️ Tracking cron started: ${TRACKING_CONFIG.cronExpression}`);
  console.log(`🧪 Price check bypass mode: ${TRACKING_CONFIG.bypassPriceCheck}`);
  return trackingTask;
};

module.exports = {
  startTrackingCron,
  runTrackingCheck,
  shouldNotifyPriceDrop
};
