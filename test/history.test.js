// Run: node test/history.test.js
const assert = require('assert');
const fs = require('fs'), os = require('os'), path = require('path');
const { appendHistory, readHistory } = require('../src/history');

const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ga-')), 'history.csv');
const data = { totalBytes: 800 * 1024, resourceCount: 40, loadTime: 1200, domNodeCount: 900, scriptDuration: 0.25 };
appendHistory('https://example.com', data, 0.91, 'B', false, file);
appendHistory('https://example.com', { ...data, totalBytes: 300 * 1024 }, 0.42, 'A', true, file);

const rows = readHistory(file);
assert.strictEqual(rows.length, 2);
assert.strictEqual(rows[0].grade, 'B');
assert.strictEqual(rows[1].carbon_grams, '0.42');
assert.strictEqual(rows[1].total_kb, '300');
assert.strictEqual(rows[0].script_ms, '250');
assert.strictEqual(rows[1].cached, 'yes');
console.log('✅ history tests passed');
