# RepoLens Backend

Express API + BullMQ worker that clones a public GitHub repo, analyzes it with
Gemini (architecture, plain-English summary, bugs, security/suspicious-pattern
flags, recommendations), and returns a Mermaid architecture diagram plus an
onboarding tour and interview-question set.

## Local setup

```bash
npm install
cp .env.example .env   # fill in REDIS_URL, GEMINI_API_KEY, ENCRYPTION_SECRET
npm run dev             # starts the API server
npm run worker          # in a second terminal, starts the job worker
```

You need a local or hosted Redis instance for the job queue, BYOK key storage,
and quota counters.

## API

- `POST /api/analyze` — body `{ "githubUrl": "https://github.com/owner/repo", "forceFullScan": false }`,
  header `X-Client-Id: <random-id>`. Returns `{ jobId, status: "queued" }`.
  If a previous scan of this exact repo exists (see Diff-aware re-analysis
  below), it automatically does a lighter diff-based scan unless
  `forceFullScan: true` is passed.
- `GET /api/jobs/:id` — poll for job status/progress/result.
- `POST /api/keys` — body `{ "apiKey": "..." }`, saves the client's own Gemini
  key (validated first, encrypted at rest).
- `GET /api/keys` — `{ hasKey: boolean }`.
- `DELETE /api/keys` — removes the stored key.

`X-Client-Id` is a random ID your frontend generates once and persists in
localStorage — no account system needed for BYOK/quota tracking.

## Deploying to Render

1. Push this repo to GitHub.
2. In Render, create a **Web Service** pointed at this repo (`npm start`) —
   or use the included `render.yaml` blueprint to create both services at once.
3. Create a **Background Worker** pointed at this repo (`npm run worker`).
4. Add a Redis instance (Render's Key Value add-on) and set `REDIS_URL` on
   both services.
5. Set `GEMINI_API_KEY` and `ENCRYPTION_SECRET` on both services.
6. Once your frontend is deployed to Vercel, add its URL to `ALLOWED_ORIGINS`
   on the web service and redeploy.

## Diff-aware re-analysis

Every completed scan's result is saved in Redis, fingerprinted by a
SHA-256 hash of each file's content (not git commit history, since repos are
cloned shallow with `--depth 1`). On the next scan of the same repo URL:

- If no snapshot exists (or it expired), a full scan runs as normal.
- If a snapshot exists, only files whose hash changed (or new/removed files)
  are sent to Gemini along with the previous analysis JSON, and Gemini returns
  an updated JSON plus a plain-English changelog.
- If nothing changed at all, the previous result is returned instantly with
  no Gemini call.

Snapshots expire after 30 days (`TTL_SECONDS` in `analysisStore.js`). Since
Render's Redis is treated as ephemeral here (no persistent DB), a lost/evicted
snapshot just means the next scan silently falls back to a full scan — nothing
breaks, it's just slightly slower that one time.

Pass `forceFullScan: true` in the `/api/analyze` request body to skip the
diff logic and force a full re-scan regardless of snapshot state.

## Notes

- Repo size is capped (`MAX_REPO_SIZE_MB`, default 250MB) to keep clone/analysis
  time reasonable on a small Render instance.
- Security findings are intentionally framed as "worth a human review," not
  definitive backdoor detection — no single LLM pass can reliably guarantee that.

## Ownership

- **Owner:** Abdulkadir umar
- **Hugging Face:** [MR-CODESPIKE](https://huggingface.co/MR-CODESPIKE)
