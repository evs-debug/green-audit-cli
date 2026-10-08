// Run: node test/reportValidity.test.js
// Checks that status / final URL / validity reach every report, and that
// batch mode handles suspect and failed audits honestly. A fake analyzer
// replaces puppeteer -- no browser, no network. Runs in a temp directory
// so reports and cache never touch the repo.
const assert = require('assert');
const fs = require('fs'), os = require('os'), path = require('path');

const { buildMarkdownReport } = require('../src/report');
const { generateReport } = require('../src/htmlReport');
const { buildBatchMarkdown, summarizeBatch, gradeNote } = require('../src/batchReport');
const { generateBatchReport } = require('../src/batchHtmlReport');
const { runBatch } = require('../src/batch');
const { normalizeUrl } = require('../src/url');
const { checkAuditValidity } = require('../src/auditValidity');

function makeData(overrides = {}) {
  return {
    url: 'https://example.com', finalUrl: 'https://example.com', mainDocumentStatus: 200,
    pageTitle: 'Example Domain', challengePhrase: null,
    byteMethod: 'cdp-encoded-v1', unfinishedRequests: 0, serviceWorkerResponses: 0,
    loadTime: 300, totalBytes: 2 * 1024 * 1024, scriptBytes: 0, imageBytes: 0,
    domNodeCount: 1200, scriptDuration: 0.1, jsHeapUsed: 1024 * 1024,
    topResources: [], resourceCount: 40, jsWaste: [],
    ...overrides,
  };
}

const ok = makeData({ url: 'https://ok.example', finalUrl: 'https://www.ok.example/home' });
const blocked = makeData({
  url: 'https://blocked.example', finalUrl: 'https://blocked.example',
  domNodeCount: 9, resourceCount: 10, totalBytes: 150 * 1024,
  pageTitle: 'Just a moment... <script>alert(1)</script>', challengePhrase: 'just a moment',
});
const incomplete = makeData({ url: 'https://thin.example', domNodeCount: 9, resourceCount: 8 });

// --- Markdown report: status, final URL, title, warnings ---
const mdOk = buildMarkdownReport(ok, 0.001, 0.7, 'B', 'Good — close to typical');
assert.match(mdOk, /\*\*Final URL:\*\* https:\/\/www\.ok\.example\/home/);
assert.match(mdOk, /\*\*HTTP status:\*\* 200/);
assert.match(mdOk, /\*\*Page title:\*\* Example Domain/);
assert.doesNotMatch(mdOk, /Unverified|Possibly incomplete/);

const mdBlocked = buildMarkdownReport(blocked, 0.0001, 0.05, 'A', 'Excellent');
assert.match(mdBlocked, /⚠️ \*\*Unverified result:\*\*.*just a moment/);
assert.match(mdBlocked, /## Green Score: A — Excellent \(unverified\)/);

assert.match(buildMarkdownReport(incomplete, 0, 0.7, 'B', 'Good'), /ℹ️ \*\*Possibly incomplete:\*\*/);

// Older cached data without the new fields still renders.
assert.match(buildMarkdownReport(makeData({ finalUrl: undefined, mainDocumentStatus: undefined }), 0, 0.7, 'B', 'Good'),
  /\*\*Final URL:\*\* unknown[\s\S]*\*\*HTTP status:\*\* unknown/);

// --- HTML report: banner only when flagged, page text escaped ---
const htmlOk = generateReport(ok, 0.001, 0.7, 'B', 'Good');
assert.doesNotMatch(htmlOk, /class="validity-banner/);
assert.match(htmlOk, /Analysis Complete/);
assert.match(htmlOk, /&rarr; <strong>https:\/\/www\.ok\.example\/home<\/strong> &middot; HTTP 200/);

const htmlBlocked = generateReport(blocked, 0.0001, 0.05, 'A', 'Excellent');
assert.match(htmlBlocked, /class="validity-banner suspect" role="alert"><strong>Unverified result\.<\/strong>/);
assert.match(htmlBlocked, /Unverified result<\/div>/);
assert.doesNotMatch(htmlBlocked, /Analysis Complete/);
assert.doesNotMatch(htmlBlocked, /<script>alert/);

assert.match(generateReport(incomplete, 0, 0.7, 'B', 'Good'), /class="validity-banner incomplete"/);

// --- Batch summary: suspect excluded from stats, annotated in table ---
const results = [
  { url: 'https://blocked.example', grade: 'A', carbonGrams: 0.05, totalKB: 150, mainDocumentStatus: 200, finalUrl: 'https://blocked.example', validity: checkAuditValidity(blocked) },
  { url: 'https://thin.example', grade: 'B', carbonGrams: 0.7, totalKB: 2048, mainDocumentStatus: 200, finalUrl: 'https://thin.example', validity: checkAuditValidity(incomplete) },
  { url: 'https://ok.example', grade: 'C', carbonGrams: 2.0, totalKB: 6000, mainDocumentStatus: 200, finalUrl: 'https://www.ok.example/home', validity: checkAuditValidity(ok) },
  { url: 'https://down.example', error: 'Page kept navigating while being measured (gave up after 3 attempts): boom' },
];

const summary = summarizeBatch(results);
assert.strictEqual(summary.suspectCount, 1);
assert.strictEqual(summary.best.url, 'https://thin.example', 'suspect A must not be "greenest"');
assert.strictEqual(summary.worst.url, 'https://ok.example');
assert.strictEqual(summary.avgCarbon, (0.7 + 2.0) / 2, 'possibly-incomplete stays in the average; suspect does not');
assert.strictEqual(gradeNote(results[0]), ' (unverified)');
assert.strictEqual(gradeNote(results[1]), ' (possibly incomplete)');
assert.strictEqual(gradeNote(results[2]), '');

const batchMd = buildBatchMarkdown(results);
assert.match(batchMd, /3 succeeded, 1 failed, 1 unverified/);
assert.match(batchMd, /\| https:\/\/blocked\.example \| A \(unverified\) \| 0\.050 \| 150\.0 \| 200 \|  \|/);
assert.match(batchMd, /\| https:\/\/thin\.example \| B \(possibly incomplete\) \|/);
assert.match(batchMd, /\| https:\/\/ok\.example \| C \| 2\.000 \| 6000\.0 \| 200 \| https:\/\/www\.ok\.example\/home \|/);
assert.match(batchMd, /Greenest: https:\/\/thin\.example \(B \(possibly incomplete\)/);
assert.match(batchMd, /1 unverified result\(s\) excluded/);
assert.match(batchMd, /## Failed\n\n- https:\/\/down\.example — Page kept navigating/);

const batchHtml = generateBatchReport(results);
assert.match(batchHtml, /<span class="grade-note">\(unverified\)<\/span>/);
assert.match(batchHtml, /<span class="grade-note">\(possibly incomplete\)<\/span>/);
assert.match(batchHtml, /Greenest<\/div>\s*<div class="value"[^>]*>B — https:\/\/thin\.example/);
assert.match(batchHtml, /1 unverified result excluded from these figures/);
assert.match(batchHtml, /Failed — Page kept navigating/);
assert.match(batchHtml, /<th>HTTP<\/th>/);

// All results suspect: no summary figures at all.
assert.match(buildBatchMarkdown([results[0]]), /No verified results to summarize/);
assert.match(generateBatchReport([results[0]]), /No verified results to summarize/);

// --- runBatch end to end with a fake analyzer ---
(async () => {
  const originalCwd = process.cwd();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ga-validity-'));
  const urlsFile = path.join(tmp, 'urls.txt');
  fs.writeFileSync(urlsFile, ['https://blocked.example', 'https://ok.example', 'https://down.example'].join('\n'));

  const fakeAnalyze = async (url) => {
    if (url === normalizeUrl('https://blocked.example')) return { ...blocked, url };
    if (url === normalizeUrl('https://ok.example')) return { ...ok, url };
    throw new Error('Page kept navigating while being measured (gave up after 3 attempts): Execution context was destroyed');
  };

  const log = console.log;
  let batchResults;
  process.chdir(tmp);
  try {
    console.log = () => {};
    batchResults = await runBatch(urlsFile, { analyze: fakeAnalyze });
  } finally {
    console.log = log;
    process.chdir(originalCwd);
  }

  // The failure is reported, not skipped.
  assert.strictEqual(batchResults.length, 3);
  const down = batchResults.find((r) => r.url === 'https://down.example');
  assert.match(down.error, /Page kept navigating/);

  const blockedResult = batchResults.find((r) => r.url === normalizeUrl('https://blocked.example'));
  assert.strictEqual(blockedResult.validity.suspect, true);
  assert.strictEqual(blockedResult.mainDocumentStatus, 200);

  // Suspect audits are not cached; verified ones are.
  const cache = JSON.parse(fs.readFileSync(path.join(tmp, 'reports', '.analysis-cache.json'), 'utf8'));
  assert.ok(cache[normalizeUrl('https://ok.example')], 'verified audit should be cached');
  assert.ok(!cache[normalizeUrl('https://blocked.example')], 'suspect audit must not be cached');

  // Per-URL JSON carries the validity verdict and the new fields.
  const blockedJson = fs.readdirSync(path.join(tmp, 'reports'))
    .filter((f) => f.startsWith('https-blocked-example') || f.startsWith('blocked-example'))
    .find((f) => f.endsWith('.json'));
  assert.ok(blockedJson, 'per-URL JSON report written');
  const saved = JSON.parse(fs.readFileSync(path.join(tmp, 'reports', blockedJson), 'utf8'));
  assert.strictEqual(saved.validity.suspect, true);
  assert.strictEqual(saved.data.mainDocumentStatus, 200);
  assert.strictEqual(saved.data.challengePhrase, 'just a moment');
  assert.ok(!('textSample' in saved.data), 'page text must not be stored');

  console.log('✅ report validity tests passed');
})().catch((err) => { console.error(err); process.exit(1); });
