// src/contextRetry.js
//
// Pages that redirect via JavaScript (e.g. amazon.in) can navigate while
// we're reading them, which destroys puppeteer's execution context:
//   "Execution context was destroyed, most likely because of a navigation."
// withContextRetry() waits for the page to settle and re-runs the read.
// Any other error is rethrown immediately.

const CONTEXT_LOST_PATTERNS = [
  /Execution context was destroyed/i,
  /Cannot find context with specified id/i,
  /Execution context is not available/i,
  /detached Frame/i,
];

function isContextLostError(err) {
  const msg = err && err.message ? err.message : String(err);
  return CONTEXT_LOST_PATTERNS.some((re) => re.test(msg));
}

/**
 * @param {(attempt: number) => Promise<T>} fn  the measurement to run
 * @param {{ attempts?: number, settle?: () => Promise<void> }} [opts]
 *   attempts: total tries (default 3 = first try + 2 retries)
 *   settle:   awaited between tries to let the navigation finish
 * @returns {Promise<T>}
 * @template T
 */
async function withContextRetry(fn, { attempts = 3, settle = async () => {} } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      if (!isContextLostError(err)) throw err;
      lastErr = err;
      if (attempt < attempts) await settle();
    }
  }
  throw new Error(
    `Page kept navigating while being measured (gave up after ${attempts} attempts): ${lastErr.message}`
  );
}

module.exports = { withContextRetry, isContextLostError };
