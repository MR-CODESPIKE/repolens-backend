const redis = require('../config/redis');
const { FREE_DAILY_LIMIT } = require('../config/env');

const quotaKey = (clientId) => `quota:${clientId}:${new Date().toISOString().slice(0, 10)}`;

/**
 * Returns { allowed, remaining } without incrementing - used to check before
 * starting a job.
 */
async function checkQuota(clientId) {
  const used = parseInt((await redis.get(quotaKey(clientId))) || '0', 10);
  return {
    allowed: used < FREE_DAILY_LIMIT,
    remaining: Math.max(0, FREE_DAILY_LIMIT - used),
    limit: FREE_DAILY_LIMIT,
  };
}

/**
 * Increments today's usage counter. Sets a 24h TTL on first increment so it
 * naturally resets daily without a cron job.
 */
async function incrementUsage(clientId) {
  const key = quotaKey(clientId);
  const newCount = await redis.incr(key);
  if (newCount === 1) {
    await redis.expire(key, 60 * 60 * 24);
  }
  return newCount;
}

module.exports = { checkQuota, incrementUsage };
