// Run: node test/aggregateRuns.test.js
// Fake audit results only -- no puppeteer, no network.
const assert = require('assert');
const { DEFAULTS } = require('../src/config');
const { aggregateRuns, formatRunSummary, formatRange, formatGradeNote } = require('../src/aggregateRuns');

const cfg = DEFAULTS; // A < 0.5 g (~1.43 MB), B < 1.5 g (~4.29 MB), C < 3.5 g
const MB = 1024 * 1024;

// A fake successful run. loadTime/domNodeCount are unique per run so we can
// tell which run the reported fields came from.
let seq = 0;
function run(totalBytes, extra = {}) {
  seq++;
  return {
    data: {
      url: 'https://site.example', totalBytes, resourceCount: 40, domNodeCount: 1000 + seq,
      loadTime: 100 * seq, mainDocumentStatus: 200, challengePhrase: null,
      topResources: [{ url: `https://site.example/r${seq}.js`, type: 'script', size: totalBytes }],
      ...extra,
    },
  };
}
const blocked = (totalBytes) => run(totalBytes, { mainDocumentStatus: 403 });
const failed = (error) => ({ error });

// --- Odd count: the middle run, and every field comes from that run ---
let runs = [run(3.0 * MB), run(2.9 * MB), run(3.7 * MB)];
let agg = aggregateRuns(runs, { requested: 3, cfg });
assert.strictEqual(agg.totalBytes, 3.0 * MB);
assert.strictEqual(agg.loadTime, runs[0].data.loadTime, 'fields come from the median run, not averaged');
assert.strictEqual(agg.domNodeCount, runs[0].data.domNodeCount);
assert.deepStrictEqual(agg.topResources, runs[0].data.topResources);
assert.strictEqual(agg.runStats.medianRun, 1);
assert.strictEqual(agg.runStats.minBytes, 2.9 * MB);
assert.strictEqual(agg.runStats.maxBytes, 3.7 * MB);
assert.ok(Math.abs(agg.runStats.spread - (0.8 / 3.0)) < 1e-9);
assert.strictEqual(agg.runStats.gradeMedian, 'B');
assert.strictEqual(agg.runStats.borderline, false);
assert.deepStrictEqual(
  { requested: agg.runStats.requested, succeeded: agg.runStats.succeeded, valid: agg.runStats.valid, failed: agg.runStats.failed },
  { requested: 3, succeeded: 3, valid: 3, failed: 0 }
);

// --- Compact per-run samples (JSON only) ---
assert.deepStrictEqual(agg.runStats.samples, [
  { run: 1, totalBytes: 3.0 * MB, resourceCount: 40, status: 200, suspect: false },
  { run: 2, totalBytes: 2.9 * MB, resourceCount: 40, status: 200, suspect: false },
  { run: 3, totalBytes: 3.7 * MB, resourceCount: 40, status: 200, suspect: false },
]);

// --- Borderline, downward: median B, lightest run A ---
agg = aggregateRuns([run(1.3 * MB), run(1.5 * MB), run(1.6 * MB)], { cfg });
assert.strictEqual(agg.runStats.gradeMedian, 'B');
assert.strictEqual(agg.runStats.gradeMin, 'A');
assert.strictEqual(agg.runStats.gradeMax, 'B');
assert.strictEqual(agg.runStats.borderline, true);
assert.strictEqual(formatGradeNote({ suspect: false }, agg.runStats), ' (borderline: runs spanned A to B)');

// --- Borderline, upward: median B, heaviest run C ---
agg = aggregateRuns([run(4.0 * MB), run(4.2 * MB), run(4.5 * MB)], { cfg });
assert.strictEqual(agg.runStats.gradeMedian, 'B');
assert.strictEqual(agg.runStats.gradeMax, 'C');
assert.strictEqual(agg.runStats.borderline, true);

// --- Suspect run excluded; even count -> heavier middle run ---
runs = [run(3.0 * MB), blocked(0.15 * MB), run(2.0 * MB)];
agg = aggregateRuns(runs, { requested: 3, cfg });
assert.strictEqual(agg.totalBytes, 3.0 * MB, 'with 2 valid runs, the heavier one is the median');
assert.strictEqual(agg.loadTime, runs[0].data.loadTime);
assert.strictEqual(agg.runStats.valid, 2);
assert.strictEqual(agg.runStats.succeeded, 3);
assert.strictEqual(agg.runStats.minBytes, 2.0 * MB, 'suspect run is not in the range');
assert.strictEqual(agg.runStats.samples[1].suspect, true);
assert.strictEqual(agg.runStats.samples[1].status, 403);
assert.strictEqual(agg.mainDocumentStatus, 200, 'result is not suspect when valid runs exist');

// Even count of 4 -> upper middle.
agg = aggregateRuns([run(1 * MB), run(4 * MB), run(2 * MB), run(3 * MB)], { cfg });
assert.strictEqual(agg.totalBytes, 3 * MB);

// --- Every run suspect: aggregate is suspect ---
agg = aggregateRuns([blocked(0.2 * MB), blocked(0.1 * MB), blocked(0.3 * MB)], { cfg });
assert.strictEqual(agg.mainDocumentStatus, 403);
assert.strictEqual(agg.totalBytes, 0.2 * MB);
assert.strictEqual(agg.runStats.valid, 0);
assert.strictEqual(formatGradeNote({ suspect: true }, agg.runStats), ' (unverified)', 'unverified wins over borderline');

// --- Failed runs recorded, audit continues ---
agg = aggregateRuns([failed('timeout'), run(2 * MB), run(3 * MB)], { requested: 3, cfg });
assert.strictEqual(agg.totalBytes, 3 * MB);
assert.strictEqual(agg.runStats.failed, 1);
assert.strictEqual(agg.runStats.succeeded, 2);
assert.deepStrictEqual(agg.runStats.samples[0], { run: 1, error: 'timeout' });

// --- Every run failed: the audit fails ---
assert.throws(
  () => aggregateRuns([failed('timeout'), failed('timeout'), failed('DNS error')], { cfg }),
  /^Error: All 3 run\(s\) failed: timeout \| DNS error$/
);

// --- Ties keep run order ---
runs = [run(2 * MB), run(2 * MB), run(2 * MB)];
agg = aggregateRuns(runs, { cfg });
assert.strictEqual(agg.runStats.medianRun, 2);
assert.strictEqual(agg.runStats.spread, 0);

// --- Single run through the aggregator still works ---
agg = aggregateRuns([run(1 * MB)], { cfg });
assert.strictEqual(agg.runStats.borderline, false);

// --- Text formatting ---
agg = aggregateRuns([run(3.0 * MB), blocked(0.15 * MB), failed('timeout'), run(2.9 * MB), run(3.7 * MB)], { requested: 5, cfg });
assert.strictEqual(formatRange(agg.runStats), '2.9 MB–3.7 MB, 3/5 runs');
assert.strictEqual(
  formatRunSummary(agg.runStats),
  'Median of 5 runs (3 valid): 3.0 MB, range 2.9 MB–3.7 MB, 3/5 runs (spread 27%); 1 run excluded: looked like a block page; 1 run failed'
);
assert.strictEqual(formatRunSummary(null), '');
// All runs counted: no "N/M runs".
assert.strictEqual(formatRange(aggregateRuns([run(2.9 * MB), run(3.7 * MB), run(3.0 * MB)], { cfg }).runStats), '2.9 MB–3.7 MB');
// A failed run alone, and a suspect run alone, each show the count.
assert.strictEqual(formatRange(aggregateRuns([run(2 * MB), failed('Timed out'), run(3 * MB)], { requested: 3, cfg }).runStats), '2.0 MB–3.0 MB, 2/3 runs');
assert.strictEqual(formatRange(aggregateRuns([run(2 * MB), blocked(MB), run(3 * MB)], { requested: 3, cfg }).runStats), '2.0 MB–3.0 MB, 2/3 runs');
assert.match(formatRange(aggregateRuns([blocked(1024), blocked(2048)], { requested: 2, cfg }).runStats), /, 0\/2 runs$/);
assert.strictEqual(formatRange(null), '');
assert.match(
  formatRunSummary(aggregateRuns([blocked(1024), blocked(2048)], { cfg }).runStats),
  /\(0 valid\).*all 2 successful runs looked like a block page/
);

// --- Grade note variants ---
const borderline = { borderline: true, gradeMin: 'B', gradeMax: 'C' };
assert.strictEqual(formatGradeNote(null, null), '');
assert.strictEqual(formatGradeNote({ suspect: false }, { borderline: false }), '');
assert.strictEqual(formatGradeNote({ possiblyIncomplete: true }, null), '', 'incomplete only shown when asked');
assert.strictEqual(formatGradeNote({ possiblyIncomplete: true }, null, { includeIncomplete: true }), ' (possibly incomplete)');
assert.strictEqual(
  formatGradeNote({ possiblyIncomplete: true }, borderline, { includeIncomplete: true }),
  ' (possibly incomplete; borderline: runs spanned B to C)'
);

console.log('✅ run aggregation tests passed');
