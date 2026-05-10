const axios = require('axios');
const { CHEAPSHARK_API_BASE_URL } = require('../config/constants');

const apiClient = axios.create({
  baseURL: CHEAPSHARK_API_BASE_URL,
  timeout: 12000
});

const CHEAPSHARK_ORIGIN = 'https://www.cheapshark.com';
const STORE_CACHE_TTL_MS = 60 * 60 * 1000;
let storeCache = {
  expiresAt: 0,
  stores: [],
  storeMap: new Map()
};

const normalizePrice = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  return numeric;
};

const normalizeDiscount = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return 0;
  return Math.round(numeric * 100) / 100;
};

const buildPurchaseUrl = (dealID) => {
  return dealID ? `https://www.cheapshark.com/redirect?dealID=${encodeURIComponent(dealID)}` : null;
};

const buildImageUrl = (path) => {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return `${CHEAPSHARK_ORIGIN}${path}`;
};

const normalizeStore = (store) => ({
  storeID: store.storeID,
  storeName: store.storeName || `Store ${store.storeID}`,
  isActive: Boolean(Number(store.isActive)),
  images: {
    banner: buildImageUrl(store.images?.banner),
    logo: buildImageUrl(store.images?.logo),
    icon: buildImageUrl(store.images?.icon)
  }
});

const buildStoreMap = (stores) => {
  return new Map(stores.map((store) => [String(store.storeID), store]));
};

const getStores = async ({ forceRefresh = false } = {}) => {
  const now = Date.now();
  if (!forceRefresh && storeCache.expiresAt > now) {
    return storeCache.stores;
  }

  const response = await apiClient.get('/stores');
  const stores = (response.data || []).map(normalizeStore);

  storeCache = {
    expiresAt: now + STORE_CACHE_TTL_MS,
    stores,
    storeMap: buildStoreMap(stores)
  };

  return stores;
};

const getStoreMap = async () => {
  await getStores();
  return storeCache.storeMap;
};

const buildStoreName = (storeID, storeMap = new Map()) => {
  if (!storeID) return 'Unknown store';
  return storeMap.get(String(storeID))?.storeName || `Store ${storeID}`;
};

const getStoreMetadata = (storeID, storeMap = new Map()) => {
  return storeMap.get(String(storeID)) || {
    storeID,
    storeName: buildStoreName(storeID, storeMap),
    isActive: null,
    images: {
      banner: null,
      logo: null,
      icon: null
    }
  };
};

const normalizeGameSearchResult = (game) => ({
  gameID: game.gameID,
  title: game.external,
  cheapestPrice: normalizePrice(game.cheapest),
  cheapestDealID: game.cheapestDealID,
  steamAppID: game.steamAppID || null,
  thumbnailUrl: game.thumb || null
});

const normalizeGameDeal = (deal, storeMap) => ({
  dealID: deal.dealID,
  storeID: deal.storeID,
  storeName: buildStoreName(deal.storeID, storeMap),
  store: getStoreMetadata(deal.storeID, storeMap),
  price: normalizePrice(deal.price),
  retailPrice: normalizePrice(deal.retailPrice),
  savings: normalizeDiscount(deal.savings),
  purchaseUrl: buildPurchaseUrl(deal.dealID)
});

const normalizeGameDetails = (payload, gameID, storeMap) => {
  const deals = (payload?.deals || []).map((deal) => normalizeGameDeal(deal, storeMap));

  return {
    gameID,
    title: payload?.info?.title || null,
    steamAppID: payload?.info?.steamAppID || null,
    thumbnailUrl: payload?.info?.thumb || null,
    cheapestPriceEver: {
      price: normalizePrice(payload?.cheapestPriceEver?.price),
      date: payload?.cheapestPriceEver?.date ? new Date(payload.cheapestPriceEver.date * 1000) : null
    },
    deals
  };
};

const normalizeDealDetails = (payload, dealID, storeMap) => {
  const gameInfo = payload?.gameInfo || {};

  return {
    dealID,
    gameID: gameInfo.gameID || null,
    title: gameInfo.name || null,
    storeID: gameInfo.storeID || null,
    storeName: buildStoreName(gameInfo.storeID, storeMap),
    store: getStoreMetadata(gameInfo.storeID, storeMap),
    price: normalizePrice(gameInfo.salePrice),
    retailPrice: normalizePrice(gameInfo.retailPrice),
    steamAppID: gameInfo.steamAppID || null,
    thumbnailUrl: gameInfo.thumb || null,
    purchaseUrl: buildPurchaseUrl(dealID),
    cheapestPriceEver: {
      price: normalizePrice(payload?.cheapestPrice?.price),
      date: payload?.cheapestPrice?.date ? new Date(payload.cheapestPrice.date * 1000) : null
    },
    cheaperStores: (payload?.cheaperStores || []).map((storeDeal) => ({
      dealID: storeDeal.dealID,
      storeID: storeDeal.storeID,
      storeName: buildStoreName(storeDeal.storeID, storeMap),
      store: getStoreMetadata(storeDeal.storeID, storeMap),
      price: normalizePrice(storeDeal.salePrice),
      retailPrice: normalizePrice(storeDeal.retailPrice),
      purchaseUrl: buildPurchaseUrl(storeDeal.dealID)
    }))
  };
};

const searchGamesByTitle = async (title) => {
  const response = await apiClient.get('/games', {
    params: { title }
  });

  return (response.data || []).map(normalizeGameSearchResult);
};

const getGameDetailsWithDeals = async (gameID) => {
  const response = await apiClient.get('/games', {
    params: { id: gameID }
  });
  const storeMap = await getStoreMap();

  return normalizeGameDetails(response.data, gameID, storeMap);
};

const getDealDetails = async (dealID) => {
  // dealID from CheapShark is already URL-encoded (e.g. contains %3D).
  // Passing it through axios `params` would double-encode it (%3D → %253D),
  // causing a 404. Decode first so axios re-encodes it back to the correct form.
  const decodedDealID = decodeURIComponent(dealID);
  const builtUrl = `${CHEAPSHARK_API_BASE_URL}/deals?id=${encodeURIComponent(decodedDealID)}`;
  console.log(`[getDealDetails] Requesting: ${builtUrl}`);

  const response = await apiClient.get('/deals', {
    params: { id: decodedDealID }
  });
  const storeMap = await getStoreMap();

  return normalizeDealDetails(response.data, dealID, storeMap);
};

const compareDeals = (deals = []) => {
  const availableDeals = deals
    .filter((deal) => Number.isFinite(deal.price))
    .sort((a, b) => a.price - b.price);

  const bestDeal = availableDeals[0] || null;

  return {
    bestDeal,
    deals: availableDeals
  };
};

module.exports = {
  searchGamesByTitle,
  getGameDetailsWithDeals,
  getDealDetails,
  getStores,
  compareDeals,
  buildPurchaseUrl,
  normalizeStore,
  normalizePrice
};
