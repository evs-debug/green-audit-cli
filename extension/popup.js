import { estimateCarbon, getGrade } from './carbon.js';

const gradeColors = { A: '#10b981', B: '#84cc16', C: '#eab308', D: '#f97316', F: '#7f1d1d' };

const el = (id) => document.getElementById(id);

function showState(name) {
  ['idle-state', 'loading-state', 'result-state', 'error-state'].forEach((id) => {
    el(id).classList.toggle('hidden', id !== name);
  });
}

// Runs inside the audited page's context via chrome.scripting.executeScript.
// Uses the Resource Timing + Navigation Timing APIs, since a real headless
// browser (Puppeteer) isn't available inside an extension — this reads
// whatever the page itself already recorded.
function collectPageMetricsInPage() {
  const resources = performance.getEntriesByType('resource');
  const nav = performance.getEntriesByType('navigation')[0];

  let totalBytes = 0;
  let scriptBytes = 0;
  let imageBytes = 0;

  resources.forEach((r) => {
    // transferSize is 0 for cross-origin resources without a
    // Timing-Allow-Origin header — a known undercount, documented in
    // the popup UI rather than silently presented as exact.
    const size = r.transferSize || 0;
    totalBytes += size;
    if (r.initiatorType === 'script') scriptBytes += size;
    if (r.initiatorType === 'img') imageBytes += size;
  });

  if (nav && nav.transferSize) totalBytes += nav.transferSize;

  const domNodeCount = document.getElementsByTagName('*').length;
  const loadTime = nav ? Math.round(nav.loadEventEnd - nav.startTime) : null;

  return {
    url: location.href,
    totalBytes,
    scriptBytes,
    imageBytes,
    domNodeCount,
    loadTime,
    resourceCount: resources.length + (nav ? 1 : 0),
  };
}

async function collectPageMetrics(tabId) {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: collectPageMetricsInPage,
  });
  return result;
}

function formatWeight(bytes) {
  const kb = bytes / 1024;
  return kb >= 1024 ? `${(kb / 1024).toFixed(2)} MB` : `${kb.toFixed(1)} KB`;
}

function renderResult(data, energyKwh, carbonGrams, grade, label) {
  el('grade-badge').textContent = grade;
  el('grade-badge').style.background = gradeColors[grade] || '#64748b';
  el('grade-label').textContent = label;
  el('page-url').textContent = data.url;
  el('metric-carbon').textContent = `${carbonGrams.toFixed(3)} g`;
  el('metric-weight').textContent = formatWeight(data.totalBytes);
  el('metric-dom').textContent = data.domNodeCount;
  el('metric-requests').textContent = data.resourceCount;
  showState('result-state');
}

function renderError(err) {
  el('error-text').textContent = `Audit failed: ${err.message || err}`;
  showState('error-state');
}

async function runAudit() {
  showState('loading-state');
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) throw new Error('No active tab found.');
    if (tab.url && (tab.url.startsWith('chrome://') || tab.url.startsWith('edge://'))) {
      throw new Error('Cannot audit internal browser pages.');
    }
    const data = await collectPageMetrics(tab.id);
    const { energyKwh, carbonGrams } = estimateCarbon(data.totalBytes);
    const { grade, label } = getGrade(carbonGrams);
    renderResult(data, energyKwh, carbonGrams, grade, label);
  } catch (err) {
    renderError(err);
  }
}

el('run-audit').addEventListener('click', runAudit);
el('run-again').addEventListener('click', runAudit);
el('run-retry').addEventListener('click', runAudit);
