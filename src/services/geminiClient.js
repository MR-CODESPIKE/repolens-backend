const { GoogleGenerativeAI } = require('@google/generative-ai');
const { GEMINI_API_KEY, GEMINI_MODEL } = require('../config/env');

/**
 * Returns a Gemini model instance. Pass a personal (BYOK) key to use the
 * user's own quota instead of the shared default key.
 */
function getModel(apiKey) {
  const key = apiKey || GEMINI_API_KEY;
  const genAI = new GoogleGenerativeAI(key);
  return genAI.getGenerativeModel({
    model: GEMINI_MODEL,
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.2,
    },
  });
}

/**
 * Quick validation call used when a user pastes a new BYOK key in settings,
 * so we can confirm it works before saving it.
 */
async function pingKey(apiKey) {
  try {
    const model = getModel(apiKey);
    const result = await model.generateContent('Reply with the single word: ok');
    const text = result.response.text();
    return { valid: true, sample: text.slice(0, 20) };
  } catch (err) {
    return { valid: false, error: err.message };
  }
}

/**
 * Sends a prompt expecting structured JSON back. Caller is responsible for
 * knowing the expected shape; this just handles the API call + JSON parse.
 */
async function generateJSON(prompt, apiKey) {
  const model = getModel(apiKey);
  const result = await model.generateContent(prompt);
  const text = result.response.text();
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`Gemini returned invalid JSON: ${err.message}`);
  }
}

module.exports = { getModel, pingKey, generateJSON };
