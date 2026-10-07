// src/auditValidity.js
//
// Decides whether an audit measured the real page or something else --
// typically a bot-block / challenge interstitial served to headless
// Chromium (e.g. nytimes.com returned a 9-node page that graded "A").
// Pure functions only, so this is unit-testable without puppeteer.

// Main document HTTP status at or above this => suspect.
const SUSPECT_MIN_STATUS = 400;

// A challenge phrase only counts on a page this small; real pages can
// legitimately mention "captcha" or "access denied" in their content.
const CHALLENGE_MAX_DOM = 100; // domNodeCount < 100

// "Possibly incomplete": almost no DOM, yet several requests were made.
// HEURISTIC, fitted to a handful of pages: block pages nytimes.com (9 nodes /
// 10 requests) and reuters.com (9 / 8) vs. genuinely tiny static pages
// info.cern.ch (16 / 2) and example.com (22 / 2). Revisit as more audits
// come in -- it is not a validated threshold.
const INCOMPLETE_MAX_DOM = 30;      // domNodeCount < 30
const INCOMPLETE_MIN_REQUESTS = 5;  // resourceCount >= 5

// Matched case-insensitively against the page title + visible text.
const CHALLENGE_PHRASES = [
  'just a moment',
  'access denied',
  'verify you are human',
  'are you a robot',
  'not a robot',
  'checking your browser',
  'attention required',
  'unusual traffic',
  'captcha',
  'request blocked',
  'pardon our interruption',
  'enable javascript',
  'enable js',
  'press & hold',
  'confirm you are',
  'security check',
];

/**
 * Returns the first challenge phrase found in text, or null.
 * @param {string} text
 * @returns {string|null}
 */
function findChallengePhrase(text) {
  if (typeof text !== 'string' || !text) return null;
  const haystack = text.toLowerCase();
  return CHALLENGE_PHRASES.find((p) => haystack.includes(p)) || null;
}

/**
 * Classifies an audit from the data analyzePage() returned.
 * Fields missing from older cached audits are simply skipped.
 *
 * @param {object} data
 * @returns {{ status: 'ok'|'suspect'|'incomplete', suspect: boolean, possiblyIncomplete: boolean, reasons: string[] }}
 */
function checkAuditValidity(data = {}) {
  const status = data.mainDocumentStatus;
  const dom = data.domNodeCount;
  const requests = data.resourceCount;
  const phrase = data.challengePhrase;

  const suspectReasons = [];
  if (typeof status === 'number' && status >= SUSPECT_MIN_STATUS) {
    suspectReasons.push(`main document returned HTTP ${status}`);
  }
  if (typeof dom === 'number' && dom < CHALLENGE_MAX_DOM && phrase) {
    suspectReasons.push(`page looks like a bot check: only ${dom} DOM nodes and it contains "${phrase}"`);
  }
  if (suspectReasons.length) {
    return { status: 'suspect', suspect: true, possiblyIncomplete: false, reasons: suspectReasons };
  }

  if (typeof dom === 'number' && typeof requests === 'number' &&
      dom < INCOMPLETE_MAX_DOM && requests >= INCOMPLETE_MIN_REQUESTS) {
    return {
      status: 'incomplete',
      suspect: false,
      possiblyIncomplete: true,
      reasons: [`only ${dom} DOM nodes despite ${requests} requests; the full page may not have loaded`],
    };
  }

  return { status: 'ok', suspect: false, possiblyIncomplete: false, reasons: [] };
}

module.exports = {
  SUSPECT_MIN_STATUS,
  CHALLENGE_MAX_DOM,
  INCOMPLETE_MAX_DOM,
  INCOMPLETE_MIN_REQUESTS,
  CHALLENGE_PHRASES,
  findChallengePhrase,
  checkAuditValidity,
};
