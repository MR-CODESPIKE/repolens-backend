const express = require('express');
const { analysisQueue } = require('../config/queue');

const router = express.Router();

router.get('/:id', async (req, res) => {
  try {
    const job = await analysisQueue.getJob(req.params.id);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const state = await job.getState();
    const progress = job.progress || 0;

    if (state === 'completed') {
      return res.json({ status: 'completed', progress: 100, result: job.returnvalue });
    }
    if (state === 'failed') {
      return res.json({ status: 'failed', progress, error: job.failedReason });
    }
    return res.json({ status: state, progress });
  } catch (err) {
    console.error('[jobs] error:', err);
    return res.status(500).json({ error: 'Failed to fetch job status' });
  }
});

module.exports = router;
