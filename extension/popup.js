import { estimateCarbon, getGrade } from './carbon.js';

// Chrome exposes callback-and-promise chrome.*; Firefox exposes a
// promise-native browser.* (chrome.* also exists there for compat, but
// isn't guaranteed to be promise-based for every API). This extension
// only touches tabs.query and scripting.executeScript, both of which
// are promise-based on both browsers once accessed through the right
// namespace -- so a tiny shim covers it without pulling in the full
// webextension-polyfill dependency.
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

const gradeColors = { A: '#10b981', B: '#84cc16', C: '#eab308', D: '#f97316', F: '#7f1d1d' };

const STORAGE_KEY = "greenaudit_last_report";
let lastAuditResult = null;

const el = (id) => document.getElementById(id);

function showState(name) {
  ['idle-state', 'loading-state', 'result-state', 'error-state'].forEach((id) => {
    el(id).classList.toggle('hidden', id !== name);
  });
}

// Runs inside the audited page's context via scripting.executeScript
// (through the browserAPI shim above, so it works on Chrome and Firefox).
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

  const domNodeCount = document.getElementsByTagName("*").length;
  const loadTime = nav ? Math.round(nav.loadEventEnd - nav.startTime) : null;

  // Top 5 largest resources by transfer size, for the full report's
  // bottleneck list. Resources with unknown size (cross-origin, no
  // Timing-Allow-Origin) are excluded rather than shown as misleading
  // zeros.
  const topResources = resources
    .filter((r) => r.transferSize > 0)
    .map((r) => ({ url: r.name, type: r.initiatorType || "other", size: r.transferSize }))
    .sort((a, b) => b.size - a.size)
    .slice(0, 5);

  return {
    url: location.href,
    totalBytes,
    scriptBytes,
    imageBytes,
    domNodeCount,
    loadTime,
    topResources,
    resourceCount: resources.length + (nav ? 1 : 0),
  };
}

async function collectPageMetrics(tabId) {
  const [{ result }] = await browserAPI.scripting.executeScript({
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
  lastAuditResult = { data, energyKwh, carbonGrams, grade, label };
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
    const [tab] = await browserAPI.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) throw new Error('No active tab found.');
    if (tab.url && (tab.url.startsWith('chrome://') || tab.url.startsWith('edge://'))) {
      throw new Error('Cannot audit internal browser pages.');
    }
    let data;
    try {
      data = await collectPageMetrics(tab.id);
    } catch (err) {
      // Chrome blocks script injection into a handful of protected
      // surfaces (the Web Store, its own settings pages under some
      // configs, etc.) and throws its own message for it -- surface
      // that distinctly rather than a generic "audit failed".
      if (err.message && err.message.includes('cannot be scripted')) {
        throw new Error('This page is protected by the browser and cannot be audited (e.g. the Chrome Web Store).');
      }
      throw err;
    }
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

el("view-full-report").addEventListener("click", async () => {
  if (!lastAuditResult) return;
  await browserAPI.storage.local.set({ [STORAGE_KEY]: lastAuditResult });
  browserAPI.tabs.create({ url: browserAPI.runtime.getURL("report.html") });
});
