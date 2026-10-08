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
const { BYTE_METHOD } = require(path.join(__dirname, '..', 'src', 'transferBytes'));

// --- fresh entry is returned as a cache hit ---
saveCachedAnalysis('https://example.com', { totalBytes: 500, byteMethod: BYTE_METHOD });
const hit = loadCachedAnalysis('https://example.com');
assert.deepStrictEqual(hit, { totalBytes: 500, byteMethod: BYTE_METHOD }, 'fresh cache entry should be returned');

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
saveCachedAnalysis('https://short-ttl.example.com', { totalBytes: 100, byteMethod: BYTE_METHOD });
const cache2 = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
cache2['https://short-ttl.example.com'].savedAt -= 2 * 60 * 60 * 1000; // 2 hours old
fs.writeFileSync(cachePath, JSON.stringify(cache2, null, 2));
const shortTtlCfg = { cache: { ttlHours: 1 } }; // 1 hour TTL -- 2-hour-old entry should miss
assert.strictEqual(loadCachedAnalysis('https://short-ttl.example.com', shortTtlCfg), null, 'custom shorter ttlHours should expire the entry');
const longTtlCfg = { cache: { ttlHours: 48 } }; // same entry, longer TTL -- should still hit
assert.deepStrictEqual(loadCachedAnalysis('https://short-ttl.example.com', longTtlCfg), { totalBytes: 100, byteMethod: BYTE_METHOD }, 'custom longer ttlHours should still hit');

// --- fresh entries measured with a different byte method are misses ---
// Pre-CDP entries (content-length sizes) have no byteMethod at all.
saveCachedAnalysis('https://header-sized.example.com', { totalBytes: 6500000 });
assert.strictEqual(loadCachedAnalysis('https://header-sized.example.com'), null, 'entry without byteMethod should be a miss');
saveCachedAnalysis('https://other-method.example.com', { totalBytes: 100, byteMethod: 'content-length' });
assert.strictEqual(loadCachedAnalysis('https://other-method.example.com'), null, 'entry with a different byteMethod should be a miss');
saveCachedAnalysis('https://future-method.example.com', { totalBytes: 100, byteMethod: BYTE_METHOD + '-next' });
assert.strictEqual(loadCachedAnalysis('https://future-method.example.com'), null, 'byteMethod must match exactly');

// --- minRuns: a cached median of fewer runs than requested is a miss ---
saveCachedAnalysis('https://median.example.com', { totalBytes: 300, byteMethod: BYTE_METHOD, runStats: { requested: 3 } });
assert.ok(loadCachedAnalysis('https://median.example.com', undefined, { minRuns: 3 }), '3-run entry serves --runs 3');
assert.ok(loadCachedAnalysis('https://median.example.com', undefined, { minRuns: 1 }), '3-run entry serves --runs 1');
assert.ok(loadCachedAnalysis('https://median.example.com'), 'default minRuns is 1');
assert.strictEqual(loadCachedAnalysis('https://median.example.com', undefined, { minRuns: 5 }), null, '3-run entry must not serve --runs 5');
// Single-run entries (no runStats) count as 1 run.
saveCachedAnalysis('https://single.example.com', { totalBytes: 300, byteMethod: BYTE_METHOD });
assert.ok(loadCachedAnalysis('https://single.example.com', undefined, { minRuns: 1 }));
assert.strictEqual(loadCachedAnalysis('https://single.example.com', undefined, { minRuns: 3 }), null, 'single run must not serve --runs 3');
// The byteMethod check still applies to multi-run entries.
saveCachedAnalysis('https://old-median.example.com', { totalBytes: 300, runStats: { requested: 5 } });
assert.strictEqual(loadCachedAnalysis('https://old-median.example.com', undefined, { minRuns: 3 }), null);

console.log('✅ cache tests passed');
