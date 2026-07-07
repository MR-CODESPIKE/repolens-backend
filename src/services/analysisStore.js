const crypto = require('crypto');
const redis = require('../config/redis');

const TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days - old scans just expire and fall back to a full re-scan

function repoKey(githubUrl) {
  const hash = crypto.createHash('sha256').update(githubUrl.toLowerCase().trim()).digest('hex').slice(0, 16);
  return `analysis:${hash}`;
}

/**
 * Saves the latest analysis result + a content-hash fingerprint of every
 * file it was generated from, so a future scan can detect exactly which
 * files changed (works fine with shallow clones, no git history needed).
 */
async function saveAnalysisSnapshot(githubUrl, { fileHashes, analysisJson, mermaidDiagram, fullResult }) {
  const payload = JSON.stringify({ fileHashes, analysisJson, mermaidDiagram, fullResult, savedAt: Date.now() });
  await redis.set(repoKey(githubUrl), payload, 'EX', TTL_SECONDS);
}

/**
 * Returns the previous snapshot for this repo, or null if none exists /
 * expired (Redis being in-memory/temporary on Render means this naturally
 * and safely falls back to a full re-scan - no diff-aware logic breaks).
 */
async function getAnalysisSnapshot(githubUrl) {
  const raw = await redis.get(repoKey(githubUrl));
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

module.exports = { saveAnalysisSnapshot, getAnalysisSnapshot };
