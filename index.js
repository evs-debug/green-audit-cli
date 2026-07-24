const { analyzePage } = require('./src/analyze');
const { estimateCarbon, getGrade } = require('./src/carbon');
const { saveReports } = require('./src/report');

const args = process.argv.slice(2);
const url = args[0];
const shouldSave = args.includes('--save');

if (!url) {
  console.log('Usage: node index.js <url> [--save]');
  process.exit(1);
}

(async () => {
  console.log(`\n🔍 Auditing: ${url}\n`);
  const data = await analyzePage(url);
  const { energyKwh, carbonGrams } = estimateCarbon(data.totalBytes);
  const { grade, label } = getGrade(carbonGrams);

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
  console.log(data.domNodeCount > 1500 ? '⚠️  High DOM complexity (>1500 nodes)' : '✅ DOM complexity OK');

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

  if (shouldSave) {
    const { jsonPath, mdPath } = saveReports(data, energyKwh, carbonGrams, grade, label);
    console.log('\n' + '─'.repeat(50));
    console.log('💾 REPORTS SAVED');
    console.log('─'.repeat(50));
    console.log(`Markdown: ${mdPath}`);
    console.log(`JSON:     ${jsonPath}`);
  }

  console.log('\n✅ Audit complete.\n');
})();
