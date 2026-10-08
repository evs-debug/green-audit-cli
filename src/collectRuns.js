// src/collectRuns.js
//
// Runs an audit N times in sequence (each analyzePage call launches a fresh
// browser) and reduces the runs to their median via aggregateRuns().
// analyze and sleep are injectable so tests use fakes -- no browser, no waiting.

const { aggregateRuns } = require('./aggregateRuns');
const { checkAuditValidity } = require('./auditValidity');

const DEFAULT_RUNS = 3;
const MAX_RUNS = 10;
// Pause between runs (not after the last) so repeated loads are less likely
// to trip a site's rate limiting.
const RUN_PAUSE_MS = 2000;

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Pulls `--runs N` / `--runs=N` out of argv so positional arguments (URL,
 * batch file) aren't mistaken for the count.
 * @returns {{ runs: number, args: string[] }}
 */
function parseRunsArg(argv) {
  const args = [];
  let seen = false;
  let raw;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--runs') {
      seen = true;
      raw = argv[i + 1];
      i++;
    } else if (a.startsWith('--runs=')) {
      seen = true;
      raw = a.slice('--runs='.length);
    } else {
      args.push(a);
    }
  }
  if (!seen) return { runs: DEFAULT_RUNS, args };
  if (raw === undefined || !/^\d+$/.test(raw) || Number(raw) < 1 || Number(raw) > MAX_RUNS) {
    throw new Error(`--runs must be a whole number from 1 to ${MAX_RUNS}`);
  }
  return { runs: Number(raw), args };
}

/**
 * @returns {Promise<({ data: object } | { error: string })[]>}
 */
async function collectRuns(url, { runs, analyze, pauseMs = RUN_PAUSE_MS, sleep = defaultSleep, onRun = () => {} }) {
  const results = [];
  for (let i = 0; i < runs; i++) {
    if (i > 0) await sleep(pauseMs);
    let result;
    try {
      result = { data: await analyze(url) };
    } catch (err) {
      result = { error: err && err.message ? err.message : String(err) };
    }
    results.push(result);
    onRun(i + 1, runs, result);
  }
  return results;
}

/**
 * One audit result for url. runs === 1 is exactly the single-run behavior
 * (no aggregation, no runStats, no pause; errors propagate unchanged).
 */
async function measure(url, { runs = 1, analyze, cfg, pauseMs, sleep, onRun } = {}) {
  if (runs === 1) return analyze(url);
  const results = await collectRuns(url, { runs, analyze, pauseMs, sleep, onRun });
  return aggregateRuns(results, { requested: runs, cfg });
}

/** Default per-run progress line for the CLI. */
function printRunProgress(run, total, result) {
  if (result.error) {
    console.log(`   run ${run}/${total}: failed (${result.error})`);
    return;
  }
  const kb = (result.data.totalBytes / 1024).toFixed(1);
  const note = checkAuditValidity(result.data).suspect ? ' (looked like a block page)' : '';
  console.log(`   run ${run}/${total}: ${kb} KB${note}`);
}

module.exports = { DEFAULT_RUNS, MAX_RUNS, RUN_PAUSE_MS, parseRunsArg, collectRuns, measure, printRunProgress };
