// Run: node test/page-weight-percentile-sync.test.mjs
//
// extension/pageWeightPercentile.js is a manually-maintained ES-module
// mirror of src/pageWeightPercentile.js (the extension can't require()
// CommonJS). This test catches drift between the two -- in the published
// breakpoints and in the actual output -- and pins the behavior both
// copies must share.
//
// Written as .mjs so it can import the extension's module directly,
// unmodified, alongside the CLI's CommonJS module.

import assert from 'assert';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const cli = (await import(path.join(__dirname, '..', 'src', 'pageWeightPercentile.js'))).default;
const ext = await import(path.join(__dirname, '..', 'extension', 'pageWeightPercentile.js'));

// --- Sync: breakpoints ---
assert.deepStrictEqual(
  ext.DESKTOP_PAGE_WEIGHT_KB,
  cli.DESKTOP_PAGE_WEIGHT_KB,
  'extension/pageWeightPercentile.js DESKTOP_PAGE_WEIGHT_KB has drifted from src/pageWeightPercentile.js'
);

// --- Sync: identical output across a spread of inputs ---
const KB = 1024;
const samples = [
  undefined, null, NaN, -1, 0, 1,
  100 * KB, 606 * KB, 607 * KB, 900 * KB, 1275 * KB, 1800 * KB,
  2412 * KB, 3000 * KB, 4570 * KB, 7000 * KB, 9179 * KB, 9180 * KB, 50000 * KB,
];
for (const bytes of samples) {
  assert.deepStrictEqual(ext.pageWeightPercentile(bytes), cli.pageWeightPercentile(bytes),
    `pageWeightPercentile(${bytes}) differs between CLI and extension`);
  assert.strictEqual(ext.describePageWeightPercentile(bytes), cli.describePageWeightPercentile(bytes),
    `describePageWeightPercentile(${bytes}) differs between CLI and extension`);
}

// --- Behavior (checked on the CLI copy; sync above covers the extension) ---
const { pageWeightPercentile, describePageWeightPercentile, DESKTOP_PAGE_WEIGHT_KB } = cli;

// Published figures, Web Almanac 2025 Figure 14.3 (desktop).
assert.deepStrictEqual(
  DESKTOP_PAGE_WEIGHT_KB.map(b => [b.percentile, b.kb]),
  [[10, 607], [25, 1275], [50, 2412], [75, 4570], [90, 9179]]
);

// Exact at every published breakpoint.
for (const { percentile, kb } of DESKTOP_PAGE_WEIGHT_KB) {
  const r = pageWeightPercentile(kb * KB);
  assert.strictEqual(r.percentile, percentile, `${kb} KB should be p${percentile}`);
  assert.strictEqual(r.lighterThanPct, 100 - percentile);
  assert.strictEqual(r.bound, null);
}

// Unusable input -> null.
for (const bad of [undefined, null, NaN, Infinity, -5, 0, '1000']) {
  assert.strictEqual(pageWeightPercentile(bad), null, `expected null for ${String(bad)}`);
  assert.strictEqual(describePageWeightPercentile(bad), null);
}

// Outside the published range -> bound, never a number.
assert.deepStrictEqual(pageWeightPercentile(606 * KB),
  { kb: 606, percentile: null, lighterThanPct: null, bound: 'below' });
assert.deepStrictEqual(pageWeightPercentile(9180 * KB),
  { kb: 9180, percentile: null, lighterThanPct: null, bound: 'above' });
assert.match(describePageWeightPercentile(100 * KB), /lighter than over 90% of desktop pages/);
assert.match(describePageWeightPercentile(20000 * KB), /heavier than 90% of desktop pages/);

// Interpolated values stay between their neighbouring breakpoints and
// never decrease as the page gets heavier.
let prev = -Infinity;
for (let kb = 607; kb <= 9179; kb += 37) {
  const { percentile } = pageWeightPercentile(kb * KB);
  assert.ok(percentile >= 10 && percentile <= 90, `${kb} KB -> p${percentile} out of range`);
  assert.ok(percentile >= prev, `percentile decreased at ${kb} KB`);
  prev = percentile;
}

// Sentence wording.
assert.strictEqual(
  describePageWeightPercentile(2412 * KB),
  'At 2.36 MB, this page is lighter than about 50% of desktop pages measured by HTTP Archive (Web Almanac 2025).'
);

console.log('✅ page-weight percentile CLI/extension sync test passed');
