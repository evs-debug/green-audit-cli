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

function showFatalError(msg) {
  try {
    console.error('Report page error:', msg);
    const loadingEl = el('loading');
    const errorEl = el('error');
    if (loadingEl) loadingEl.classList.add('hidden');
    if (errorEl) {
      errorEl.classList.remove('hidden');
      const text = errorEl.querySelector('.error-text');
      if (text) text.textContent = `Couldn't load report data: ${msg}`;
    }
  } catch (e) {
    // swallow
  }
}

window.addEventListener('error', (ev) => {
  showFatalError(ev && ev.message ? ev.message : 'Unknown error');
});
window.addEventListener('unhandledrejection', (ev) => {
  const reason = (ev && ev.reason) ? (ev.reason.message || ev.reason) : 'Unhandled promise rejection';
  showFatalError(reason);
});

function render(stored) {
  const { data, energyKwh, carbonGrams, grade, label } = stored;
  const rating = getRatingInfo(grade);
  const impact = computeAnnualImpact(carbonGrams);

  el('report-meta').textContent = `Report generated for: ${data.url}`;
  el('rating-text').textContent = `${rating.text} Rating`;
  el('rating-description').textContent = rating.description;
  el('grade-circle').textContent = grade;
  // Render grade fill: A = full, others partial to show not-perfect
  const fillMap = { A: 1, B: 0.75, C: 0.55, D: 0.35, F: 0.12 };
  const pct = fillMap[grade] || 0.5;
  const degrees = Math.max(1, Math.round(pct * 360));
  const color = gradeColors[grade] || '#84cc16';
  // Use a ring visual: radial white center, conic-gradient ring showing the fill portion
  el('grade-circle').style.background = `radial-gradient(circle, white 0 60%, transparent 61%), conic-gradient(${color} 0 ${degrees}deg, rgba(0,0,0,0.06) ${degrees}deg)`;
  el('grade-circle').style.color = color;
  el('grade-circle').style.border = `4px solid ${color}`;

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
  function describeResource(r) {
    let name = r.url || '';
    let host = '';
    try {
      const u = new URL(r.url);
      host = u.hostname;
      const parts = u.pathname.split('/').filter(Boolean);
      name = parts.length ? parts[parts.length - 1] : u.pathname || u.hostname;
    } catch (e) {}
    const typeLabel = (r.type || '').toLowerCase();
    // More explicit, plain-language descriptions (title, short impact, concrete action)
    if (typeLabel.includes('script') || typeLabel === 'js') {
      return {
        title: `JavaScript file — ${name}`,
        impact: `This is one of the largest downloads on the page and can slow loading and increase battery/CPU use.`,
        action: `Reduce its size by removing unused code, splitting into smaller bundles, or lazy-loading when possible. Hosted on ${host || 'the site'}.`
      };
    }
    if (typeLabel.includes('image')) {
      return {
        title: `Image file — ${name}`,
        impact: `Large images increase download time for visitors, especially on mobile or slow connections.`,
        action: `Compress, resize, or convert to modern formats (WebP/AVIF); use responsive images or lazy-loading. Hosted on ${host || 'the site'}.`
      };
    }
    if (typeLabel.includes('font')) {
      return {
        title: `Web font — ${name}`,
        impact: `Fonts can be render-blocking and add significant bytes to the page.`,
        action: `Subset fonts to include only needed characters, or prefer system fonts to reduce downloads.`
      };
    }
    if (typeLabel.includes('stylesheet') || typeLabel === 'css') {
      return {
        title: `Stylesheet — ${name}`,
        impact: `Large CSS bundles can delay rendering and increase page weight.`,
        action: `Remove unused CSS, split critical vs non-critical styles, and minify the files.`
      };
    }
    return {
      title: `${r.type || 'Resource'} — ${name}`,
      impact: `This resource contributes to the page's total transfer size.`,
      action: host ? `Check caching, compression and whether it can be hosted on a faster CDN (${host}).` : 'Check caching and compression for this resource.'
    };
  }

  el('bottlenecks-list').innerHTML = bottlenecks.length
    ? bottlenecks.map((r, idx) => {
        const desc = describeResource(r);
        return `
        <div class="bottleneck-row">
          <div style="max-width:78%">
            <div class="bottleneck-desc">${idx + 1}. ${desc.title}</div>
              <div class="bottleneck-explain">${desc.impact}</div>
              <div class="bottleneck-action">Suggested fix: ${desc.action}</div>
          </div>
          <span class="bottleneck-size">${formatWeight(r.size)}</span>
        </div>`;
      }).join('')
    : '<p class="small-note">No resources with a measurable transfer size were found on this page.</p>';

  // Render unused JS if available (CLI/coverage data)
  const unusedListEl = el('unused-js-list');
  try {
    const candidate = data.unusedJavaScript || stored.unusedJavaScript || data.unused || stored.unused || [];
    const normalize = (arr) => arr.map((u) => ({
      name: u.name || u.file || (u.url ? (new URL(u.url).pathname.split('/').filter(Boolean).pop() || u.url) : ''),
      url: u.url || u.file || u.name,
      percent: u.unusedPercent || u.percent || u.unusedPercent === 0 ? (u.unusedPercent || u.percent) : undefined,
      bytes: u.unusedBytes || u.bytes || u.unused_bytes || undefined,
    }));
    const unused = Array.isArray(candidate) ? normalize(candidate) : [];
    if (unusedListEl && unused.length) {
      unusedListEl.innerHTML = unused.map(u => `
        <div class="unused-item">
          <div class="unused-title">${u.name || u.url}</div>
          <div class="unused-meta">${u.percent ? u.percent.toFixed ? u.percent.toFixed(1) + '% unused' : u.percent + '% unused' : ''} ${u.bytes ? '— ' + formatWeight(u.bytes) : ''}</div>
        </div>
      `).join('');
    }
  } catch (e) {
    // leave default message
  }

  el('loading').classList.add('hidden');
  el('report').classList.remove('hidden');
}

async function init() {
  try {
    const result = await browserAPI.storage.local.get(STORAGE_KEY);
    const stored = result[STORAGE_KEY];
    if (!stored) throw new Error('No report data found');
    try {
      render(stored);
    } catch (err) {
      showFatalError(err && err.message ? err.message : 'Rendering error');
      return;
    }
    // Page navigation handlers
    const btnSummary = el('btn-summary');
    const btnDetails = el('btn-details');
    const showPage = (page) => {
      const summary = el('page-summary');
      const details = el('page-details');
      if (!summary || !details) return;
      if (page === 'summary') {
        summary.classList.remove('hidden');
        details.classList.add('hidden');
        btnSummary.classList.add('active');
        btnDetails.classList.remove('active');
      } else {
        summary.classList.add('hidden');
        details.classList.remove('hidden');
        btnSummary.classList.remove('active');
        btnDetails.classList.add('active');
      }
    };
    if (btnSummary && btnDetails) {
      btnSummary.addEventListener('click', () => showPage('summary'));
      btnDetails.addEventListener('click', () => showPage('details'));
    }
    // No upload handler: unused-JS feature removed per user request
  } catch (err) {
    el('loading').classList.add('hidden');
    el('error').classList.remove('hidden');
  }
}

init();
