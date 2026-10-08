// Run: node test/runsReport.test.js
// Median-of-N display in every report, and batch mode end to end with a
// fake analyzer and a fake sleep -- no browser, no network, no waiting.
// Runs in a temp directory so reports and cache never touch the repo.
const assert = require('assert');
const fs = require('fs'), os = require('os'), path = require('path');

const { DEFAULTS } = require('../src/config');
const { aggregateRuns } = require('../src/aggregateRuns');
const { buildMarkdownReport } = require('../src/report');
const { generateReport } = require('../src/htmlReport');
const { buildBatchMarkdown, gradeNote } = require('../src/batchReport');
const { generateBatchReport } = require('../src/batchHtmlReport');
const { checkAuditValidity } = require('../src/auditValidity');
const { runBatch } = require('../src/batch');
const { normalizeUrl } = require('../src/url');

const MB = 1024 * 1024;
function makeData(totalBytes, overrides = {}) {
  return {
    url: 'https://site.example', finalUrl: 'https://site.example', mainDocumentStatus: 200,
    pageTitle: 'Site', challengePhrase: null, byteMethod: 'cdp-encoded-v1',
    unfinishedRequests: 0, serviceWorkerResponses: 0,
    loadTime: 300, totalBytes, scriptBytes: 0, imageBytes: 0,
    domNodeCount: 1200, scriptDuration: 0.1, jsHeapUsed: MB,
    topResources: [], resourceCount: 40, jsWaste: [],
    ...overrides,
  };
}

// Median B (1.5 MB), lightest run A -> borderline A to B.
const borderline = aggregateRuns([1.3, 1.5, 1.6].map((mb) => ({ data: makeData(mb * MB) })), { cfg: DEFAULTS });
const steady = aggregateRuns([3.0, 2.9, 3.2].map((mb) => ({ data: makeData(mb * MB) })), { cfg: DEFAULTS });
const single = makeData(1.5 * MB);

// --- Markdown ---
const md = buildMarkdownReport(borderline, 0, 0.6, 'B', 'Good — close to typical');
assert.match(md, /## Green Score: B — Good — close to typical \(borderline: runs spanned A to B\)/);
assert.match(md, /- Runs: Median of 3 runs \(3 valid\): 1\.5 MB, range 1\.3 MB–1\.6 MB \(spread 20%\)/);
const mdSteady = buildMarkdownReport(steady, 0, 1.1, 'B', 'Good');
assert.match(mdSteady, /## Green Score: B — Good\n/, 'no note when every run agrees');
assert.match(mdSteady, /- Runs: Median of 3 runs \(3 valid\): 3\.0 MB, range 2\.9 MB–3\.2 MB \(spread 10%\)/, 'no N/M when every run counted');
const mdSingle = buildMarkdownReport(single, 0, 0.6, 'B', 'Good');
assert.doesNotMatch(mdSingle, /Runs:|borderline/, 'single-run report unchanged');

// --- HTML ---
const html = generateReport(borderline, 0, 0.6, 'B', 'Good');
assert.match(html, /Rating <span class="grade-note">\(borderline: runs spanned A to B\)<\/span><\/h2>/);
assert.match(html, /<p class="run-summary">Median of 3 runs \(3 valid\): 1\.5 MB, range 1\.3 MB–1\.6 MB \(spread 20%\)\.<\/p>/);
const htmlSingle = generateReport(single, 0, 0.6, 'B', 'Good');
assert.doesNotMatch(htmlSingle, /class="grade-note"|class="run-summary"/, 'single-run HTML unchanged');
// Unverified keeps its own badge; no borderline note alongside it.
const allBlocked = aggregateRuns([0.1, 0.2, 2.0].map((mb) => ({ data: makeData(mb * MB, { mainDocumentStatus: 403 }) })), { cfg: DEFAULTS });
const htmlBlocked = generateReport(allBlocked, 0, 0.05, 'A', 'Excellent');
assert.match(htmlBlocked, /Unverified result<\/div>/);
assert.doesNotMatch(htmlBlocked, /class="grade-note"/);

// --- Batch summary ---
const results = [
  { url: 'https://border.example', grade: 'B', carbonGrams: 0.53, totalKB: 1536, mainDocumentStatus: 200, finalUrl: 'https://border.example', validity: checkAuditValidity(borderline), runStats: borderline.runStats },
  { url: 'https://single.example', grade: 'B', carbonGrams: 0.53, totalKB: 1536, mainDocumentStatus: 200, finalUrl: 'https://single.example', validity: checkAuditValidity(single), runStats: null },
];
assert.strictEqual(gradeNote(results[0]), ' (borderline: runs spanned A to B)');
assert.strictEqual(gradeNote(results[1]), '');
const batchMd = buildBatchMarkdown(results);
assert.match(batchMd, /\| URL \| Grade \| CO2e per view \(g\) \| Page Weight \(KB\) \| HTTP \| Final URL \| Range \|/);
assert.match(batchMd, /\| https:\/\/border\.example \| B \(borderline: runs spanned A to B\) \| 0\.530 \| 1536\.0 \| 200 \|  \| 1\.3 MB–1\.6 MB \|/);
assert.match(batchMd, /\| https:\/\/single\.example \| B \| 0\.530 \| 1536\.0 \| 200 \|  \|  \|/);
const batchHtml = generateBatchReport(results);
assert.match(batchHtml, /<span class="grade-note">\(borderline: runs spanned A to B\)<\/span>/);
assert.match(batchHtml, /<th>Range<\/th>/);
assert.match(batchHtml, /<td>1\.3 MB–1\.6 MB<\/td>/);

// --- Batch end to end: median, cache of the aggregate, minRuns ---
(async () => {
  const originalCwd = process.cwd();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ga-runs-'));
  const urlsFile = path.join(tmp, 'urls.txt');
  fs.writeFileSync(urlsFile, ['https://bbc.example', 'https://flaky.example', 'https://down.example'].join('\n'));

  const calls = {};
  const sizes = { 'bbc.example': [3.3, 2.9, 3.8], 'flaky.example': [1.0, 1.2, 1.1] };
  const fakeAnalyze = async (url) => {
    const host = new URL(url).hostname;
    calls[host] = (calls[host] || 0) + 1;
    if (host === 'down.example') throw new Error('Could not load');
    // flaky.example serves a block page on its 2nd run.
    if (host === 'flaky.example' && calls[host] === 2) return makeData(0.1 * MB, { url, mainDocumentStatus: 429 });
    return makeData(sizes[host][(calls[host] - 1) % 3] * MB, { url, loadTime: calls[host] });
  };
  const sleeps = [];
  const sleep = async (ms) => { sleeps.push(ms); };

  const log = console.log;
  let first, second, third;
  process.chdir(tmp);
  try {
    console.log = () => {};
    first = await runBatch(urlsFile, { analyze: fakeAnalyze, runs: 3, sleep });
    second = await runBatch(urlsFile, { analyze: fakeAnalyze, runs: 3, sleep });
    third = await runBatch(urlsFile, { analyze: fakeAnalyze, runs: 5, sleep });
  } finally {
    console.log = log;
    process.chdir(originalCwd);
  }

  const byUrl = (list, u) => list.find((r) => r.url === normalizeUrl(u));

  // Median of 3 for bbc: 3.3 MB (run 1), range 2.9-3.8.
  const bbc = byUrl(first, 'https://bbc.example');
  assert.strictEqual(bbc.totalKB, 3.3 * 1024);
  assert.strictEqual(bbc.runStats.requested, 3);
  assert.strictEqual(bbc.runStats.medianRun, 1);
  assert.strictEqual(bbc.runStats.minBytes, 2.9 * MB);
  assert.strictEqual(bbc.runStats.maxBytes, 3.8 * MB);

  // Mid-sequence block page: excluded, result still verified.
  const flaky = byUrl(first, 'https://flaky.example');
  assert.strictEqual(flaky.validity.suspect, false);
  assert.strictEqual(flaky.runStats.valid, 2);
  assert.strictEqual(flaky.runStats.samples[1].status, 429);
  assert.strictEqual(flaky.runStats.samples[1].suspect, true);
  assert.strictEqual(flaky.totalKB, 1.1 * 1024, 'heavier of the two valid runs');
  // "N/M runs" in the batch summary when a run was excluded; not when all counted.
  const firstMd = buildBatchMarkdown(first);
  assert.match(firstMd, /\| https:\/\/flaky\.example \| A \| [^|]+ \| [^|]+ \| 200 \| [^|]* \| 1\.0 MB–1\.1 MB, 2\/3 runs \|/);
  assert.match(firstMd, /\| https:\/\/bbc\.example \| B \| [^|]+ \| [^|]+ \| 200 \| [^|]* \| 2\.9 MB–3\.8 MB \|/);
  assert.match(generateBatchReport(first), /<td>1\.0 MB–1\.1 MB, 2\/3 runs<\/td>/);
  // ...and in the single-URL reports and CLI summary line.
  const flakyData = { ...makeData(flaky.totalKB * 1024), runStats: flaky.runStats };
  assert.match(buildMarkdownReport(flakyData, 0, 0.4, 'A', 'Excellent'), /range 1\.0 MB–1\.1 MB, 2\/3 runs \(spread 9%\); 1 run excluded: looked like a block page/);
  assert.match(generateReport(flakyData, 0, 0.4, 'A', 'Excellent'), /<p class="run-summary">[^<]*range 1\.0 MB–1\.1 MB, 2\/3 runs/);

  // Every run failed -> reported as a failure, not skipped.
  const down = first.find((r) => r.url === 'https://down.example');
  assert.match(down.error, /All 3 run\(s\) failed: Could not load/);

  assert.strictEqual(calls['bbc.example'], 8, '3 runs, then a cache hit, then 5 more for --runs 5');

  // Second batch with --runs 3: served from the cached aggregate.
  assert.strictEqual(byUrl(second, 'https://bbc.example').runStats.requested, 3);
  // Third batch with --runs 5: cached 3-run entry is a miss, re-measured.
  assert.strictEqual(byUrl(third, 'https://bbc.example').runStats.requested, 5);
  // Pauses fall only between runs (N-1 per measured URL). Batch 1: 3 URLs x 2.
  // Batch 2: bbc and flaky are cache hits; down (never cached) x 2. Batch 3: 3 URLs x 4.
  assert.strictEqual(sleeps.length, 6 + 2 + 12);
  assert.ok(sleeps.every((ms) => ms === 2000));

  // The cache holds the aggregate (with runStats), not a single run.
  const cache = JSON.parse(fs.readFileSync(path.join(tmp, 'reports', '.analysis-cache.json'), 'utf8'));
  assert.strictEqual(cache[normalizeUrl('https://bbc.example')].data.runStats.requested, 5);
  assert.ok(Array.isArray(cache[normalizeUrl('https://bbc.example')].data.runStats.samples));

  console.log('✅ median-of-runs report tests passed');
})().catch((err) => { console.error(err); process.exit(1); });
