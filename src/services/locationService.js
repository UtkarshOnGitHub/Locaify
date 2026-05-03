// Location Service
const { DEFAULT_LOCATION } = require('../config/constants');

/**
 * Get default location (India)
 * @returns {Object} Location object with country, timezone, coordinates
 */
const getLocation = () => {
  console.log('📍 Using default location: India');
  return DEFAULT_LOCATION;
};

module.exports = {
  getLocation
};
