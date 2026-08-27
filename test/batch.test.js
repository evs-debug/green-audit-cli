// Run: node test/batch.test.js
const assert = require('assert');
const fs = require('fs'), os = require('os'), path = require('path');
const { parseInputFile } = require('../src/batch');

function writeTemp(name, content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ga-batch-'));
  const filePath = path.join(dir, name);
  fs.writeFileSync(filePath, content);
  return filePath;
}

// --- .txt: comments and blank lines are ignored, whitespace trimmed ---
const txtPath = writeTemp('urls.txt', [
  '# my list of sites',
  '',
  '  https://example.com  ',
  'wikipedia.org',
  '# another comment',
  'amazon.in',
  '',
].join('\n'));
assert.deepStrictEqual(parseInputFile(txtPath), [
  'https://example.com',
  'wikipedia.org',
  'amazon.in',
]);

// --- .csv: header row (url/urls) is stripped, only first column kept ---
const csvPath = writeTemp('urls.csv', [
  'url,notes',
  'https://example.com,homepage',
  'wikipedia.org,encyclopedia',
].join('\n'));
assert.deepStrictEqual(parseInputFile(csvPath), [
  'https://example.com',
  'wikipedia.org',
]);

// --- .csv without a recognizable header keeps the first row as data ---
const csvNoHeaderPath = writeTemp('nohead.csv', [
  'https://example.com,homepage',
  'wikipedia.org,encyclopedia',
].join('\n'));
assert.deepStrictEqual(parseInputFile(csvNoHeaderPath), [
  'https://example.com',
  'wikipedia.org',
]);

// --- empty file returns an empty list, not an error ---
const emptyPath = writeTemp('empty.txt', '');
assert.deepStrictEqual(parseInputFile(emptyPath), []);

console.log('✅ batch tests passed');
