// Express App Configuration
const express = require('express');
const webhookRoutes = require('./routes/webhookRoutes');
const searchRoutes = require('./routes/searchRoutes');

const app = express();

// Log ingress before parsing so malformed request bodies are visible too.
app.use((req, res, next) => {
  const startedAt = Date.now();
  console.log(`HTTP ${req.method} ${req.originalUrl} received`);
  res.on('finish', () => {
    console.log(`HTTP ${req.method} ${req.originalUrl} -> ${res.statusCode} (${Date.now() - startedAt}ms)`);
  });
  next();
});
app.use(express.json());

// Routes
app.use('/', webhookRoutes);
app.use('/webhook', webhookRoutes);
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
  console.error(`Request error for ${req.method} ${req.originalUrl}:`, err.message);
  res.status(err.status || 500).json({ error: 'Internal server error' });
});

module.exports = app;
