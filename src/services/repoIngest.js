const fs = require('fs');
const path = require('path');
const os = require('os');
const simpleGit = require('simple-git');
const { nanoid } = require('nanoid');
const { MAX_REPO_SIZE_MB } = require('../config/env');

// Directories/files we never want to feed to the model - build artifacts,
// dependency folders, binaries, lockfiles that add noise without insight.
const IGNORE_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', 'vendor',
  '__pycache__', '.venv', 'venv', 'target', '.cache', 'coverage',
]);

const IGNORE_FILE_PATTERNS = [
  /\.lock$/, /package-lock\.json$/, /yarn\.lock$/, /pnpm-lock\.yaml$/,
  /\.(png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot|mp4|mp3|zip|tar|gz|pdf)$/i,
  /\.min\.(js|css)$/,
];

const MAX_FILE_BYTES = 200 * 1024; // skip individual files over 200KB - usually generated/data files

function shouldIgnorePath(relativePath) {
  const parts = relativePath.split(path.sep);
  if (parts.some((p) => IGNORE_DIRS.has(p))) return true;
  if (IGNORE_FILE_PATTERNS.some((re) => re.test(relativePath))) return true;
  return false;
}

function walkDir(dir, baseDir, out = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(baseDir, fullPath);
    if (shouldIgnorePath(relativePath)) continue;

    if (entry.isDirectory()) {
      walkDir(fullPath, baseDir, out);
    } else if (entry.isFile()) {
      const stat = fs.statSync(fullPath);
      if (stat.size > MAX_FILE_BYTES) continue;
      out.push({ relativePath, fullPath, size: stat.size });
    }
  }
  return out;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Attempts the clone up to 3 times with a short delay between tries.
 * Shared cloud IPs (Railway, Render, etc.) can occasionally get
 * rate-limited or transiently blocked by GitHub's anonymous git protocol
 * endpoint, which can surface as a misleading "could not read Username"
 * credential error rather than a clear rate-limit message. Retrying with
 * a delay is the practical fix; logging the full raw error lets us confirm
 * whether that's really what's happening.
 */
async function cloneWithRetry(git, githubUrl, tmpDir, attempt = 1) {
  try {
    await git.clone(githubUrl, tmpDir, ['--depth', '1']);
  } catch (err) {
    console.error(`[repoIngest] clone attempt ${attempt} failed. Full error:`, err.message || err);

    if (attempt < 3) {
      const delay = attempt * 3000;
      console.warn(`[repoIngest] retrying clone in ${delay}ms (attempt ${attempt + 1}/3)`);
      await sleep(delay);
      return cloneWithRetry(git, githubUrl, tmpDir, attempt + 1);
    }
    throw new Error(`Failed to clone repo after 3 attempts. Last error: ${err.message || err}`);
  }
}

/**
 * Clones a public GitHub repo into a temp dir and returns a structured
 * file list + concatenated text content, ready to feed to Gemini.
 * Caller is responsible for calling cleanup() when done.
 */
async function ingestRepo(githubUrl) {
  const tmpDir = path.join(os.tmpdir(), `repolens-${nanoid(10)}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  // Force git to never attempt interactive credential prompts - containers
  // have no terminal to prompt in, so without this git can fail with
  // "could not read Username" even on plain public repos.
  const git = simpleGit({
    config: ['credential.helper='],
    allowUnsafeCredentialHelper: true,
  });
  process.env.GIT_TERMINAL_PROMPT = '0';

  await cloneWithRetry(git, githubUrl, tmpDir);

  const dirSizeMB = getDirSizeMB(tmpDir);
  if (dirSizeMB > MAX_REPO_SIZE_MB) {
    cleanup(tmpDir);
    throw new Error(`Repo is ${dirSizeMB.toFixed(0)}MB, exceeds ${MAX_REPO_SIZE_MB}MB limit`);
  }

  const files = walkDir(tmpDir, tmpDir);

  const fileContents = files.map((f) => {
    let content = '';
    try {
      content = fs.readFileSync(f.fullPath, 'utf8');
    } catch {
      content = '[binary or unreadable file, skipped]';
    }
    return { path: f.relativePath, content };
  });

  return { tmpDir, files: fileContents, fileCount: fileContents.length };
}

function getDirSizeMB(dir) {
  let total = 0;
  const walk = (d) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '.git') continue;
        walk(full);
      } else {
        total += fs.statSync(full).size;
      }
    }
  };
  walk(dir);
  return total / (1024 * 1024);
}

function cleanup(tmpDir) {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

/**
 * Builds a single text blob for Gemini, with clear file-path headers so the
 * model can reference specific files/lines in its findings.
 */
function buildRepoText(fileContents) {
  return fileContents
    .map((f) => `\n--- FILE: ${f.path} ---\n${f.content}`)
    .join('\n');
}

const crypto = require('crypto');

/**
 * Builds a { path: sha256hash } map of file contents. Used for diff-aware
 * re-analysis: instead of relying on git history (unreliable with shallow
 * clones), we just fingerprint content directly and compare against the
 * previous scan's fingerprints.
 */
function computeFileHashes(fileContents) {
  const hashes = {};
  for (const f of fileContents) {
    hashes[f.path] = crypto.createHash('sha256').update(f.content).digest('hex');
  }
  return hashes;
}

/**
 * Compares current file hashes against a previous snapshot's hashes.
 * Returns which paths were added, modified, or removed.
 */
function diffFileHashes(previousHashes, currentHashes) {
  const added = [];
  const modified = [];
  const removed = [];

  for (const path of Object.keys(currentHashes)) {
    if (!(path in previousHashes)) {
      added.push(path);
    } else if (previousHashes[path] !== currentHashes[path]) {
      modified.push(path);
    }
  }
  for (const path of Object.keys(previousHashes)) {
    if (!(path in currentHashes)) {
      removed.push(path);
    }
  }
  return { added, modified, removed };
}

module.exports = { ingestRepo, cleanup, buildRepoText, computeFileHashes, diffFileHashes };