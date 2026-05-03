const axios = require('axios');
const cheerio = require('cheerio');
const { TRACKING_CONFIG } = require('../config/constants');

const PRICE_SELECTORS = [
  '#priceblock_ourprice',
  '#priceblock_dealprice',
  '.a-price .a-offscreen',
  '[data-a-color="price"] .a-offscreen',
  '.priceToPay .a-offscreen'
];

const normalizePrice = (rawValue) => {
  if (!rawValue) return null;
  const cleaned = String(rawValue).replace(/[^\d.]/g, '');
  const numeric = Number(cleaned);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return Math.round(numeric);
};

const extractPriceFromHtml = (html) => {
  const $ = cheerio.load(html);

  for (const selector of PRICE_SELECTORS) {
    const value = normalizePrice($(selector).first().text());
    if (value) {
      return { ok: true, price: value, selectorUsed: selector, errorType: null };
    }
  }

  const bodyText = $('body').text().replace(/\s+/g, ' ');
  const regexMatch = bodyText.match(/(?:₹|Rs\.?|INR)\s?([\d,]{3,})/i);
  const regexPrice = normalizePrice(regexMatch?.[1]);
  if (regexPrice) {
    return { ok: true, price: regexPrice, selectorUsed: 'regex', errorType: null };
  }

  return { ok: false, price: null, selectorUsed: null, errorType: 'price_not_found' };
};

const fetchLatestPrice = async (url) => {
  try {
    const response = await axios.get(url, {
      timeout: TRACKING_CONFIG.requestTimeoutMs,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml'
      }
    });

    return extractPriceFromHtml(response.data);
  } catch (error) {
    return {
      ok: false,
      price: null,
      selectorUsed: null,
      errorType: error.code === 'ECONNABORTED' ? 'request_timeout' : 'request_failed'
    };
  }
};

module.exports = {
  fetchLatestPrice,
  extractPriceFromHtml,
  normalizePrice
};
