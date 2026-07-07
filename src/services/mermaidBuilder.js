// Sanitizes text for safe use inside Mermaid node labels (avoid breaking syntax
// on quotes, brackets, pipes, newlines).
function sanitizeLabel(text) {
  return String(text || '')
    .replace(/"/g, "'")
    .replace(/[\[\]{}|]/g, '')
    .replace(/\n/g, ' ')
    .slice(0, 80);
}

/**
 * Builds a Mermaid flowchart from the analysis JSON's modules + connections.
 * Renders directly in GitHub/VS Code/most markdown viewers - no extra
 * rendering infra needed on the frontend beyond the mermaid.js library.
 */
function buildMermaidDiagram(analysisJson) {
  const lines = ['graph TD'];

  const modules = analysisJson.modules || [];
  const connections = analysisJson.connections || [];
  const entryPoints = new Set(analysisJson.entryPoints || []);

  for (const mod of modules) {
    const label = sanitizeLabel(mod.name || mod.id);
    const isEntry = entryPoints.has(mod.path);
    const shape = isEntry ? `((${label}))` : `[${label}]`;
    lines.push(`  ${mod.id}${shape}`);
  }

  for (const conn of connections) {
    const label = conn.label ? `|${sanitizeLabel(conn.label)}|` : '';
    lines.push(`  ${conn.from} -->${label} ${conn.to}`);
  }

  // Highlight modules that have high-severity findings, so the diagram
  // doubles as a lightweight risk heatmap.
  const highRiskModuleIds = getHighRiskModuleIds(analysisJson);
  if (highRiskModuleIds.length) {
    lines.push(`  classDef highRisk fill:#ff6b6b,stroke:#c92a2a,color:#fff`);
    lines.push(`  class ${highRiskModuleIds.join(',')} highRisk`);
  }

  return lines.join('\n');
}

function getHighRiskModuleIds(analysisJson) {
  const findings = analysisJson.findings || [];
  const riskyFiles = new Set(
    findings
      .filter((f) => f.severity === 'high' || f.severity === 'critical')
      .map((f) => f.file)
  );
  const modules = analysisJson.modules || [];
  return modules.filter((m) => riskyFiles.has(m.path)).map((m) => m.id);
}

module.exports = { buildMermaidDiagram };
