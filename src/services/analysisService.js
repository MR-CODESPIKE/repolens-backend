const { ingestRepo, cleanup, buildRepoText, computeFileHashes, diffFileHashes } = require('./repoIngest');
const { generateJSON } = require('./geminiClient');
const {
  buildAnalysisPrompt,
  buildTourPrompt,
  buildInterviewPrompt,
  buildDiffPrompt,
} = require('./promptBuilder');
const { buildMermaidDiagram } = require('./mermaidBuilder');
const { getAnalysisSnapshot, saveAnalysisSnapshot } = require('./analysisStore');

function extractRepoName(githubUrl) {
  const match = githubUrl.match(/([^/]+)\/?$/);
  return match ? match[1].replace(/\.git$/, '') : 'repository';
}

async function generateExtras(analysisJson, apiKey) {
  const [tour, interview] = await Promise.all([
    generateJSON(buildTourPrompt(analysisJson), apiKey).catch(() => ({ steps: [] })),
    generateJSON(buildInterviewPrompt(analysisJson), apiKey).catch(() => ({ questions: [] })),
  ]);
  return { tour: tour.steps || [], interview: interview.questions || [] };
}

/**
 * Full pipeline for a repo scan. Automatically goes diff-aware if a previous
 * snapshot exists in Redis for this exact repo URL - only feeds Gemini the
 * files that actually changed (by content hash, not git history, so it
 * works fine with shallow clones). Falls back to a full scan if there's no
 * snapshot, the snapshot expired, or nothing changed since it doesn't need to.
 */
async function runFullAnalysis(githubUrl, apiKey, onProgress = () => {}, forceFullScan = false) {
  const repoName = extractRepoName(githubUrl);
  let tmpDir;

  try {
    onProgress('cloning', 10);
    const { files, tmpDir: dir, fileCount } = await ingestRepo(githubUrl);
    tmpDir = dir;

    const currentHashes = computeFileHashes(files);
    const previousSnapshot = forceFullScan ? null : await getAnalysisSnapshot(githubUrl);

    let analysisJson;
    let changelog = null;
    let isDiffScan = false;

    if (previousSnapshot) {
      const { added, modified, removed } = diffFileHashes(previousSnapshot.fileHashes, currentHashes);
      const changedPaths = new Set([...added, ...modified]);

      if (changedPaths.size === 0 && removed.length === 0) {
        // Nothing changed at all - reuse the previous result, no Gemini call needed
        onProgress('done', 100);
        return {
          ...previousSnapshot.fullResult,
          isDiffScan: true,
          noChangesDetected: true,
          changelog: ['No file changes detected since the last scan.'],
        };
      }

      onProgress('diffing', 30);
      isDiffScan = true;
      const changedFiles = files.filter((f) => changedPaths.has(f.path));
      const changedFilesText = buildRepoText(changedFiles);
      const removedNote = removed.length ? `\n\nFiles removed since last scan: ${removed.join(', ')}` : '';

      onProgress('analyzing', 50);
      const diffPrompt = buildDiffPrompt(previousSnapshot.analysisJson, changedFilesText + removedNote, repoName);
      const diffResult = await generateJSON(diffPrompt, apiKey);
      analysisJson = diffResult.updatedAnalysis;
      changelog = diffResult.changelog || [];
    } else {
      onProgress('analyzing', 40);
      const repoText = buildRepoText(files);
      analysisJson = await generateJSON(buildAnalysisPrompt(repoText, repoName), apiKey);
    }

    onProgress('rendering_diagram', 75);
    const mermaidDiagram = buildMermaidDiagram(analysisJson);

    onProgress('generating_extras', 90);
    const { tour, interview } = await generateExtras(analysisJson, apiKey);

    const fullResult = {
      repoName,
      repoUrl: githubUrl,
      fileCount,
      analysis: analysisJson,
      mermaidDiagram,
      onboardingTour: tour,
      interviewQuestions: interview,
      isDiffScan,
      changelog,
      generatedAt: new Date().toISOString(),
    };

    // Save snapshot for next time (best-effort - if this fails, the next
    // scan just falls back to a full analysis, nothing breaks)
    await saveAnalysisSnapshot(githubUrl, {
      fileHashes: currentHashes,
      analysisJson,
      mermaidDiagram,
      fullResult,
    }).catch((err) => console.error('[analysisService] failed to save snapshot:', err.message));

    onProgress('done', 100);
    return fullResult;
  } finally {
    if (tmpDir) cleanup(tmpDir);
  }
}

module.exports = { runFullAnalysis, extractRepoName };
