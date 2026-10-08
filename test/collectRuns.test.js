// Run: node test/collectRuns.test.js
// Fake analyze() and sleep() -- no browser, no network, no real waiting.
const assert = require('assert');
const { DEFAULTS } = require('../src/config');
const {
  parseRunsArg, collectRuns, measure, DEFAULT_RUNS, MAX_RUNS, RUN_PAUSE_MS,
} = require('../src/collectRuns');

const fakeData = (totalBytes) => ({ totalBytes, resourceCount: 40, domNodeCount: 1000, mainDocumentStatus: 200 });

(async () => {
  // --- Argument parsing ---
  assert.strictEqual(DEFAULT_RUNS, 3);
  assert.strictEqual(MAX_RUNS, 10);
  assert.deepStrictEqual(parseRunsArg(['https://bbc.com']), { runs: 3, args: ['https://bbc.com'] });
  assert.deepStrictEqual(parseRunsArg(['--runs', '5', 'https://bbc.com']), { runs: 5, args: ['https://bbc.com'] },
    'the count before the URL must not be taken as the URL');
  assert.deepStrictEqual(parseRunsArg(['https://bbc.com', '--runs=1', '--no-open']), { runs: 1, args: ['https://bbc.com', '--no-open'] });
  assert.deepStrictEqual(parseRunsArg(['batch', '--runs', '2', 'sites.txt']), { runs: 2, args: ['batch', 'sites.txt'] });
  for (const bad of [['--runs', '0'], ['--runs', '11'], ['--runs', 'abc'], ['--runs', '2.5'], ['--runs'], ['--runs=']]) {
    assert.throws(() => parseRunsArg(bad), /--runs must be a whole number from 1 to 10/, `should reject ${bad.join(' ')}`);
  }

  // --- Runs in sequence, pausing only between runs ---
  const calls = [];
  const sleeps = [];
  const sleep = async (ms) => { sleeps.push(ms); calls.push('sleep'); };
  let n = 0;
  const analyze = async (url) => { n++; calls.push(`analyze ${n}`); return fakeData(n * 1000); };
  const progress = [];
  const results = await collectRuns('https://x.example', { runs: 3, analyze, sleep, onRun: (i, total) => progress.push(`${i}/${total}`) });
  assert.deepStrictEqual(calls, ['analyze 1', 'sleep', 'analyze 2', 'sleep', 'analyze 3']);
  assert.deepStrictEqual(sleeps, [RUN_PAUSE_MS, RUN_PAUSE_MS]);
  assert.strictEqual(RUN_PAUSE_MS, 2000);
  assert.deepStrictEqual(progress, ['1/3', '2/3', '3/3']);
  assert.deepStrictEqual(results.map((r) => r.data.totalBytes), [1000, 2000, 3000]);

  // --- A throwing run is recorded and the sequence continues ---
  n = 0;
  const flaky = async () => { n++; if (n === 2) throw new Error('Execution context was destroyed'); return fakeData(n * 1000); };
  const mixed = await collectRuns('https://x.example', { runs: 3, analyze: flaky, sleep: async () => {} });
  assert.deepStrictEqual(mixed[1], { error: 'Execution context was destroyed' });
  assert.strictEqual(mixed[2].data.totalBytes, 3000);

  // --- measure(): runs > 1 aggregates to the median ---
  n = 0;
  const agg = await measure('https://x.example', { runs: 3, analyze, sleep: async () => {}, cfg: DEFAULTS });
  assert.strictEqual(agg.totalBytes, 2000);
  assert.strictEqual(agg.runStats.requested, 3);

  // --- measure(): runs === 1 is today's path exactly ---
  let slept = false;
  const single = await measure('https://x.example', {
    runs: 1, analyze: async () => fakeData(1234), sleep: async () => { slept = true; },
  });
  assert.deepStrictEqual(single, fakeData(1234), 'no runStats added for a single run');
  assert.strictEqual(slept, false);
  // ...and its errors propagate unchanged (no "All 1 run(s) failed" wrapper).
  await assert.rejects(
    measure('https://x.example', { runs: 1, analyze: async () => { throw new Error('Could not load'); } }),
    /^Error: Could not load$/
  );

  // --- measure(): all runs failing fails the audit ---
  await assert.rejects(
    measure('https://x.example', { runs: 2, analyze: async () => { throw new Error('boom'); }, sleep: async () => {}, cfg: DEFAULTS }),
    /All 2 run\(s\) failed: boom/
  );

  console.log('✅ run collection tests passed');
})().catch((err) => { console.error(err); process.exit(1); });
