// Import Express.js
const express = require('express');
const axios = require('axios');
require('dotenv').config();

// Create an Express app
const app = express();

// Middleware to parse JSON bodies
app.use(express.json());

// Set port and verify_token
const port = process.env.PORT || 3000;
const verifyToken = process.env.VERIFY_TOKEN;
const token = (process.env.GENERAL_TOKEN || '').trim();
const phoneNumberId = '1053035681233537';

// Store all received messages
const receivedMessages = [];

// AUTO SEND REPLY FUNCTION
const sendReply = async (recipientPhone, replyText) => {
  try {
    await axios.post(
      `https://graph.facebook.com/v25.0/${phoneNumberId}/messages`,
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
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );
    console.log(`✅ Auto-reply sent to ${recipientPhone}`);
  } catch (error) {
    console.error('❌ Failed to send reply:', error.message);
  }
};

// Route for GET requests
app.get('/', (req, res) => {
  const { 'hub.mode': mode, 'hub.challenge': challenge, 'hub.verify_token': token } = req.query;

  if (mode === 'subscribe' && token === verifyToken) {
    console.log('WEBHOOK VERIFIED');
    res.status(200).send(challenge);
  } else {
    res.status(403).end();
  }
});

// Route for POST requests
app.post('/', (req, res) => {
  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
  console.log(`\n\nWebhook received ${timestamp}\n`);
  console.log(JSON.stringify(req.body, null, 2));

  // EXTRACT MESSAGE DATA FROM WEBHOOK
  try {
    const body = req.body;
    
    if (body.object === 'whatsapp_business_account') {
      const entries = body.entry || [];
      
      entries.forEach(entry => {
        const changes = entry.changes || [];
        
        changes.forEach(change => {
          const value = change.value || {};
          const messages = value.messages || [];
          
          // Extract each message
          messages.forEach(message => {
            const fromPhone = message.from;
            const messageText = message.text?.body || 'Non-text message';
            
            const messageData = {
              from: fromPhone,
              messageId: message.id,
              messageBody: messageText,
              messageType: message.type,
              receivedAt: new Date().toISOString()
            };
            
            // Store in array
            receivedMessages.push(messageData);
            
            // Log extracted data
            console.log('\n✅ EXTRACTED MESSAGE:');
            console.log(`   From: ${fromPhone}`);
            console.log(`   Message: ${messageText}`);
            console.log(`   Type: ${message.type}`);
            
            // 🤖 AUTO BOT: AUTOMATICALLY SEND REPLY
            const autoReply = `Thanks for your message! You said: "${messageText}"`;
            sendReply(fromPhone, autoReply);
          });
        });
      });
    }
  } catch (error) {
    console.error('Error processing:', error.message);
  }
  
  res.status(200).end();
});

// API: Get all received messages (for monitoring)
app.get('/messages', (req, res) => {
  res.json({
    total: receivedMessages.length,
    messages: receivedMessages
  });
});

// API: Get latest message (for monitoring)
app.get('/latest', (req, res) => {
  const latest = receivedMessages[receivedMessages.length - 1];
  res.json({
    latestMessage: latest || 'No messages yet'
  });
});

// Start the server
app.listen(port, () => {
  console.log(`\nListening on port ${port}\n`);
});