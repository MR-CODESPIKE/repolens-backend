/**
 * Main analysis prompt. Asks Gemini to return ONE structured JSON object
 * covering architecture, plain-English summary, and findings (bugs,
 * suspicious patterns, recommendations) in a single pass, since Gemini's
 * long context window lets us feed the whole repo at once.
 *
 * IMPORTANT: keep this schema stable - the Mermaid renderer, risk heatmap,
 * diff-aware re-analysis, and frontend all depend on this exact shape.
 */
function buildAnalysisPrompt(repoText, repoName) {
  return `You are a senior software architect reviewing a codebase called "${repoName}".
Analyze the following repository content and return ONLY a single JSON object
(no markdown fences, no prose before or after) matching EXACTLY this shape:

{
  "projectSummary": "2-3 sentence plain-English description of what this project does",
  "entryPoints": ["path/to/main/file.js"],
  "modules": [
    {
      "id": "short_unique_id",
      "name": "Human readable module/directory name",
      "path": "relative/path",
      "purpose": "one sentence plain-English purpose",
      "dependsOn": ["other_module_id"]
    }
  ],
  "connections": [
    { "from": "module_id", "to": "module_id", "label": "e.g. calls API, imports, reads from" }
  ],
  "findings": [
    {
      "type": "bug | security | recommendation",
      "severity": "low | medium | high | critical",
      "file": "relative/path",
      "lineHint": "approximate line number or function name if known",
      "title": "short title",
      "description": "plain-English explanation of the issue and why it matters"
    }
  ],
  "riskSignals": {
    "filesWithNoObviousTests": ["path"],
    "highComplexityFiles": ["path"],
    "suspiciousPatterns": [
      {
        "file": "path",
        "pattern": "e.g. dynamic code execution, obfuscated string, hardcoded credential, unexpected network call",
        "note": "plain-English explanation, framed as 'worth a human review', not a definitive verdict"
      }
    ]
  }
}

Guidelines:
- For "findings" of type "security": only flag things that are genuinely unusual or suspicious
  (obfuscated strings, eval/exec on external input, hardcoded secrets, unexpected outbound calls,
  auth bypass patterns). Do NOT invent issues if the code looks clean - it's fine to return an empty array.
- Frame security findings as things worth a human reviewing, not confirmed malicious code.
- Keep module count reasonable (group small files into their parent directory as one module where sensible).
- "dependsOn" and "connections" should reflect actual imports/calls you observe in the code, not guesses.

Repository content follows:
${repoText}`;
}

/**
 * Cheap follow-up call: turns the already-generated analysis JSON into a
 * step-by-step "guided tour" a senior dev might give a new hire.
 */
function buildTourPrompt(analysisJson) {
  return `Based on this codebase analysis JSON, write a step-by-step onboarding tour
for a new developer joining this project. Return ONLY JSON matching:

{
  "steps": [
    { "order": 1, "file": "path", "explanation": "what to look at here and why, in plain English" }
  ]
}

Order steps the way a senior engineer would walk a new hire through the codebase
(usually starting from entry points, then core logic, then supporting modules).

Analysis JSON:
${JSON.stringify(analysisJson)}`;
}

/**
 * Cheap follow-up call: generates likely interview questions about design
 * decisions in this codebase, based on the existing analysis.
 */
function buildInterviewPrompt(analysisJson) {
  return `Based on this codebase analysis JSON, generate 6-10 likely interview
questions a technical interviewer might ask about this project's design decisions,
architecture tradeoffs, and potential weak points. Return ONLY JSON matching:

{
  "questions": [
    { "question": "...", "whyItMatters": "one sentence on what this question is probing for" }
  ]
}

Analysis JSON:
${JSON.stringify(analysisJson)}`;
}

/**
 * Diff-aware re-analysis: instead of re-scanning everything, feed the
 * previous analysis JSON plus only the changed files' new content, and ask
 * Gemini to return an updated JSON plus a short changelog.
 */
function buildDiffPrompt(previousAnalysisJson, changedFilesText, repoName) {
  return `You previously analyzed the repository "${repoName}" and produced this JSON:
${JSON.stringify(previousAnalysisJson)}

The following files have changed since then (full new content shown):
${changedFilesText}

Return ONLY a single JSON object with this shape:

{
  "updatedAnalysis": { ...same shape as the original analysis JSON, fully updated ... },
  "changelog": [
    "plain-English bullet describing what changed and its architectural impact"
  ]
}

Only modify the parts of "updatedAnalysis" affected by these changes - keep everything
else consistent with the previous analysis unless the changes clearly invalidate it.`;
}

module.exports = { buildAnalysisPrompt, buildTourPrompt, buildInterviewPrompt, buildDiffPrompt };
