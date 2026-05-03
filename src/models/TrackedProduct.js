const mongoose = require('mongoose');
const { TRACKING_CONFIG } = require('../config/constants');

const trackedProductSchema = new mongoose.Schema(
  {
    userPhone: { type: String, required: true, index: true },
    productName: { type: String, required: true },
    url: { type: String, required: true },
    source: { type: String, default: 'web' },
    currency: { type: String, default: TRACKING_CONFIG.defaultCurrency },
    baselinePrice: { type: Number, required: true },
    lastCheckedPrice: { type: Number, required: true },
    targetPrice: { type: Number, default: null },
    trackingMode: {
      type: String,
      enum: ['duration', 'until_drop'],
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

trackedProductSchema.index({ isActive: 1, expiresAt: 1 });
trackedProductSchema.index({ userPhone: 1, url: 1 }, { unique: true });

module.exports = mongoose.model('TrackedProduct', trackedProductSchema);
