const redis = require('../config/redis');
const { encrypt, decrypt, maskKey } = require('../utils/crypto');

const keyRedisKey = (clientId) => `byok:${clientId}`;

/**
 * Stores a user's personal Gemini API key, encrypted, keyed by their clientId
 * (a random ID generated client-side and persisted in browser storage —
 * no account system needed for this).
 */
async function saveKey(clientId, plainApiKey) {
  const encrypted = encrypt(plainApiKey);
  await redis.set(keyRedisKey(clientId), encrypted);
  return { saved: true, masked: maskKey(plainApiKey) };
}

async function getKey(clientId) {
  const encrypted = await redis.get(keyRedisKey(clientId));
  if (!encrypted) return null;
  try {
    return decrypt(encrypted);
  } catch (err) {
    console.error('[keyStore] failed to decrypt stored key for', clientId, err.message);
    return null;
  }
}

async function deleteKey(clientId) {
  await redis.del(keyRedisKey(clientId));
  return { deleted: true };
}

async function hasKey(clientId) {
  const exists = await redis.exists(keyRedisKey(clientId));
  return exists === 1;
}

module.exports = { saveKey, getKey, deleteKey, hasKey };
