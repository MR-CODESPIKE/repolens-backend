const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const { PORT, ALLOWED_ORIGINS } = require('./config/env');
const analyzeRoute = require('./routes/analyze');
const jobsRoute = require('./routes/jobs');
const keysRoute = require('./routes/keys');

const app = express();

app.use(express.json({ limit: '1mb' }));

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow no-origin requests (curl, server-to-server, health checks)
      if (!origin || ALLOWED_ORIGINS.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
    credentials: false,
  })
);

// Basic protection against abuse on top of the per-user daily quota
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(globalLimiter);

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use('/api/analyze', analyzeRoute);
app.use('/api/jobs', jobsRoute);
app.use('/api/keys', keysRoute);

// Fallback error handler
app.use((err, req, res, next) => {
  console.error('[server] unhandled error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`[server] RepoLens backend listening on port ${PORT}`);
});
