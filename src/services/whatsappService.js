// WhatsApp Service
const axios = require('axios');
const { GENERAL_TOKEN, PHONE_NUMBER_ID, GRAPH_API_VERSION } = require('../config/constants');

/**
 * Send WhatsApp reply message
 * @param {string} recipientPhone - Phone number of recipient
 * @param {string} replyText - Reply text message
 */
const sendReply = async (recipientPhone, replyText) => {
  try {
    // DEBUG: Check if token exists
    if (!GENERAL_TOKEN) {
      console.error('❌ ERROR: GENERAL_TOKEN is not set in environment variables!');
      return;
    }

    console.log('🔍 DEBUG: Sending reply...');
    console.log(`   Token (first 20 chars): ${GENERAL_TOKEN.substring(0, 20)}...`);
    console.log(`   Phone ID: ${PHONE_NUMBER_ID}`);
    console.log(`   To: ${recipientPhone}`);
    console.log(`   Message: ${replyText}`);

    await axios.post(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: 'whatsapp',
        to: recipientPhone,
        type: 'text',
        text: {
          preview_url: true,
          body: replyText
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${GENERAL_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );
    console.log(`✅ Auto-reply sent to ${recipientPhone}`);
  } catch (error) {
    console.error('❌ Failed to send reply');
    console.error('   Status:', error.response?.status);
    console.error('   Error:', error.response?.data || error.message);
  }
};

const buildPriceDropMessage = ({ productName, oldPrice, newPrice, url, currency = 'INR' }) => {
  return (
    `Price Drop Alert\n\n` +
    `${productName}\n` +
    `Now: ${currency} ${newPrice}\n` +
    `Before: ${currency} ${oldPrice}\n\n` +
    `Buy now: ${url}`
  );
};

const buildTargetHitMessage = ({ productName, targetPrice, newPrice, url, currency = 'INR' }) => {
  return (
    `Target Hit Alert\n\n` +
    `${productName}\n` +
    `Current: ${currency} ${newPrice}\n` +
    `Target: ${currency} ${targetPrice}\n\n` +
    `Check deal: ${url}`
  );
};

const buildPriceHeartbeatMessage = ({ productName, newPrice, url, currency = 'INR' }) => {
  return (
    `Price Update\n\n` +
    `${productName}\n` +
    `Current price: ${currency} ${newPrice}\n\n` +
    `Link: ${url}`
  );
};

module.exports = {
  sendReply,
  buildPriceDropMessage,
  buildTargetHitMessage,
  buildPriceHeartbeatMessage
};
