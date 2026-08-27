// Run: node test/url.test.js
const assert = require('assert');
const { normalizeUrl } = require('../src/url');

// --- already-prefixed URLs pass through unchanged ---
assert.strictEqual(normalizeUrl('https://example.com'), 'https://example.com');
assert.strictEqual(normalizeUrl('http://example.com'), 'http://example.com');
assert.strictEqual(normalizeUrl('HTTPS://example.com'), 'HTTPS://example.com', 'protocol check should be case-insensitive');

// --- bare domains get https:// prefixed ---
assert.strictEqual(normalizeUrl('example.com'), 'https://example.com/');
assert.strictEqual(normalizeUrl('www.example.com'), 'https://www.example.com/');

// --- whitespace is trimmed before processing ---
assert.strictEqual(normalizeUrl('  example.com  '), 'https://example.com/');
assert.strictEqual(normalizeUrl('  https://example.com  '), 'https://example.com');

// --- empty / whitespace-only input throws ---
assert.throws(() => normalizeUrl(''), /URL is required/);
assert.throws(() => normalizeUrl('   '), /URL is required/);

// --- unparseable input throws a descriptive error ---
assert.throws(() => normalizeUrl(':::not a url:::'), /Invalid URL/);

console.log('✅ url tests passed');
