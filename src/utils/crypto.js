const crypto = require('crypto');
const { ENCRYPTION_SECRET } = require('../config/env');

const ALGORITHM = 'aes-256-gcm';

// Derive a consistent 32-byte key from the secret env var (so the raw secret
// can be any length/passphrase, not just exactly 32 bytes).
function getKey() {
  return crypto.createHash('sha256').update(String(ENCRYPTION_SECRET)).digest();
}

/**
 * Encrypts a plaintext string (e.g. a user's personal Gemini API key).
 * Returns a single string combining iv, authTag, and ciphertext (base64),
 * safe to store in a DB column.
 */
function encrypt(plaintext) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString('base64'), authTag.toString('base64'), encrypted.toString('base64')].join(':');
}

/**
 * Decrypts a string produced by encrypt(). Throws if tampered or wrong key.
 */
function decrypt(payload) {
  const [ivB64, tagB64, dataB64] = String(payload).split(':');
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error('Malformed encrypted payload');
  }
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(tagB64, 'base64');
  const data = Buffer.from(dataB64, 'base64');

  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return decrypted.toString('utf8');
}

// Never log a raw API key. Use this to build safe display values like "AIza...9f2k"
function maskKey(key) {
  if (!key || key.length < 8) return '****';
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

module.exports = { encrypt, decrypt, maskKey };
