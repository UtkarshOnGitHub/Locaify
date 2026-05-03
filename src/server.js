// Server Entry Point
require('dotenv').config();
const app = require('./app');
const { PORT } = require('./config/constants');

// Start the server
app.listen(PORT, () => {
  console.log(`\n🚀 Server listening on port ${PORT}\n`);
  console.log(`✅ Available endpoints:`);
  console.log(`   GET  http://localhost:${PORT}/health`);
  console.log(`   GET  http://localhost:${PORT}/ (webhook verification)`);
  console.log(`   POST http://localhost:${PORT}/ (receive messages)`);
  console.log(`   GET  http://localhost:${PORT}/messages (all messages)`);
  console.log(`   GET  http://localhost:${PORT}/latest (latest message)`);
  console.log(`   GET  http://localhost:${PORT}/search?q=query (search)\n`);
});
