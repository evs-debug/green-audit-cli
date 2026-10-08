const fs = require('fs');
const path = require('path');
const { formatGradeNote, formatRange } = require('./aggregateRuns');

// Saves a single Markdown file summarizing an entire batch run — the
// per-URL results printed to the terminal by printComparisonTable(),
// but persisted so it can be cited/screenshotted later (e.g. in the
// final project report) instead of scrolling back through terminal history.

// Grade annotation shared by the terminal table and both batch reports,
// e.g. " (unverified)" or " (borderline: runs spanned B to C)".
function gradeNote(r) {
  return formatGradeNote(r.validity, r.runStats, { includeIncomplete: true });
}

// Splits results and computes the summary stats. Suspect audits are listed
// but excluded from average / greenest / heaviest, so a block page that
// "graded A" can't become the batch's greenest site. Possibly-incomplete
// audits stay in the stats, just annotated.
function summarizeBatch(results) {
  const succeeded = results.filter(r => !r.error);
  const failed = results.filter(r => r.error);
  const sorted = [...succeeded].sort((a, b) => a.carbonGrams - b.carbonGrams);
  const ranked = sorted.filter(r => !(r.validity && r.validity.suspect));
  const suspectCount = sorted.length - ranked.length;
  const avgCarbon = ranked.length
    ? ranked.reduce((sum, r) => sum + r.carbonGrams, 0) / ranked.length
    : null;
  return {
    succeeded, failed, sorted, ranked, suspectCount, avgCarbon,
    best: ranked[0] || null,
    worst: ranked[ranked.length - 1] || null,
  };
}

function statusText(r) {
  return r.mainDocumentStatus ?? 'unknown';
}

function finalUrlText(r) {
  return r.finalUrl && r.finalUrl !== r.url ? r.finalUrl : '';
}

function buildBatchMarkdown(results) {
  const lines = [];
  const timestamp = new Date().toISOString();
  const { succeeded, failed, sorted, ranked, suspectCount, avgCarbon, best, worst } = summarizeBatch(results);

  lines.push(`# Batch Audit Report`);
  lines.push(`**Date:** ${timestamp}`);
  lines.push(`**URLs audited:** ${results.length} (${succeeded.length} succeeded, ${failed.length} failed${suspectCount ? `, ${suspectCount} unverified` : ''})`);
  lines.push(``);

  if (succeeded.length > 0) {
    lines.push(`## Comparison`);
    lines.push(``);
    lines.push(`| URL | Grade | CO2e per view (g) | Page Weight (KB) | HTTP | Final URL | Range |`);
    lines.push(`|---|---|---|---|---|---|---|`);
    // Sort best grade first so the "greenest" site leads the table.
    sorted.forEach((r) => {
      lines.push(`| ${r.url} | ${r.grade}${gradeNote(r)} | ${r.carbonGrams.toFixed(3)} | ${r.totalKB.toFixed(1)} | ${statusText(r)} | ${finalUrlText(r)} | ${formatRange(r.runStats)} |`);
    });
    lines.push(``);

    lines.push(`## Summary`);
    if (ranked.length > 0) {
      lines.push(`- Average footprint: ${avgCarbon.toFixed(3)}g CO2e per view`);
      lines.push(`- Greenest: ${best.url} (${best.grade}${gradeNote(best)}, ${best.carbonGrams.toFixed(3)}g)`);
      lines.push(`- Heaviest: ${worst.url} (${worst.grade}${gradeNote(worst)}, ${worst.carbonGrams.toFixed(3)}g)`);
    } else {
      lines.push(`- No verified results to summarize.`);
    }
    if (suspectCount > 0) {
      lines.push(`- ${suspectCount} unverified result(s) excluded from these figures (likely a block or challenge page).`);
    }
    lines.push(``);

    const flagged = sorted.filter(r => r.validity && r.validity.reasons && r.validity.reasons.length);
    if (flagged.length > 0) {
      lines.push(`## Warnings`);
      lines.push(``);
      flagged.forEach((r) => {
        lines.push(`- ${r.url}${gradeNote(r)}: ${r.validity.reasons.join('; ')}`);
      });
      lines.push(``);
    }
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

module.exports = { saveBatchReport, buildBatchMarkdown, summarizeBatch, gradeNote };
