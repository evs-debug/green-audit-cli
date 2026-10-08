// src/aggregateRuns.js
//
// Combines several audits of the same URL into one result: the median run.
// Pure (no puppeteer, no network), so it can be unit-tested with fake runs.
//
// Rules:
//   - Failed runs are recorded and skipped; if none succeeded, throw.
//   - Runs flagged suspect (auditValidity.js) are left out of the median.
//     If every successful run is suspect, all of them are used, and the
//     result stays suspect because the chosen run is.
//   - The median is always one real run: the middle run by totalBytes, or
//     the heavier of the two middle runs for an even count. Every reported
//     field (topResources, DOM count, load time...) comes from that run, so
//     the report stays internally consistent. Nothing is averaged.
//   - Grade and carbon come from the median run's totalBytes via the
//     existing carbon functions; the grades at min and max decide whether
//     the result is "borderline".

const { checkAuditValidity } = require('./auditValidity');
const { estimateCarbon, getGrade } = require('./carbon');

function gradeFor(totalBytes, cfg) {
  return getGrade(estimateCarbon(totalBytes, cfg).carbonGrams, cfg).grade;
}

/**
 * @param {({ data: object } | { error: string })[]} runs  in run order
 * @param {{ requested?: number, cfg?: object }} [opts]
 * @returns {object} the median run's data plus a `runStats` summary
 */
function aggregateRuns(runs, { requested = runs.length, cfg } = {}) {
  const samples = runs.map((r, i) => (r.data
    ? {
      run: i + 1,
      totalBytes: r.data.totalBytes,
      resourceCount: r.data.resourceCount,
      status: r.data.mainDocumentStatus ?? null,
      suspect: checkAuditValidity(r.data).suspect,
    }
    : { run: i + 1, error: String(r.error) }));

  const succeeded = runs
    .map((r, index) => ({ data: r.data, index }))
    .filter((r) => r.data);
  if (succeeded.length === 0) {
    const errors = [...new Set(samples.map((s) => s.error))];
    throw new Error(`All ${runs.length} run(s) failed: ${errors.join(' | ')}`);
  }

  const valid = succeeded.filter((r) => !samples[r.index].suspect);
  const counted = valid.length ? valid : succeeded;
  // Stable on ties: equal totalBytes keep run order.
  const sorted = [...counted].sort((a, b) => a.data.totalBytes - b.data.totalBytes || a.index - b.index);
  // Odd count: the middle run. Even count: the heavier middle run, so the
  // median is a real measurement and errs against overstating greenness.
  const median = sorted[Math.floor(sorted.length / 2)];

  const medianBytes = median.data.totalBytes;
  const minBytes = sorted[0].data.totalBytes;
  const maxBytes = sorted[sorted.length - 1].data.totalBytes;
  const gradeMedian = gradeFor(medianBytes, cfg);
  const gradeMin = gradeFor(minBytes, cfg);
  const gradeMax = gradeFor(maxBytes, cfg);

  return {
    ...median.data,
    runStats: {
      requested,
      succeeded: succeeded.length,
      valid: valid.length,
      failed: runs.length - succeeded.length,
      medianRun: median.index + 1,
      medianBytes,
      minBytes,
      maxBytes,
      spread: medianBytes > 0 ? (maxBytes - minBytes) / medianBytes : 0,
      gradeMedian,
      gradeMin,
      gradeMax,
      borderline: gradeMin !== gradeMedian || gradeMax !== gradeMedian,
      samples,
    },
  };
}

function formatBytes(bytes) {
  const kb = bytes / 1024;
  return kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb.toFixed(0)} KB`;
}

/**
 * e.g. "2.9 MB–3.7 MB", or "2.9 MB–3.7 MB, 4/5 runs" when any run failed or
 * was excluded as suspect; '' for single-run results.
 */
function formatRange(runStats) {
  if (!runStats) return '';
  const range = `${formatBytes(runStats.minBytes)}–${formatBytes(runStats.maxBytes)}`;
  return runStats.valid < runStats.requested
    ? `${range}, ${runStats.valid}/${runStats.requested} runs`
    : range;
}

/**
 * e.g. "Median of 3 runs (2 valid): 3.2 MB, range 2.9–3.7 MB (spread 27%); 1 run excluded: looked like a block page"
 * '' for single-run results.
 */
function formatRunSummary(runStats) {
  if (!runStats) return '';
  const s = runStats;
  let text = `Median of ${s.requested} runs (${s.valid} valid): ${formatBytes(s.medianBytes)}, ` +
    `range ${formatRange(s)} (spread ${Math.round(s.spread * 100)}%)`;
  const blocked = s.succeeded - s.valid;
  if (s.valid === 0) {
    text += `; all ${s.succeeded} successful run${s.succeeded === 1 ? '' : 's'} looked like a block page`;
  } else if (blocked > 0) {
    text += `; ${blocked} run${blocked === 1 ? '' : 's'} excluded: looked like a block page`;
  }
  if (s.failed > 0) text += `; ${s.failed} run${s.failed === 1 ? '' : 's'} failed`;
  return text;
}

/**
 * Grade annotation, e.g. " (unverified)" or " (borderline: runs spanned B to C)".
 * "Unverified" wins over everything. includeIncomplete adds "possibly
 * incomplete" (the batch summary shows it next to the grade; single-URL
 * reports already have their own line for it).
 */
function formatGradeNote(validity, runStats, { includeIncomplete = false } = {}) {
  if (validity && validity.suspect) return ' (unverified)';
  const parts = [];
  if (includeIncomplete && validity && validity.possiblyIncomplete) parts.push('possibly incomplete');
  if (runStats && runStats.borderline) parts.push(`borderline: runs spanned ${runStats.gradeMin} to ${runStats.gradeMax}`);
  return parts.length ? ` (${parts.join('; ')})` : '';
}

module.exports = { aggregateRuns, formatRunSummary, formatRange, formatGradeNote };
