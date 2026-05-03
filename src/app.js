// Express App Configuration
const express = require('express');
const webhookRoutes = require('./routes/webhookRoutes');
const searchRoutes = require('./routes/searchRoutes');

const app = express();

// Middleware
app.use(express.json());

// Routes
app.use('/', webhookRoutes);
app.use('/', searchRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'Server is running' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;
