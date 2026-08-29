// extension/report.js
//
// Renders the full sustainability report in its own tab. Reads audit
// data handed off from popup.js via chrome.storage.local (or the
// browser.* equivalent on Firefox) rather than re-running the audit,
// so the report reflects exactly what the popup measured.

const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

const STORAGE_KEY = 'greenaudit_last_report';

const gradeColors = { A: '#10b981', B: '#84cc16', C: '#eab308', D: '#f97316', F: '#7f1d1d' };

// Ported from src/htmlReport.js's getRatingInfo/computeAnnualImpact so
// the language matches the CLI's report exactly.
function getRatingInfo(grade) {
  const map = {
    A: { text: 'Excellent', description: 'This webpage is cleaner than 85% of pages tested. It runs on sustainable energy and is highly optimized.' },
    B: { text: 'Good', description: 'This webpage has a lower than average carbon footprint. Some further optimizations could make it even greener.' },
    C: { text: 'Fair', description: 'This webpage has an above average carbon footprint. Consider optimizing resources to reduce environmental impact.' },
    D: { text: 'Poor', description: 'This webpage has a high carbon footprint. Significant optimizations are recommended.' },
    F: { text: 'Very Poor', description: 'This webpage has a very high carbon footprint. Major optimization efforts are needed.' },
  };
  return map[grade] || { text: grade, description: 'Carbon footprint analysis completed.' };
}

function computeAnnualImpact(carbonGrams) {
  const monthlyPageviews = 10000;
  const annualCarbonKg = (carbonGrams * monthlyPageviews * 12) / 1000;
  const miles = Math.round(annualCarbonKg / 0.403);
  const smartphones = Math.round(annualCarbonKg / 0.007);
  const trees = Math.max(1, Math.round(annualCarbonKg / 21.7));
  return { co2: annualCarbonKg.toFixed(1), miles, smartphones: smartphones.toLocaleString(), trees };
}

function formatWeight(bytes) {
  const kb = bytes / 1024;
  return kb >= 1024 ? `${(kb / 1024).toFixed(2)} MB` : `${kb.toFixed(1)} KB`;
}

const el = (id) => document.getElementById(id);

function render(stored) {
  const { data, energyKwh, carbonGrams, grade, label } = stored;
  const rating = getRatingInfo(grade);
  const impact = computeAnnualImpact(carbonGrams);

  el('report-meta').textContent = `Report generated for: ${data.url}`;
  el('rating-text').textContent = `${rating.text} Rating`;
  el('rating-description').textContent = rating.description;
  el('grade-circle').textContent = grade;
  el('grade-circle').style.background = gradeColors[grade] || '#64748b';

  el('metric-carbon').textContent = `${carbonGrams.toFixed(3)} g`;
  el('metric-weight').textContent = formatWeight(data.totalBytes);
  el('metric-loadtime').textContent = data.loadTime !== null ? `${data.loadTime} ms` : 'N/A';

  el('detail-dom').textContent = data.domNodeCount;
  el('detail-requests').textContent = data.resourceCount;
  el('detail-js').textContent = formatWeight(data.scriptBytes);
  el('detail-img').textContent = formatWeight(data.imageBytes);

  el('impact-grid').innerHTML = `
    <div class="impact-item"><div class="value">${impact.co2} kg</div><div class="label">CO2e / year</div></div>
    <div class="impact-item"><div class="value">${impact.miles.toLocaleString()}</div><div class="label">miles driven equivalent</div></div>
    <div class="impact-item"><div class="value">${impact.trees}</div><div class="label">trees needed to offset</div></div>
  `;

  const bottlenecks = data.topResources || [];
  el('bottlenecks-list').innerHTML = bottlenecks.length
    ? bottlenecks.map((r) => `
        <div class="bottleneck-row">
          <span class="bottleneck-url">[${r.type}] ${r.url}</span>
          <span class="bottleneck-size">${formatWeight(r.size)}</span>
        </div>`).join('')
    : '<p class="small-note">No resources with a measurable transfer size were found on this page.</p>';

  el('loading').classList.add('hidden');
  el('report').classList.remove('hidden');
}

async function init() {
  try {
    const result = await browserAPI.storage.local.get(STORAGE_KEY);
    const stored = result[STORAGE_KEY];
    if (!stored) throw new Error('No report data found');
    render(stored);
  } catch (err) {
    el('loading').classList.add('hidden');
    el('error').classList.remove('hidden');
  }
}

init();
