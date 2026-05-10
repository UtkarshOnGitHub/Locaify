const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizePrice, normalizeStore, compareDeals } = require('../src/services/gameDealsApiService');
const {
  shouldNotifyBetterDeal,
  shouldNotifyTargetHit
} = require('../src/services/dealMonitorService');

test('normalizePrice parses API price values', () => {
  assert.equal(normalizePrice('54.99'), 54.99);
  assert.equal(normalizePrice(0), 0);
});

test('normalizePrice returns null for invalid values', () => {
  assert.equal(normalizePrice('not-a-price'), null);
  assert.equal(normalizePrice(-1), null);
});

test('normalizeStore maps metadata and image URLs', () => {
  assert.deepEqual(
    normalizeStore({
      storeID: '1',
      storeName: 'Steam',
      isActive: 1,
      images: {
        banner: '/img/stores/banners/0.png',
        logo: '/img/stores/logos/0.png',
        icon: '/img/stores/icons/0.png'
      }
    }),
    {
      storeID: '1',
      storeName: 'Steam',
      isActive: true,
      images: {
        banner: 'https://www.cheapshark.com/img/stores/banners/0.png',
        logo: 'https://www.cheapshark.com/img/stores/logos/0.png',
        icon: 'https://www.cheapshark.com/img/stores/icons/0.png'
      }
    }
  );
});

test('shouldNotifyBetterDeal works with dedupe', () => {
  assert.equal(
    shouldNotifyBetterDeal({ lastCheckedPrice: 60000, lastNotifiedPrice: null }, 59000),
    true
  );
  assert.equal(
    shouldNotifyBetterDeal({ lastCheckedPrice: 60000, lastNotifiedPrice: 59000 }, 59000),
    false
  );
  assert.equal(
    shouldNotifyBetterDeal({ lastCheckedPrice: 60000, lastNotifiedPrice: null }, 61000),
    false
  );
});

test('shouldNotifyBetterDeal is false when there is no baseline price', () => {
  assert.equal(
    shouldNotifyBetterDeal({ lastCheckedPrice: 0, lastNotifiedPrice: null }, 54000),
    false
  );
});

test('compareDeals recommends the cheapest available deal', () => {
  const comparison = compareDeals([
    { dealID: 'a', price: 19.99 },
    { dealID: 'b', price: 9.99 },
    { dealID: 'c', price: null }
  ]);

  assert.equal(comparison.bestDeal.dealID, 'b');
  assert.deepEqual(comparison.deals.map((deal) => deal.dealID), ['b', 'a']);
});

test('shouldNotifyTargetHit works with dedupe', () => {
  assert.equal(
    shouldNotifyTargetHit({ targetPrice: 10, lastNotifiedPrice: null }, 9.99),
    true
  );
  assert.equal(
    shouldNotifyTargetHit({ targetPrice: 10, lastNotifiedPrice: 9.99 }, 9.99),
    false
  );
  assert.equal(
    shouldNotifyTargetHit({ targetPrice: 10, lastNotifiedPrice: null }, 12),
    false
  );
});
