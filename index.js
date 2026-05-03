// Main Entry Point
require('dotenv').config();
const app = require('./src/app');
const { PORT } = require('./src/config/constants');
const { connectToDatabase } = require('./src/config/db');
const { startTrackingCron } = require('./src/services/priceTrackerService');

// Start the server
const startServer = async () => {
  try {
    await connectToDatabase();
    startTrackingCron();

    app.listen(PORT, () => {
      console.log(`\n🚀 Server listening on port ${PORT}\n`);
      console.log('✅ Services initialized:');
      console.log('   - MongoDB');
      console.log('   - Price tracking cron');
      console.log(`✅ Available endpoints:`);
      console.log(`   GET  http://localhost:${PORT}/health`);
      console.log(`   GET  http://localhost:${PORT}/ (webhook verification)`);
      console.log(`   POST http://localhost:${PORT}/ (receive messages)`);
      console.log(`   GET  http://localhost:${PORT}/messages (all messages)`);
      console.log(`   GET  http://localhost:${PORT}/latest (latest message)`);
      console.log(`   GET  http://localhost:${PORT}/search?q=query (search)\n`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error.message);
    process.exit(1);
  }
};

startServer();