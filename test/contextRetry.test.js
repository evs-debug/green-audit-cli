// Run: node test/contextRetry.test.js
// Uses fake measurement functions -- no puppeteer, no network.
const assert = require('assert');
const { withContextRetry, isContextLostError } = require('../src/contextRetry');

const CONTEXT_ERR = 'Execution context was destroyed, most likely because of a navigation.';

(async () => {
  // --- Recognizes the context-lost errors, and only those ---
  assert.ok(isContextLostError(new Error(CONTEXT_ERR)));
  assert.ok(isContextLostError(new Error('Protocol error: Cannot find context with specified id')));
  assert.ok(isContextLostError(new Error('Attempted to use detached Frame "ABC".')));
  assert.ok(!isContextLostError(new Error('net::ERR_NAME_NOT_RESOLVED')));

  // --- Succeeds on the first try: no settle ---
  let settles = 0;
  const settle = async () => { settles++; };
  assert.strictEqual(await withContextRetry(async () => 'ok', { settle }), 'ok');
  assert.strictEqual(settles, 0);

  // --- Two context losses, then success (the amazon.in case) ---
  let calls = 0;
  settles = 0;
  const value = await withContextRetry(async (attempt) => {
    calls++;
    if (attempt < 3) throw new Error(CONTEXT_ERR);
    return { domNodeCount: 1519 };
  }, { attempts: 3, settle });
  assert.deepStrictEqual(value, { domNodeCount: 1519 });
  assert.strictEqual(calls, 3);
  assert.strictEqual(settles, 2, 'settles between tries, not after the last one');

  // --- Keeps failing: clear error after 3 attempts ---
  calls = 0;
  await assert.rejects(
    withContextRetry(async () => { calls++; throw new Error(CONTEXT_ERR); }, { attempts: 3, settle }),
    /Page kept navigating while being measured \(gave up after 3 attempts\): Execution context was destroyed/
  );
  assert.strictEqual(calls, 3);

  // --- Other errors are rethrown immediately, not retried ---
  calls = 0;
  await assert.rejects(
    withContextRetry(async () => { calls++; throw new Error('boom'); }, { attempts: 3, settle }),
    /^Error: boom$/
  );
  assert.strictEqual(calls, 1);

  console.log('✅ context retry tests passed');
})().catch((err) => { console.error(err); process.exit(1); });
