// WhatsApp Service
const axios = require('axios');
const { GENERAL_TOKEN, PHONE_NUMBER_ID, GRAPH_API_VERSION } = require('../config/constants');

const truncateText = (text, maxLength) => {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 3)}...`;
};

/**
 * Send WhatsApp reply message with optional interactive buttons
 * @param {string} recipientPhone - Phone number of recipient
 * @param {string} replyText - Reply text message
 * @param {Array} buttons - Optional: Array of button objects [{id, title}, ...]
 */
const sendReply = async (recipientPhone, replyText, buttons = null) => {
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

    // Build payload based on whether buttons are provided
    let payload;
    
    if (buttons && buttons.length > 0) {
      // Interactive message with buttons
      const buttonBody = truncateText(replyText, 1024);
      if (buttonBody.length !== replyText.length) {
        console.warn('⚠️ WhatsApp interactive body was truncated to 1024 characters');
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
            buttons: buttons.map((btn, index) => ({
              type: 'reply',
              reply: {
                id: btn.id || `btn_${index}`,
                title: btn.title.substring(0, 20) // WhatsApp limit is 20 chars
              }
            }))
          }
        }
      };
      console.log(`   With ${buttons.length} buttons`);
    } else {
      // Simple text message
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

/**
 * Send search results with action buttons
 * @param {string} recipientPhone - Phone number of recipient
 * @param {string} searchResults - Formatted search results text
 * @param {Array} searchResults - Array of result objects
 */
const sendSearchResultsWithButtons = async (recipientPhone, resultsText, results = []) => {
  try {
    // Create buttons for each result
    const buttons = results.slice(0, 3).map((result, index) => ({
      id: `result_${index}`,
      title: result.title ? result.title.substring(0, 20) : `Result ${index + 1}`
    }));

    // Add extra options buttons
    buttons.push({
      id: 'search_again',
      title: 'Search Again'
    });

    await sendReply(recipientPhone, resultsText, buttons);
  } catch (error) {
    console.error('❌ Failed to send search results:', error.message);
  }
};

/**
 * Build quick reply buttons
 * @param {Array} options - Array of option strings
 * @returns {Array} Formatted button objects
 */
const buildQuickReplyButtons = (options) => {
  return options.map((option, index) => ({
    id: `option_${index}`,
    title: option.substring(0, 20)
  }));
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
  sendSearchResultsWithButtons,
  buildQuickReplyButtons,
  buildPriceDropMessage,
  buildTargetHitMessage,
  buildPriceHeartbeatMessage
};
