const fs = require('fs');
const path = require('path');
const { loadConfig } = require('./config');
const { BYTE_METHOD } = require('./transferBytes');

function getCacheFilePath() {
  const dir = path.join(process.cwd(), 'reports');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return path.join(dir, '.analysis-cache.json');
}

function loadCachedAnalysis(url, cfg = loadConfig(), { minRuns = 1 } = {}) {
  const cachePath = getCacheFilePath();
  if (!fs.existsSync(cachePath)) {
    return null;
  }

  try {
    const cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    const entry = cache[url];
    if (!entry) return null;

    // Entries from before TTL support was added have no savedAt --
    // treat as stale rather than trusting data of unknown age.
    if (!entry.savedAt) return null;

    // Entries measured with a different byte-counting method (including
    // pre-CDP entries, which have no byteMethod and used content-length
    // sizes) aren't comparable -- re-audit instead of serving them.
    if (!entry.data || entry.data.byteMethod !== BYTE_METHOD) return null;

    // A median of fewer runs than requested isn't good enough. Single-run
    // entries have no runStats and count as 1 run.
    const cachedRuns = entry.data.runStats ? entry.data.runStats.requested : 1;
    if (cachedRuns < minRuns) return null;

    const ttlMs = cfg.cache.ttlHours * 60 * 60 * 1000;
    const ageMs = Date.now() - entry.savedAt;
    if (ageMs > ttlMs) return null;

    return entry.data;
  } catch (error) {
    return null;
  }
}

function saveCachedAnalysis(url, snapshot) {
  const cachePath = getCacheFilePath();
  let cache = {};

  if (fs.existsSync(cachePath)) {
    try {
      cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    } catch (error) {
      cache = {};
    }
  }

  cache[url] = { savedAt: Date.now(), data: snapshot };
  fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2));
}

module.exports = { loadCachedAnalysis, saveCachedAnalysis };
