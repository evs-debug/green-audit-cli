const fs = require('fs');
const path = require('path');

function getCacheFilePath() {
  const dir = path.join(process.cwd(), 'reports');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return path.join(dir, '.analysis-cache.json');
}

function loadCachedAnalysis(url) {
  const cachePath = getCacheFilePath();
  if (!fs.existsSync(cachePath)) {
    return null;
  }

  try {
    const cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    return cache[url] || null;
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

  cache[url] = snapshot;
  fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2));
}

module.exports = { loadCachedAnalysis, saveCachedAnalysis };
