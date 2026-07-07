const express = require('express');
const { analysisQueue } = require('../config/queue');
const { checkQuota } = require('../services/quotaService');
const { hasKey } = require('../services/keyStore');

const router = express.Router();

const GITHUB_URL_RE = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/?$/;

router.post('/', async (req, res) => {
  try {
    const { githubUrl, forceFullScan } = req.body;
    const clientId = req.headers['x-client-id'];

    if (!clientId) {
      return res.status(400).json({ error: 'Missing X-Client-Id header' });
    }
    if (!githubUrl || !GITHUB_URL_RE.test(githubUrl)) {
      return res.status(400).json({ error: 'Provide a valid public GitHub repo URL, e.g. https://github.com/owner/repo' });
    }

    const usesOwnKey = await hasKey(clientId);

    if (!usesOwnKey) {
      const quota = await checkQuota(clientId);
      if (!quota.allowed) {
        return res.status(429).json({
          error: `Daily free limit reached (${quota.limit}/day). Add your own Gemini API key in settings for unlimited analyses.`,
          remaining: 0,
        });
      }
    }

    const job = await analysisQueue.add('analyze', {
      githubUrl,
      clientId,
      usesOwnKey,
      forceFullScan: Boolean(forceFullScan),
    });

    return res.status(202).json({ jobId: job.id, status: 'queued' });
  } catch (err) {
    console.error('[analyze] error:', err);
    return res.status(500).json({ error: 'Failed to queue analysis job' });
  }
});

module.exports = router;
