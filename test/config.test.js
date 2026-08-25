// Run: node test/config.test.js
const assert = require('assert');
const fs = require('fs'), os = require('os'), path = require('path');
const { loadConfig, DEFAULTS } = require('../src/config');
const { estimateCarbon, getGrade } = require('../src/carbon');

const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'ga-'));
let cfg = loadConfig({ cwd: empty });
assert.strictEqual(cfg._source, 'defaults');
assert.strictEqual(getGrade(0.4, cfg).grade, 'A');
assert.strictEqual(getGrade(1.0, cfg).grade, 'B');
assert.strictEqual(getGrade(7, cfg).grade, 'F');
assert.ok(Math.abs(estimateCarbon(1024 ** 3, cfg).carbonGrams - 0.81 * 442) < 1e-9);

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ga-'));
fs.writeFileSync(path.join(dir, '.green-auditrc.json'), JSON.stringify({ grades: { A: 0.1 }, dom: { highComplexityNodes: 100 } }));
cfg = loadConfig({ cwd: dir });
assert.strictEqual(getGrade(0.4, cfg).grade, 'B');
assert.strictEqual(cfg.grades.C, DEFAULTS.grades.C);
assert.strictEqual(cfg.dom.highComplexityNodes, 100);

fs.writeFileSync(path.join(dir, '.green-auditrc.json'), '{bad json');
cfg = loadConfig({ cwd: dir });
assert.ok(cfg._source.startsWith('defaults'));

console.log('✅ config tests passed');
