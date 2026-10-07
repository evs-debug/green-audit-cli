// Run: node test/auditValidity.test.js
// Pure-function tests -- no puppeteer, no network.
const assert = require('assert');
const {
  checkAuditValidity, findChallengePhrase, CHALLENGE_PHRASES,
  SUSPECT_MIN_STATUS, CHALLENGE_MAX_DOM, INCOMPLETE_MAX_DOM, INCOMPLETE_MIN_REQUESTS,
} = require('../src/auditValidity');

// Numbers-only fixtures from real audits (DOM nodes / requests / KB).
// The 200 status is assumed; the original audits predate status capture.
const fixtures = {
  nytimes:   { domNodeCount: 9,  resourceCount: 10, totalBytes: 150 * 1024, mainDocumentStatus: 200, challengePhrase: null },
  reuters:   { domNodeCount: 9,  resourceCount: 8,  totalBytes: 543 * 1024, mainDocumentStatus: 200, challengePhrase: null },
  infoCern:  { domNodeCount: 16, resourceCount: 2,  totalBytes: 2 * 1024,   mainDocumentStatus: 200, challengePhrase: null },
  example:   { domNodeCount: 22, resourceCount: 2,  totalBytes: 2 * 1024,   mainDocumentStatus: 200, challengePhrase: null },
  mfw:       { domNodeCount: 38, resourceCount: 6,  totalBytes: 179 * 1024, mainDocumentStatus: 200, challengePhrase: null },
};

// --- Thresholds are what was agreed ---
assert.strictEqual(SUSPECT_MIN_STATUS, 400);
assert.strictEqual(CHALLENGE_MAX_DOM, 100);
assert.strictEqual(INCOMPLETE_MAX_DOM, 30);
assert.strictEqual(INCOMPLETE_MIN_REQUESTS, 5);

// --- Block pages without a phrase: possibly incomplete, not suspect ---
for (const name of ['nytimes', 'reuters']) {
  const v = checkAuditValidity(fixtures[name]);
  assert.strictEqual(v.status, 'incomplete', `${name} should be possibly incomplete`);
  assert.strictEqual(v.suspect, false);
  assert.strictEqual(v.possiblyIncomplete, true);
  assert.strictEqual(v.reasons.length, 1);
}

// --- Genuinely tiny static pages: no note at all ---
for (const name of ['infoCern', 'example', 'mfw']) {
  const v = checkAuditValidity(fixtures[name]);
  assert.deepStrictEqual(v, { status: 'ok', suspect: false, possiblyIncomplete: false, reasons: [] }, `${name} should be ok`);
}

// --- Block pages WITH a challenge phrase: suspect ---
const nytChallenge = checkAuditValidity({ ...fixtures.nytimes, challengePhrase: 'just a moment' });
assert.strictEqual(nytChallenge.status, 'suspect');
assert.strictEqual(nytChallenge.suspect, true);
assert.strictEqual(nytChallenge.possiblyIncomplete, false);
assert.match(nytChallenge.reasons[0], /just a moment/);

// --- Status rule ---
assert.strictEqual(checkAuditValidity({ ...fixtures.example, mainDocumentStatus: 403 }).suspect, true);
assert.strictEqual(checkAuditValidity({ ...fixtures.example, mainDocumentStatus: 500 }).suspect, true);
assert.match(checkAuditValidity({ ...fixtures.example, mainDocumentStatus: 403 }).reasons[0], /HTTP 403/);
assert.strictEqual(checkAuditValidity({ ...fixtures.example, mainDocumentStatus: 399 }).suspect, false);
// Status alone flags even a big page.
assert.strictEqual(checkAuditValidity({ domNodeCount: 5000, resourceCount: 300, mainDocumentStatus: 404 }).suspect, true);
// Both rules -> both reasons.
assert.strictEqual(checkAuditValidity({ ...fixtures.nytimes, mainDocumentStatus: 403, challengePhrase: 'access denied' }).reasons.length, 2);

// --- Challenge-phrase DOM boundary (< 100) ---
assert.strictEqual(checkAuditValidity({ domNodeCount: 99, resourceCount: 3, challengePhrase: 'captcha' }).suspect, true);
assert.strictEqual(checkAuditValidity({ domNodeCount: 100, resourceCount: 3, challengePhrase: 'captcha' }).suspect, false);
// A real page that merely mentions a phrase isn't suspect.
assert.strictEqual(checkAuditValidity({ domNodeCount: 2000, resourceCount: 80, challengePhrase: 'captcha' }).status, 'ok');

// --- "Possibly incomplete" boundaries (DOM < 30 AND requests >= 5) ---
assert.strictEqual(checkAuditValidity({ domNodeCount: 29, resourceCount: 5 }).status, 'incomplete');
assert.strictEqual(checkAuditValidity({ domNodeCount: 30, resourceCount: 5 }).status, 'ok');
assert.strictEqual(checkAuditValidity({ domNodeCount: 29, resourceCount: 4 }).status, 'ok');

// --- Missing fields (older cached audits) never throw or flag ---
assert.strictEqual(checkAuditValidity({}).status, 'ok');
assert.strictEqual(checkAuditValidity().status, 'ok');
assert.strictEqual(checkAuditValidity({ domNodeCount: 9, resourceCount: 10 }).status, 'incomplete');
assert.strictEqual(checkAuditValidity({ mainDocumentStatus: null, domNodeCount: 500, resourceCount: 40 }).status, 'ok');

// --- findChallengePhrase ---
assert.strictEqual(findChallengePhrase('Just a moment...'), 'just a moment');
assert.strictEqual(findChallengePhrase('ACCESS DENIED\nReference #18.abc'), 'access denied');
assert.strictEqual(findChallengePhrase('Please Press & Hold to confirm'), 'press & hold');
assert.strictEqual(findChallengePhrase('The New York Times - Breaking News'), null);
assert.strictEqual(findChallengePhrase(''), null);
assert.strictEqual(findChallengePhrase(undefined), null);
for (const phrase of ['enable javascript', 'enable js', 'press & hold', 'confirm you are', 'not a robot', 'security check']) {
  assert.ok(CHALLENGE_PHRASES.includes(phrase), `missing phrase: ${phrase}`);
  assert.strictEqual(findChallengePhrase(`xx ${phrase.toUpperCase()} xx`), phrase);
}
// Phrases must be lowercase, or the case-insensitive match silently fails.
for (const phrase of CHALLENGE_PHRASES) assert.strictEqual(phrase, phrase.toLowerCase());

console.log('✅ audit validity tests passed');
