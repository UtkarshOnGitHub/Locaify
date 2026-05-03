const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizePrice } = require('../src/services/priceExtractorService');
const {
  shouldNotifyPriceDrop
} = require('../src/services/priceTrackerService');

test('normalizePrice parses INR formats', () => {
  assert.equal(normalizePrice('₹54,999'), 54999);
  assert.equal(normalizePrice('INR 62,450.00'), 62450);
});

test('normalizePrice returns null for invalid values', () => {
  assert.equal(normalizePrice('not-a-price'), null);
  assert.equal(normalizePrice('₹0'), null);
});

test('shouldNotifyPriceDrop works with dedupe', () => {
  assert.equal(
    shouldNotifyPriceDrop({ lastCheckedPrice: 60000, lastNotifiedPrice: null }, 59000),
    true
  );
  assert.equal(
    shouldNotifyPriceDrop({ lastCheckedPrice: 60000, lastNotifiedPrice: 59000 }, 59000),
    false
  );
  assert.equal(
    shouldNotifyPriceDrop({ lastCheckedPrice: 60000, lastNotifiedPrice: null }, 61000),
    false
  );
});

test('shouldNotifyPriceDrop is false when there is no baseline price', () => {
  assert.equal(
    shouldNotifyPriceDrop({ lastCheckedPrice: 0, lastNotifiedPrice: null }, 54000),
    false
  );
});
