const fs = require('fs');
const path = require('path');

const { analyzePage } = require('./analyze');
const { estimateCarbon, getGrade } = require('./carbon');
const { saveReports } = require('./report');
const { saveBatchReport } = require('./batchReport');
const { saveBatchHtmlReport } = require('./batchHtmlReport');
const { normalizeUrl } = require('./url');
const { loadCachedAnalysis, saveCachedAnalysis } = require('./cache');

function parseInputFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
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

async function auditOne(rawUrl) {
  const normalizedUrl = normalizeUrl(rawUrl);

  let data = loadCachedAnalysis(normalizedUrl);
  if (!data) {
    data = await analyzePage(normalizedUrl);
    saveCachedAnalysis(normalizedUrl, data);
  }

  const { energyKwh, carbonGrams } = estimateCarbon(data.totalBytes);
  const { grade, label } = getGrade(carbonGrams);

  saveReports(data, energyKwh, carbonGrams, grade, label);

  return {
    url: normalizedUrl,
    grade,
    label,
    carbonGrams,
    totalKB: data.totalBytes / 1024,
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
      console.log(
        `${r.url}  scored  ${r.grade}  ` +
        `(${r.carbonGrams.toFixed(3)}g CO2e, ${r.totalKB.toFixed(1)} KB)`
      );
    }
  });

  console.log('─'.repeat(70) + '\n');
}

async function runBatch(filePath) {
  const urls = parseInputFile(filePath);

  if (urls.length === 0) {
    console.log('⚠️  No URLs found in input file.');
    return [];
  }

  console.log(`\n🔍 Running batch audit on ${urls.length} URL(s)...\n`);

  const results = [];
  for (const rawUrl of urls) {
    try {
      console.log(`→ Auditing ${rawUrl}...`);
      const result = await auditOne(rawUrl);
      results.push(result);
    } catch (err) {
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

module.exports = { runBatch, parseInputFile };