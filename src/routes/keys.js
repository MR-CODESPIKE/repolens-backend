const express = require('express');
const { saveKey, deleteKey, hasKey } = require('../services/keyStore');
const { pingKey } = require('../services/geminiClient');

const router = express.Router();

function getClientId(req, res) {
  const clientId = req.headers['x-client-id'];
  if (!clientId) {
    res.status(400).json({ error: 'Missing X-Client-Id header' });
    return null;
  }
  return clientId;
}

// Save (or replace) the user's personal Gemini API key, after validating it works
router.post('/', async (req, res) => {
  const clientId = getClientId(req, res);
  if (!clientId) return;

  const { apiKey } = req.body;
  if (!apiKey || typeof apiKey !== 'string' || apiKey.length < 10) {
    return res.status(400).json({ error: 'Provide a valid Gemini API key' });
  }

  const validation = await pingKey(apiKey);
  if (!validation.valid) {
    return res.status(400).json({ error: `Key validation failed: ${validation.error}` });
  }

  const result = await saveKey(clientId, apiKey);
  return res.json({ saved: true, masked: result.masked });
});

// Check whether this client has a key saved (never returns the actual key)
router.get('/', async (req, res) => {
  const clientId = getClientId(req, res);
  if (!clientId) return;

  const exists = await hasKey(clientId);
  return res.json({ hasKey: exists });
});

router.delete('/', async (req, res) => {
  const clientId = getClientId(req, res);
  if (!clientId) return;

  await deleteKey(clientId);
  return res.json({ deleted: true });
});

module.exports = router;
