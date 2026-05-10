const axios = require('axios');
const { GENERAL_TOKEN, PHONE_NUMBER_ID, GRAPH_API_VERSION } = require('../config/constants');

const truncateText = (text, maxLength) => {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 3)}...`;
};

const buildButtonPayload = (buttons) => {
  return buttons.slice(0, 3).map((btn, index) => ({
    type: 'reply',
    reply: {
      id: btn.id || `btn_${index}`,
      title: truncateText(btn.title, 20)
    }
  }));
};

const sendReply = async (recipientPhone, replyText, buttons = null, options = {}) => {
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
          ...(options.headerImageUrl
            ? {
                header: {
                  type: 'image',
                  image: {
                    link: options.headerImageUrl
                  }
                }
              }
            : {}),
          body: {
            text: buttonBody
          },
          action: {
            buttons: buildButtonPayload(buttons)
          }
        }
      };
    } else if (options.headerImageUrl) {
      payload = {
        messaging_product: 'whatsapp',
        to: recipientPhone,
        type: 'image',
        image: {
          link: options.headerImageUrl,
          caption: truncateText(replyText, 1024)
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

    const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${PHONE_NUMBER_ID}/messages`;
    console.log(`Sending to Meta API: ${url}`);
    console.log(`Payload: ${JSON.stringify(payload)}`);

    const response = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${GENERAL_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    console.log(`WhatsApp reply sent to ${recipientPhone}. Response:`, JSON.stringify(response.data));
  } catch (error) {
    console.error('=== sendReply FAILED ===');
    console.error('Status:', error.response?.status);
    console.error('Meta error:', JSON.stringify(error.response?.data, null, 2));
    console.error('Message:', error.message);
    console.error('=======================');
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
    `*Better Deal Found*\n\n` +
    `Game: ${gameTitle}\n` +
    formatStore(storeName) +
    `New price: ${currency} ${newPrice}\n` +
    `Previous price: ${currency} ${oldPrice}\n\n` +
    `Buy link:\n${url}`
  );
};

const buildTargetHitMessage = ({ gameTitle, storeName, targetPrice, newPrice, url, currency = 'USD' }) => {
  return (
    `*Target Price Hit*\n\n` +
    `Game: ${gameTitle}\n` +
    formatStore(storeName) +
    `Current: ${currency} ${newPrice}\n` +
    `Target: ${currency} ${targetPrice}\n\n` +
    `Buy link:\n${url}`
  );
};

const buildDealHeartbeatMessage = ({ gameTitle, storeName, newPrice, url, currency = 'USD' }) => {
  return (
    `*Deal Update*\n\n` +
    `Game: ${gameTitle}\n` +
    formatStore(storeName) +
    `Current price: ${currency} ${newPrice}\n\n` +
    `Buy link:\n${url}`
  );
};

module.exports = {
  sendReply,
  buildQuickReplyButtons,
  buildBetterDealMessage,
  buildTargetHitMessage,
  buildDealHeartbeatMessage
};
