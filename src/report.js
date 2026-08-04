const fs = require('fs');
const path = require('path');
const { saveHtmlReport } = require('./htmlReport');

function buildMarkdownReport(data, energyKwh, carbonGrams, grade, label) {
  const lines = [];
  lines.push(`# Green Audit Report`);
  lines.push(`**URL:** ${data.url}`);
  lines.push(`**Date:** ${new Date().toISOString()}`);
  lines.push(``);
  lines.push(`## Green Score: ${grade} — ${label}`);
  lines.push(``);
  lines.push(`## Page Weight`);
  lines.push(`- Total transferred: ${(data.totalBytes / 1024).toFixed(1)} KB`);
  lines.push(`- JS: ${(data.scriptBytes / 1024).toFixed(1)} KB`);
  lines.push(`- Images: ${(data.imageBytes / 1024).toFixed(1)} KB`);
  lines.push(`- Requests: ${data.resourceCount}`);
  lines.push(`- Load time: ${data.loadTime} ms`);
  lines.push(``);
  lines.push(`## DOM Complexity`);
  lines.push(`- DOM nodes: ${data.domNodeCount}`);
  lines.push(`- ${data.domNodeCount > 1500 ? '⚠️ High DOM complexity (>1500 nodes)' : '✅ DOM complexity OK'}`);
  lines.push(``);
  lines.push(`## JS Execution`);
  lines.push(`- Script duration: ${(data.scriptDuration * 1000).toFixed(0)} ms`);
  lines.push(`- JS heap used: ${(data.jsHeapUsed / 1024 / 1024).toFixed(2)} MB`);
  lines.push(``);
  lines.push(`## Unused JavaScript (dead code waste)`);
  if (data.jsWaste.length === 0) {
    lines.push(`No significant unused JS detected.`);
  } else {
    data.jsWaste.forEach((f, i) => {
      lines.push(`${i + 1}. **${f.unusedPercent.toFixed(1)}% unused** (${(f.unusedBytes / 1024).toFixed(1)} KB wasted) — \`${f.url}\``);
    });
  }
  lines.push(``);
  lines.push(`## Estimated Carbon Footprint`);
  lines.push(`- Energy per view: ${(energyKwh * 1000).toFixed(4)} Wh`);
  lines.push(`- CO2e per view: ${carbonGrams.toFixed(3)} g`);
  lines.push(``);
  lines.push(`## 🚨 Top Green Bottlenecks (largest assets)`);
  data.topResources.forEach((r, i) => {
    lines.push(`${i + 1}. [${r.type}] ${(r.size / 1024).toFixed(1)} KB — \`${r.url}\``);
  });
  lines.push(``);
  return lines.join('\n');
}

function saveReports(data, energyKwh, carbonGrams, grade, label) {
  const dir = path.join(process.cwd(), 'reports');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir);

  const hostname = data.url.replace(/^https?:\/\//, '').replace(/[^a-z0-9]/gi, '-').toLowerCase();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const baseName = `${hostname}-${timestamp}`;

  const jsonPath = path.join(dir, `${baseName}.json`);
  const mdPath = path.join(dir, `${baseName}.md`);

  fs.writeFileSync(jsonPath, JSON.stringify({ data, energyKwh, carbonGrams, grade, label }, null, 2));
  fs.writeFileSync(mdPath, buildMarkdownReport(data, energyKwh, carbonGrams, grade, label));

  const htmlPath = saveHtmlReport(data, energyKwh, carbonGrams, grade, label);

  return { jsonPath, mdPath, htmlPath };
}

module.exports = { saveReports };
