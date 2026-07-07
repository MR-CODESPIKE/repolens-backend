require('dotenv').config();

function required(name, fallback) {
  const val = process.env[name] ?? fallback;
  if (val === undefined) {
    console.warn(`[config] Missing env var: ${name}`);
  }
  return val;
}

module.exports = {
  PORT: process.env.PORT || 4000,
  REDIS_URL: required('REDIS_URL'),
  GEMINI_API_KEY: required('GEMINI_API_KEY'), // shared/default key for free-tier users
  ENCRYPTION_SECRET: required('ENCRYPTION_SECRET'), // 32-byte key for AES-256, used to encrypt user BYOK keys at rest
  ALLOWED_ORIGINS: (process.env.ALLOWED_ORIGINS || 'http://localhost:3000')
    .split(',')
    .map((s) => s.trim()),
  FREE_DAILY_LIMIT: parseInt(process.env.FREE_DAILY_LIMIT || '5', 10),
  GEMINI_MODEL: process.env.GEMINI_MODEL || 'gemini-2.0-flash-exp',
  MAX_REPO_SIZE_MB: parseInt(process.env.MAX_REPO_SIZE_MB || '250', 10),
};
