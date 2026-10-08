const fs = require('fs');
const path = require('path');

const { analyzePage } = require('./analyze');
const { estimateCarbon, getGrade } = require('./carbon');
const { saveReports } = require('./report');
const { saveBatchReport, gradeNote } = require('./batchReport');
const { saveBatchHtmlReport } = require('./batchHtmlReport');
const { normalizeUrl } = require('./url');
const { loadCachedAnalysis, saveCachedAnalysis } = require('./cache');
const { checkAuditValidity } = require('./auditValidity');
const { measure, printRunProgress } = require('./collectRuns');
const { formatRange } = require('./aggregateRuns');

function parseInputFile(filePath) {
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new Error(`Input file not found: ${filePath}`);
    }
    if (err.code === 'EACCES') {
      throw new Error(`Permission denied reading input file: ${filePath}`);
    }
    if (err.code === 'EISDIR') {
      throw new Error(`Expected a file but got a directory: ${filePath}`);
    }
    throw new Error(`Could not read input file ${filePath}: ${err.message}`);
  }
  const ext = path.extname(filePath).toLowerCase();

  let lines = content
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#'));

  if (ext === '.csv') {
    lines = lines.map(l => l.split(',')[0].trim());
    if (lines[0] && /^urls?$/i.test(lines[0])) {
      lines.shift();
    }
  }

  return lines.filter(Boolean);
}

// `analyze` and `sleep` are injectable so tests can substitute fakes for
// puppeteer and the pause between runs. runs defaults to 1 here; the CLI
// passes its own default (see collectRuns.js).
async function auditOne(rawUrl, { analyze = analyzePage, runs = 1, sleep } = {}) {
  const normalizedUrl = normalizeUrl(rawUrl);

  let data = loadCachedAnalysis(normalizedUrl, undefined, { minRuns: runs });
  const fromCache = Boolean(data);
  if (!data) data = await measure(normalizedUrl, { runs, analyze, sleep, onRun: printRunProgress });

  const validity = checkAuditValidity(data);
  // Don't cache suspect audits: the next run should retry the live site
  // rather than replay a block page for the whole cache TTL.
  if (!fromCache && !validity.suspect) saveCachedAnalysis(normalizedUrl, data);

  const { energyKwh, carbonGrams } = estimateCarbon(data.totalBytes);
  const { grade, label } = getGrade(carbonGrams);

  if (validity.suspect) {
    console.log(`   ⚠️  Unverified result for ${normalizedUrl}: ${validity.reasons.join('; ')}`);
  } else if (validity.possiblyIncomplete) {
    console.log(`   ℹ️  Possibly incomplete: ${validity.reasons.join('; ')}`);
  }

  saveReports(data, energyKwh, carbonGrams, grade, label);

  return {
    url: normalizedUrl,
    finalUrl: data.finalUrl ?? null,
    mainDocumentStatus: data.mainDocumentStatus ?? null,
    grade,
    label,
    carbonGrams,
    totalKB: data.totalBytes / 1024,
    validity,
    runStats: data.runStats ?? null,
  };
}

function printComparisonTable(results) {
  console.log('\n' + '─'.repeat(70));
  console.log('🌍 BATCH AUDIT — COMPARISON');
  console.log('─'.repeat(70));

  results.forEach(r => {
    if (r.error) {
      console.log(`❌ ${r.url}  —  FAILED (${r.error})`);
    } else {
      const redirect = r.finalUrl && r.finalUrl !== r.url ? ` → ${r.finalUrl}` : '';
      console.log(
        `${r.url}  scored  ${r.grade}${gradeNote(r)}  ` +
        `(${r.carbonGrams.toFixed(3)}g CO2e, ${r.totalKB.toFixed(1)} KB${r.runStats ? `, range ${formatRange(r.runStats)}` : ''}, HTTP ${r.mainDocumentStatus ?? 'unknown'}${redirect})`
      );
    }
  });

  console.log('─'.repeat(70) + '\n');
}

async function runBatch(filePath, { analyze = analyzePage, runs = 1, sleep } = {}) {
  const urls = parseInputFile(filePath);

  if (urls.length === 0) {
    console.log('⚠️  No URLs found in input file.');
    return [];
  }

  console.log(`\n🔍 Running batch audit on ${urls.length} URL(s)${runs > 1 ? `, ${runs} runs each (median reported)` : ''}...\n`);

  const results = [];
  for (const rawUrl of urls) {
    try {
      console.log(`→ Auditing ${rawUrl}...`);
      const result = await auditOne(rawUrl, { analyze, runs, sleep });
      results.push(result);
    } catch (err) {
      console.log(`   ❌ Failed: ${err.message}`);
      results.push({ url: rawUrl, error: err.message });
    }
  }

  printComparisonTable(results);

  const { mdPath } = saveBatchReport(results);
  const htmlPath = saveBatchHtmlReport(results);
  console.log(`💾 Batch reports saved:`);
  console.log(`   Markdown: ${mdPath}`);
  console.log(`   HTML:     ${htmlPath}\n`);
  return results;
}

module.exports = { runBatch, auditOne, parseInputFile };