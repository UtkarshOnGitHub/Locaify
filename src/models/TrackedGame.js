const mongoose = require('mongoose');
const { TRACKING_CONFIG } = require('../config/constants');

const trackedGameSchema = new mongoose.Schema(
  {
    userPhone: { type: String, required: true, index: true },
    gameID: { type: String, required: true, index: true },
    dealID: { type: String, default: null, index: true },
    gameTitle: { type: String, required: true },
    purchaseUrl: { type: String, default: null },
    storeName: { type: String, default: 'web' },
    storeID: { type: String, default: null },
    platform: { type: String, default: null },
    region: { type: String, default: TRACKING_CONFIG.defaultRegion },
    currency: { type: String, default: TRACKING_CONFIG.defaultCurrency },
    baselinePrice: { type: Number, required: true },
    lastCheckedPrice: { type: Number, required: true },
    targetPrice: { type: Number, default: null },
    trackingScope: {
      type: String,
      enum: ['all_stores', 'store_specific'],
      default: 'store_specific'
    },
    trackingMode: {
      type: String,
      enum: ['duration', 'until_better_deal'],
      default: 'duration'
    },
    expiresAt: { type: Date, default: null },
    isActive: { type: Boolean, default: true, index: true },
    lastNotifiedPrice: { type: Number, default: null },
    lastCheckedAt: { type: Date, default: null },
    checkCount: { type: Number, default: 0 }
  },
  { timestamps: true }
);

trackedGameSchema.index({ isActive: 1, expiresAt: 1 });
trackedGameSchema.index({ userPhone: 1, gameID: 1, dealID: 1 }, { unique: true });

module.exports = mongoose.model('TrackedGame', trackedGameSchema);
