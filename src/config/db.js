const mongoose = require('mongoose');
const { MONGODB_URI } = require('./constants');

let isConnected = false;

const connectToDatabase = async () => {
  if (isConnected) return mongoose.connection;

  await mongoose.connect(MONGODB_URI);
  isConnected = true;
  console.log(`MongoDB connected: ${mongoose.connection.name}`);
  return mongoose.connection;
};

module.exports = {
  connectToDatabase
};
