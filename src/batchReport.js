const fs = require('fs');
const path = require('path');

// Saves a single Markdown file summarizing an entire batch run — the
// per-URL results printed to the terminal by printComparisonTable(),
// but persisted so it can be cited/screenshotted later (e.g. in the
// final project report) instead of scrolling back through terminal history.

function buildBatchMarkdown(results) {
  const lines = [];
  const timestamp = new Date().toISOString();
  const succeeded = results.filter(r => !r.error);
  const failed = results.filter(r => r.error);

  lines.push(`# Batch Audit Report`);
  lines.push(`**Date:** ${timestamp}`);
  lines.push(`**URLs audited:** ${results.length} (${succeeded.length} succeeded, ${failed.length} failed)`);
  lines.push(``);

  if (succeeded.length > 0) {
    lines.push(`## Comparison`);
    lines.push(``);
    lines.push(`| URL | Grade | CO2e per view (g) | Page Weight (KB) |`);
    lines.push(`|---|---|---|---|`);
    // Sort best grade first so the "greenest" site leads the table.
    const sorted = [...succeeded].sort((a, b) => a.carbonGrams - b.carbonGrams);
    sorted.forEach((r) => {
      lines.push(`| ${r.url} | ${r.grade} | ${r.carbonGrams.toFixed(3)} | ${r.totalKB.toFixed(1)} |`);
    });
    lines.push(``);

    const avgCarbon = succeeded.reduce((sum, r) => sum + r.carbonGrams, 0) / succeeded.length;
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];
    lines.push(`## Summary`);
    lines.push(`- Average footprint: ${avgCarbon.toFixed(3)}g CO2e per view`);
    lines.push(`- Greenest: ${best.url} (${best.grade}, ${best.carbonGrams.toFixed(3)}g)`);
    lines.push(`- Heaviest: ${worst.url} (${worst.grade}, ${worst.carbonGrams.toFixed(3)}g)`);
    lines.push(``);
  }

  if (failed.length > 0) {
    lines.push(`## Failed`);
    lines.push(``);
    failed.forEach((r) => {
      lines.push(`- ${r.url} — ${r.error}`);
    });
    lines.push(``);
  }

  return lines.join('\n');
}

function saveBatchReport(results) {
  const dir = path.join(process.cwd(), 'reports');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir);

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const mdPath = path.join(dir, `batch-${timestamp}.md`);

  fs.writeFileSync(mdPath, buildBatchMarkdown(results));

  return { mdPath };
}

module.exports = { saveBatchReport, buildBatchMarkdown };
