const { Worker } = require('bullmq');
const redis = require('../config/redis');
const { ANALYSIS_QUEUE_NAME } = require('../config/queue');
const { runFullAnalysis } = require('../services/analysisService');
const { getKey } = require('../services/keyStore');
const { incrementUsage } = require('../services/quotaService');

const worker = new Worker(
  ANALYSIS_QUEUE_NAME,
  async (job) => {
    const { githubUrl, clientId, usesOwnKey, forceFullScan } = job.data;

    const apiKey = usesOwnKey ? await getKey(clientId) : null; // null -> geminiClient falls back to shared key

    const result = await runFullAnalysis(
      githubUrl,
      apiKey,
      (stage, pct) => {
        job.updateProgress(pct);
        job.log(`[${stage}] ${pct}%`);
      },
      forceFullScan
    );

    if (!usesOwnKey) {
      await incrementUsage(clientId);
    }

    return result;
  },
  {
    connection: redis,
    concurrency: 2, // repo cloning + Gemini calls are heavy; keep concurrency modest on a small Render worker
  }
);

worker.on('completed', (job) => {
  console.log(`[worker] job ${job.id} completed`);
});

worker.on('failed', (job, err) => {
  console.error(`[worker] job ${job?.id} failed:`, err.message);
});

console.log('[worker] analysis worker started, waiting for jobs...');

module.exports = worker;
