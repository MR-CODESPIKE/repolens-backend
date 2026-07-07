const { Redis } = require('ioredis');
const { REDIS_URL } = require('./env');

// maxRetriesPerRequest: null is required by BullMQ's blocking connections
const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: null,
});

redis.on('error', (err) => {
  console.error('[redis] connection error:', err.message);
});

redis.on('connect', () => {
  console.log('[redis] connected');
});

module.exports = redis;
