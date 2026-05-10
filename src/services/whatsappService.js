const axios = require('axios');
const { GENERAL_TOKEN, PHONE_NUMBER_ID, GRAPH_API_VERSION } = require('../config/constants');

const truncateText = (text, maxLength) => {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 3)}...`;
};

const sendReply = async (recipientPhone, replyText, buttons = null) => {
  try {
    if (!GENERAL_TOKEN) {
      console.error('GENERAL_TOKEN is not set in environment variables.');
      return;
    }

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
          body: {
            text: buttonBody
          },
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
        text: {
          preview_url: true,
          body: replyText
        }
      };
    }

    await axios.post(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${PHONE_NUMBER_ID}/messages`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${GENERAL_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log(`WhatsApp reply sent to ${recipientPhone}`);
  } catch (error) {
    console.error('Failed to send WhatsApp reply.');
    console.error('Status:', error.response?.status);
    console.error('Error:', error.response?.data || error.message);
  }
};

const buildQuickReplyButtons = (options) => {
  return options.slice(0, 3).map((option, index) => ({
    id: `option_${index}`,
    title: truncateText(option, 20)
  }));
};

const formatStore = (storeName) => {
  return storeName && storeName !== 'web' ? `Store: ${storeName}\n` : '';
};

const buildBetterDealMessage = ({ gameTitle, storeName, oldPrice, newPrice, url, currency = 'USD' }) => {
  return (
    `Better Deal Alert\n\n` +
    `${gameTitle}\n` +
    formatStore(storeName) +
    `Now: ${currency} ${newPrice}\n` +
    `Before: ${currency} ${oldPrice}\n\n` +
    `Buy now: ${url}`
  );
};

const buildTargetHitMessage = ({ gameTitle, storeName, targetPrice, newPrice, url, currency = 'USD' }) => {
  return (
    `Target Price Hit\n\n` +
    `${gameTitle}\n` +
    formatStore(storeName) +
    `Current: ${currency} ${newPrice}\n` +
    `Target: ${currency} ${targetPrice}\n\n` +
    `Check deal: ${url}`
  );
};

const buildDealHeartbeatMessage = ({ gameTitle, storeName, newPrice, url, currency = 'USD' }) => {
  return (
    `Deal Update\n\n` +
    `${gameTitle}\n` +
    formatStore(storeName) +
    `Current price: ${currency} ${newPrice}\n\n` +
    `Link: ${url}`
  );
};

module.exports = {
  sendReply,
  buildQuickReplyButtons,
  buildBetterDealMessage,
  buildTargetHitMessage,
  buildDealHeartbeatMessage
};
