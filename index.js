require('dotenv').config();
const app = require('./src/app');
const { PORT } = require('./src/config/constants');
const { connectToDatabase } = require('./src/config/db');
const { startDealMonitoringCron } = require('./src/services/dealMonitorService');

const startServer = async () => {
  try {
    await connectToDatabase();
    startDealMonitoringCron();

    app.listen(PORT, () => {
      console.log(`\nServer listening on port ${PORT}\n`);
      console.log('Services initialized:');
      console.log('   - MongoDB');
      console.log('   - Game deal monitoring cron');
      console.log('Available endpoints:');
      console.log(`   GET  http://localhost:${PORT}/health`);
      console.log(`   GET  http://localhost:${PORT}/ (webhook verification)`);
      console.log(`   POST http://localhost:${PORT}/ (receive messages)`);
      console.log(`   GET  http://localhost:${PORT}/messages (all messages)`);
      console.log(`   GET  http://localhost:${PORT}/latest (latest message)`);
      console.log(`   GET  http://localhost:${PORT}/games?title=game-title (game search)`);
      console.log(`   GET  http://localhost:${PORT}/games?id=gameID (game deals)`);
      console.log(`   GET  http://localhost:${PORT}/stores (store metadata)`);
      console.log(`   GET  http://localhost:${PORT}/deals?id=dealID (deal details)`);
      console.log(`   GET  http://localhost:${PORT}/deals/run (manual deal monitor run)\n`);
    });
  } catch (error) {
    console.error('Failed to start server:', error.message);
    process.exit(1);
  }
};

startServer();
