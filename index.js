#!/usr/bin/env node
const { analyzePage } = require('./src/analyze');
const { estimateCarbon, getGrade } = require('./src/carbon');
const { saveReports } = require('./src/report');
const { normalizeUrl } = require('./src/url');
const { openReportInBrowser } = require('./src/openReport');
const { loadCachedAnalysis, saveCachedAnalysis } = require('./src/cache');
const { loadConfig, writeSampleConfig } = require('./src/config');        // Member 4
const { appendHistory, printHistory, clearHistory } = require('./src/history'); // Member 5
const { runBatch } = require('./src/batch');                              // Member 3 (batch CLI)

const args = process.argv.slice(2);

// ── Batch mode ──────────────────────────────────────────────────────────────
if (args[0] === 'batch') {
  const filePath = args[1];
  if (!filePath) {
    console.log('Usage: green-audit batch <file.txt|file.csv>');
    process.exit(1);
  }
  runBatch(filePath).catch(err => {
    console.error('\n❌ Batch audit failed:', err.message);
    process.exit(1);
  });
} else {

  // ── Utility commands (no audit) ────────────────────────────────────────────
  if (args.includes('--history')) {                       // Member 5
    const i = args.indexOf('--history');
    const filter = args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : undefined;
    printHistory({ url: filter });
    process.exit(0);
  }
  if (args.includes('--clear-history')) { clearHistory(); process.exit(0); }   // Member 5
  if (args.includes('--init-config')) { writeSampleConfig(); process.exit(0); } // Member 4
  if (args.includes('--show-config')) {                                         // Member 4
    console.log(JSON.stringify(loadConfig(), null, 2));
    process.exit(0);
  }

  const url = args.find((a) => !a.startsWith('--'));
  if (!url) {
    console.log('Usage: node index.js <url> [--no-history] [--no-open]');
    console.log('       node index.js batch <file.txt|file.csv>');
    console.log('       node index.js --history [urlFilter]');
    console.log('       node index.js --clear-history');
    console.log('       node index.js --init-config | --show-config');
    process.exit(1);
  }

  (async () => {
    try {
      const cfg = loadConfig();                                             // Member 4
      if (cfg._source !== 'defaults') console.log(`⚙️  Using config: ${cfg._source}`);

      const normalizedUrl = normalizeUrl(url);
      console.log(`\n🔍 Auditing: ${normalizedUrl}\n`);
      let fromCache = false;
      let data = loadCachedAnalysis(normalizedUrl);
      if (!data) {
        data = await analyzePage(normalizedUrl);
        saveCachedAnalysis(normalizedUrl, data);
      } else {
        fromCache = true;
        console.log('📦 Using cached analysis snapshot for this URL.');
      }
      const { energyKwh, carbonGrams } = estimateCarbon(data.totalBytes, cfg);
      const { grade, label } = getGrade(carbonGrams, cfg);
      console.log('─'.repeat(50));
      console.log('📦 PAGE WEIGHT');
      console.log('─'.repeat(50));
      console.log(`Total transferred: ${(data.totalBytes / 1024).toFixed(1)} KB`);
      console.log(`  JS:     ${(data.scriptBytes / 1024).toFixed(1)} KB`);
      console.log(`  Images: ${(data.imageBytes / 1024).toFixed(1)} KB`);
      console.log(`Requests: ${data.resourceCount}`);
      console.log(`Load time: ${data.loadTime} ms`);
      console.log('\n' + '─'.repeat(50));
      console.log('🧬 DOM COMPLEXITY');
      console.log('─'.repeat(50));
      console.log(`DOM nodes: ${data.domNodeCount}`);
      const domLimit = cfg.dom.highComplexityNodes;                          // Member 4
      console.log(data.domNodeCount > domLimit ? `⚠️  High DOM complexity (>${domLimit} nodes)` : '✅ DOM complexity OK');
      console.log('\n' + '─'.repeat(50));
      console.log('⚙️  JS EXECUTION');
      console.log('─'.repeat(50));
      console.log(`Script duration: ${(data.scriptDuration * 1000).toFixed(0)} ms`);
      console.log(`JS heap used: ${(data.jsHeapUsed / 1024 / 1024).toFixed(2)} MB`);
      console.log('\n' + '─'.repeat(50));
      console.log('♻️  UNUSED JAVASCRIPT (dead code waste)');
      console.log('─'.repeat(50));
      if (data.jsWaste.length === 0) {
        console.log('No significant unused JS detected.');
      } else {
        data.jsWaste.forEach((f, i) => {
          console.log(`${i + 1}. ${f.unusedPercent.toFixed(1)}% unused (${(f.unusedBytes / 1024).toFixed(1)} KB wasted) — ${f.url.slice(0, 70)}`);
        });
      }
      console.log('\n' + '─'.repeat(50));
      console.log('🌍 ESTIMATED CARBON FOOTPRINT');
      console.log('─'.repeat(50));
      console.log(`Energy per view: ${(energyKwh * 1000).toFixed(4)} Wh`);
      console.log(`CO2e per view: ${carbonGrams.toFixed(3)} g`);
      console.log(`\n  🏆 GREEN SCORE: ${grade}  (${label})`);
      console.log('\n' + '─'.repeat(50));
      console.log('🚨 TOP GREEN BOTTLENECKS (largest assets)');
      console.log('─'.repeat(50));
      data.topResources.forEach((r, i) => {
        console.log(`${i + 1}. [${r.type}] ${(r.size / 1024).toFixed(1)} KB — ${r.url.slice(0, 80)}`);
      });
      const { jsonPath, mdPath, htmlPath } = saveReports(data, energyKwh, carbonGrams, grade, label);
      console.log('\n' + '─'.repeat(50));
      console.log('💾 REPORTS SAVED');
      console.log('─'.repeat(50));
      console.log(`HTML:     ${htmlPath}`);
      console.log(`Markdown: ${mdPath}`);
      console.log(`JSON:     ${jsonPath}`);

      if (!args.includes('--no-history')) {                                 // Member 5
        const historyPath = appendHistory(normalizedUrl, data, carbonGrams, grade, fromCache);
        console.log(`History:  ${historyPath}  (view with: node index.js --history)`);
      }

      if (!args.includes('--no-open')) openReportInBrowser(htmlPath);
      console.log('\n✅ Audit complete.\n');
    } catch (error) {
      console.error('\n❌ Audit failed:', error.message);
      process.exit(1);
    }
  })();
}
