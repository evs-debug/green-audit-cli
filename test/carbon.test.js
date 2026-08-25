// Run: node test/carbon.test.js
const assert = require('assert');
const { estimateCarbon, getGrade } = require('../src/carbon');

// --- estimateCarbon: custom constants, not just defaults ---
const customCfg = {
  carbon: { energyPerGbKwh: 1.0, gridCarbonIntensityGPerKwh: 500 },
};
const oneGb = 1024 ** 3;
const { energyKwh, carbonGrams } = estimateCarbon(oneGb, customCfg);
assert.ok(Math.abs(energyKwh - 1.0) < 1e-9, 'energyKwh should equal energyPerGbKwh for exactly 1GB');
assert.ok(Math.abs(carbonGrams - 500) < 1e-9, 'carbonGrams should equal energyKwh * gridCarbonIntensity');

// --- estimateCarbon: zero bytes -> zero footprint ---
const zero = estimateCarbon(0, customCfg);
assert.strictEqual(zero.energyKwh, 0);
assert.strictEqual(zero.carbonGrams, 0);

// --- getGrade: boundary exactness ---
// Thresholds are strict "<", so a value exactly AT a boundary falls into
// the NEXT grade down, not the one it's named after.
const gradeCfg = {
  grades: { A: 0.5, B: 1.5, C: 3.5, D: 6.5 },
  labels: { A: 'a', B: 'b', C: 'c', D: 'd', F: 'f' },
};
assert.strictEqual(getGrade(0.49, gradeCfg).grade, 'A');
assert.strictEqual(getGrade(0.5, gradeCfg).grade, 'B', 'exactly at A threshold should NOT be A');
assert.strictEqual(getGrade(1.5, gradeCfg).grade, 'C', 'exactly at B threshold should NOT be B');
assert.strictEqual(getGrade(3.5, gradeCfg).grade, 'D', 'exactly at C threshold should NOT be C');
assert.strictEqual(getGrade(6.5, gradeCfg).grade, 'F', 'exactly at D threshold should NOT be D');
assert.strictEqual(getGrade(0, gradeCfg).grade, 'A', 'zero footprint should always be A');

// --- getGrade: labels map correctly for a fully custom config ---
const labeled = getGrade(0.1, gradeCfg);
assert.strictEqual(labeled.label, 'a');
const worst = getGrade(999, gradeCfg);
assert.strictEqual(worst.grade, 'F');
assert.strictEqual(worst.label, 'f');

// --- default cfg param: calling without cfg should not throw ---
// (falls back to loadConfig() internally, same path batch.js relies on)
const defaultResult = estimateCarbon(oneGb);
assert.ok(typeof defaultResult.carbonGrams === 'number' && !Number.isNaN(defaultResult.carbonGrams));
const defaultGrade = getGrade(defaultResult.carbonGrams);
assert.ok(['A', 'B', 'C', 'D', 'F'].includes(defaultGrade.grade));

console.log('✅ carbon tests passed');
