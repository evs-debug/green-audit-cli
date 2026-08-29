const fs = require('fs');
const path = require('path');
const { loadConfig } = require('./config');

function getCacheFilePath() {
  const dir = path.join(process.cwd(), 'reports');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return path.join(dir, '.analysis-cache.json');
}

function loadCachedAnalysis(url, cfg = loadConfig()) {
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
