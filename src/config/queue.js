const { Queue } = require('bullmq');
const redis = require('./redis');

const ANALYSIS_QUEUE_NAME = 'repo-analysis';

const analysisQueue = new Queue(ANALYSIS_QUEUE_NAME, {
  connection: redis,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { age: 60 * 60 * 24 }, // keep completed jobs 24h for polling/debugging
    removeOnFail: { age: 60 * 60 * 24 * 3 },
  },
});

module.exports = { analysisQueue, ANALYSIS_QUEUE_NAME };
