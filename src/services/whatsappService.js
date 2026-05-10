const axios = require('axios');
const { GENERAL_TOKEN, PHONE_NUMBER_ID, GRAPH_API_VERSION } = require('../config/constants');

const GRAPH_API_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}/${PHONE_NUMBER_ID}/messages`;

const truncateText = (text, maxLength) => {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 3)}...`;
};

const postToWhatsApp = async (payload) => {
  if (!GENERAL_TOKEN) {
    console.error('GENERAL_TOKEN is not set in environment variables.');
    return;
  }

  await axios.post(GRAPH_API_URL, payload, {
    headers: {
      Authorization: `Bearer ${GENERAL_TOKEN}`,
      'Content-Type': 'application/json'
    }
  });
};

/**
 * Send a plain text or interactive button message.
 * @param {string} recipientPhone
 * @param {string} replyText
 * @param {Array|null} buttons  - Array of { id, title }
 */
const sendReply = async (recipientPhone, replyText, buttons = null) => {
  try {
    let payload;

    if (buttons && buttons.length > 0) {
      const buttonBody = truncateText(replyText, 1024);
      if (buttonBody.length !== replyText.length) {
        console.warn('WhatsApp interactive body was truncated to 1024 characters.');
      }

      payload = {
        messaging_product: 'whatsapp',
        to: recipientPhone,
        type: 'interactive',
        interactive: {
          type: 'button',
          body: { text: buttonBody },
          action: {
            buttons: buttons.slice(0, 3).map((btn, index) => ({
              type: 'reply',
              reply: {
                id: btn.id || `btn_${index}`,
                title: truncateText(btn.title, 20)
              }
            }))
          }
        }
      };
    } else {
      payload = {
        messaging_product: 'whatsapp',
        to: recipientPhone,
        type: 'text',
        text: { preview_url: false, body: replyText }
      };
    }

    await postToWhatsApp(payload);
    console.log(`WhatsApp reply sent to ${recipientPhone}`);
  } catch (error) {
    console.error('Failed to send WhatsApp reply.');
    console.error('Status:', error.response?.status);
    console.error('Error:', error.response?.data || error.message);
  }
};

/**
 * Send an interactive button message with an image header.
 * Falls back to plain button message if imageUrl is missing.
 * @param {string} recipientPhone
 * @param {string} imageUrl       - Public HTTPS URL for the thumbnail
 * @param {string} bodyText       - Message body (max 1024 chars)
 * @param {Array}  buttons        - Array of { id, title }
 */
const sendImageReply = async (recipientPhone, imageUrl, bodyText, buttons = []) => {
  try {
    const body = truncateText(bodyText, 1024);

    if (!imageUrl) {
      return sendReply(recipientPhone, body, buttons);
    }

    const payload = {
      messaging_product: 'whatsapp',
      to: recipientPhone,
      type: 'interactive',
      interactive: {
        type: 'button',
        header: {
          type: 'image',
          image: { link: imageUrl }
        },
        body: { text: body },
        action: {
          buttons: buttons.slice(0, 3).map((btn, index) => ({
            type: 'reply',
            reply: {
              id: btn.id || `btn_${index}`,
              title: truncateText(btn.title, 20)
            }
          }))
        }
      }
    };

    await postToWhatsApp(payload);
    console.log(`WhatsApp image reply sent to ${recipientPhone}`);
  } catch (error) {
    console.error('Failed to send WhatsApp image reply.');
    console.error('Status:', error.response?.status);
    console.error('Error:', error.response?.data || error.message);
    // Fallback to plain text if image send fails
    await sendReply(recipientPhone, bodyText, buttons);
  }
};

const buildQuickReplyButtons = (options) => {
  return options.slice(0, 3).map((option, index) => ({
    id: `option_${index}`,
    title: truncateText(option, 20)
  }));
};

const formatStore = (storeName) => {
  return storeName && storeName !== 'web' ? `${storeName}\n` : '';
};

const buildBetterDealMessage = ({ gameTitle, storeName, oldPrice, newPrice, url, currency = 'INR' }) => {
  return (
    `🎮 *Better Deal Alert*\n\n` +
    `*${gameTitle}*\n` +
    (storeName && storeName !== 'web' ? `🏪 ${storeName}\n` : '') +
    `\n💰 Now: ${currency} ${newPrice}\n` +
    `Was: ${currency} ${oldPrice}\n\n` +
    `👉 ${url}`
  );
};

const buildTargetHitMessage = ({ gameTitle, storeName, targetPrice, newPrice, url, currency = 'INR' }) => {
  return (
    `🎯 *Target Price Hit*\n\n` +
    `*${gameTitle}*\n` +
    (storeName && storeName !== 'web' ? `🏪 ${storeName}\n` : '') +
    `\n💰 Current: ${currency} ${newPrice}\n` +
    `Target was: ${currency} ${targetPrice}\n\n` +
    `👉 ${url}`
  );
};

const buildDealHeartbeatMessage = ({ gameTitle, storeName, newPrice, url, currency = 'INR' }) => {
  return (
    `📊 *Deal Update*\n\n` +
    `*${gameTitle}*\n` +
    (storeName && storeName !== 'web' ? `🏪 ${storeName}\n` : '') +
    `\n💰 Current: ${currency} ${newPrice}\n\n` +
    `👉 ${url}`
  );
};

module.exports = {
  sendReply,
  sendImageReply,
  buildQuickReplyButtons,
  buildBetterDealMessage,
  buildTargetHitMessage,
  buildDealHeartbeatMessage
};
