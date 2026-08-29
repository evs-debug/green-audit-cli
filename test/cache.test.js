// Run: node test/cache.test.js
//
// Runs in an isolated temp directory (process.chdir) since cache.js
// resolves its file location from process.cwd(). Safe because each
// test file in package.json's `test` script runs as its own `node`
// process -- no chdir leakage between test files.
const assert = require('assert');
const fs = require('fs'), os = require('os'), path = require('path');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ga-cache-'));
process.chdir(tmpDir);

const { loadCachedAnalysis, saveCachedAnalysis } = require(path.join(__dirname, '..', 'src', 'cache'));

// --- fresh entry is returned as a cache hit ---
saveCachedAnalysis('https://example.com', { totalBytes: 500 });
const hit = loadCachedAnalysis('https://example.com');
assert.deepStrictEqual(hit, { totalBytes: 500 }, 'fresh cache entry should be returned');

// --- unknown URL is a clean miss ---
assert.strictEqual(loadCachedAnalysis('https://not-cached.example.com'), null);

// --- expired entry (older than default 24h TTL) is treated as a miss ---
const cachePath = path.join(tmpDir, 'reports', '.analysis-cache.json');
const cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
cache['https://example.com'].savedAt -= 25 * 60 * 60 * 1000; // push back 25 hours
fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2));
assert.strictEqual(loadCachedAnalysis('https://example.com'), null, 'entry older than TTL should be a miss');

// --- legacy entries (no savedAt, from before TTL support) are treated as stale ---
const legacyCache = { 'https://legacy.example.com': { totalBytes: 999 } }; // old raw format
fs.writeFileSync(cachePath, JSON.stringify(legacyCache, null, 2));
assert.strictEqual(loadCachedAnalysis('https://legacy.example.com'), null, 'legacy entries without savedAt should be a miss');

// --- custom ttlHours via cfg is respected ---
saveCachedAnalysis('https://short-ttl.example.com', { totalBytes: 100 });
const cache2 = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
cache2['https://short-ttl.example.com'].savedAt -= 2 * 60 * 60 * 1000; // 2 hours old
fs.writeFileSync(cachePath, JSON.stringify(cache2, null, 2));
const shortTtlCfg = { cache: { ttlHours: 1 } }; // 1 hour TTL -- 2-hour-old entry should miss
assert.strictEqual(loadCachedAnalysis('https://short-ttl.example.com', shortTtlCfg), null, 'custom shorter ttlHours should expire the entry');
const longTtlCfg = { cache: { ttlHours: 48 } }; // same entry, longer TTL -- should still hit
assert.deepStrictEqual(loadCachedAnalysis('https://short-ttl.example.com', longTtlCfg), { totalBytes: 100 }, 'custom longer ttlHours should still hit');

console.log('✅ cache tests passed');
