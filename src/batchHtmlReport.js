const fs = require('fs');
const path = require('path');

// Batch comparison HTML report — reuses the same visual language as the
// single-URL report (src/htmlReport.js: grade color variables, glass-card
// style, font stack) but renders a sortable comparison across every URL
// in a batch run instead of one page's detailed breakdown.

function gradeColor(grade) {
  const colors = { A: '#10b981', B: '#84cc16', C: '#eab308', D: '#f97316', F: '#7f1d1d' };
  return colors[grade] || '#64748b';
}

function generateBatchReport(results) {
  const succeeded = results.filter(r => !r.error);
  const failed = results.filter(r => r.error);
  const sorted = [...succeeded].sort((a, b) => a.carbonGrams - b.carbonGrams);
  const avgCarbon = succeeded.length
    ? succeeded.reduce((sum, r) => sum + r.carbonGrams, 0) / succeeded.length
    : 0;
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];
  const timestamp = new Date().toISOString();

  const rows = sorted.map((r, i) => `
        <tr>
          <td>${i + 1}</td>
          <td class="url-cell">${r.url}</td>
          <td><span class="grade-badge" style="background:${gradeColor(r.grade)}">${r.grade}</span></td>
          <td>${r.carbonGrams.toFixed(3)} g</td>
          <td>${r.totalKB.toFixed(1)} KB</td>
        </tr>`).join('');

  const failedRows = failed.map(r => `
        <tr class="failed-row">
          <td colspan="2">${r.url}</td>
          <td colspan="3">Failed \u2014 ${r.error}</td>
        </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>GreenAudit Batch Report</title>
  <style>
    :root {
      --primary-green: #059669;
      --text-main: #0f172a;
      --text-muted: #64748b;
      --card-bg: rgba(255, 255, 255, 0.85);
      --card-border: rgba(255, 255, 255, 0.4);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: linear-gradient(135deg, #f0fdf4 0%, #f8fafc 100%);
      color: var(--text-main);
      min-height: 100vh;
      line-height: 1.5;
    }
    h1, h2 { font-family: "Georgia", "Times New Roman", serif; color: #020617; }
    .container { max-width: 1000px; margin: 0 auto; padding: 2rem; }
    .page-title { font-size: 2.25rem; margin-bottom: 0.25rem; }
    .page-subtitle { color: var(--text-muted); margin-bottom: 2rem; }
    .glass-card {
      background: var(--card-bg);
      backdrop-filter: blur(12px);
      border: 1px solid var(--card-border);
      border-radius: 16px;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.02);
      padding: 1.5rem 2rem;
      margin-bottom: 1.5rem;
    }
    .summary-grid { display: flex; gap: 1.5rem; flex-wrap: wrap; }
    .summary-item { flex: 1; min-width: 180px; }
    .summary-item .label { font-size: 0.85rem; color: var(--text-muted); margin-bottom: 0.25rem; }
    .summary-item .value { font-size: 1.4rem; font-weight: 700; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; font-size: 0.85rem; color: var(--text-muted); padding: 0.6rem 0.75rem; border-bottom: 2px solid rgba(0,0,0,0.06); }
    td { padding: 0.75rem; border-bottom: 1px solid rgba(0,0,0,0.05); }
    .url-cell { font-family: monospace; font-size: 0.9rem; word-break: break-all; }
    .grade-badge { color: white; font-weight: 700; padding: 0.15rem 0.6rem; border-radius: 6px; font-size: 0.9rem; }
    .failed-row { color: #b91c1c; font-size: 0.9rem; }
    .meta { font-size: 0.85rem; color: var(--text-muted); margin-top: 2rem; }
  </style>
</head>
<body>
  <div class="container">
    <h1 class="page-title">Batch Audit Report</h1>
    <p class="page-subtitle">${results.length} URL${results.length === 1 ? '' : 's'} audited \u2014 ${succeeded.length} succeeded, ${failed.length} failed</p>

    ${succeeded.length > 0 ? `
    <div class="glass-card summary-grid">
      <div class="summary-item">
        <div class="label">Average footprint</div>
        <div class="value">${avgCarbon.toFixed(3)} g CO2e</div>
      </div>
      <div class="summary-item">
        <div class="label">Greenest</div>
        <div class="value" style="color:${gradeColor(best.grade)}">${best.grade} \u2014 ${best.url}</div>
      </div>
      <div class="summary-item">
        <div class="label">Heaviest</div>
        <div class="value" style="color:${gradeColor(worst.grade)}">${worst.grade} \u2014 ${worst.url}</div>
      </div>
    </div>` : ''}

    <div class="glass-card">
      <table>
        <thead>
          <tr><th>#</th><th>URL</th><th>Grade</th><th>CO2e / view</th><th>Page Weight</th></tr>
        </thead>
        <tbody>${rows}${failedRows}</tbody>
      </table>
    </div>

    <p class="meta">Generated ${timestamp} \u00b7 Estimates based on the Sustainable Web Design model.</p>
  </div>
</body>
</html>`;
}

function saveBatchHtmlReport(results) {
  const dir = path.join(process.cwd(), 'reports');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const htmlPath = path.join(dir, `batch-${timestamp}.html`);

  fs.writeFileSync(htmlPath, generateBatchReport(results));

  return htmlPath;
}

module.exports = { generateBatchReport, saveBatchHtmlReport };
