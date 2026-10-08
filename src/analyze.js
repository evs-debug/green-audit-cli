const puppeteer = require('puppeteer');
const { withContextRetry } = require('./contextRetry');
const { findChallengePhrase } = require('./auditValidity');
const { BYTE_METHOD, NETWORK_EVENTS, aggregateTransfer } = require('./transferBytes');

// Extra Chromium flags. Empty = default configuration. If cross-site iframes
// turn out to be undercounted (site isolation puts them in separate targets
// this page's CDP session can't see), add e.g.
// '--disable-features=site-per-process,IsolateOrigins' here.
const LAUNCH_ARGS = [];

// After load, wait this long to see whether a JS redirect starts...
const SETTLE_QUIET_MS = 1500;
// ...and if one does, give it this long to finish.
const SETTLE_NAVIGATION_TIMEOUT_MS = 15000;
// Total measurement tries if the page navigates mid-read (1 + 2 retries).
const MEASURE_ATTEMPTS = 3;
// Visible text checked for challenge phrases. Only the matched phrase is
// kept -- the text itself is never stored, cached or written to reports.
const TEXT_SAMPLE_CHARS = 2000;

/**
 * Resolves once the page has gone SETTLE_QUIET_MS without starting a new
 * navigation, or once a navigation that did start has finished.
 */
async function settle(page) {
  let timer;
  await Promise.race([
    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: SETTLE_NAVIGATION_TIMEOUT_MS }).catch(() => {}),
    new Promise((resolve) => { timer = setTimeout(resolve, SETTLE_QUIET_MS); }),
  ]);
  clearTimeout(timer);
}

async function analyzePage(url) {
  const browser = await puppeteer.launch({ args: LAUNCH_ARGS });
  try {
    const page = await browser.newPage();

    await Promise.all([
      page.coverage.startJSCoverage(),
    ]);

    // Record raw Network events from a dedicated CDP session; they're
    // reduced to transferred bytes by aggregateTransfer() at measurement time.
    const networkEvents = [];
    const cdp = await page.createCDPSession();
    for (const method of NETWORK_EVENTS) {
      cdp.on(method, (params) => networkEvents.push({ method, params }));
    }
    await cdp.send('Network.enable');

    // Last main-frame document response, so HTTP and JS redirects both
    // end up pointing at the document that was actually measured.
    let mainDocument = null;
    page.on('response', (response) => {
      try {
        if (response.request().isNavigationRequest() && response.frame() === page.mainFrame()) {
          const status = response.status();
          // Skip 3xx hops; keep one only if nothing else ever arrives.
          if (!(status >= 300 && status < 400) || !mainDocument) {
            mainDocument = { status, url: response.url() };
          }
        }
      } catch (e) {}
    });

    const start = Date.now();
    let gotoResponse;
    try {
      gotoResponse = await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });
    } catch (err) {
      throw new Error(`Could not load ${url} within 45 seconds. The site may be too slow, blocking automated browsers, or unreachable. Try again or test a different URL.`);
    }
    const loadTime = Date.now() - start;

    await settle(page);

    const { domNodeCount, pageTitle, challengePhrase, metrics } = await withContextRetry(async () => {
      const snapshot = await page.evaluate((maxChars) => ({
        domNodeCount: document.querySelectorAll('*').length,
        title: document.title || '',
        text: document.body ? document.body.innerText.slice(0, maxChars) : '',
      }), TEXT_SAMPLE_CHARS);
      const metrics = await page.metrics();
      return {
        domNodeCount: snapshot.domNodeCount,
        pageTitle: snapshot.title,
        challengePhrase: findChallengePhrase(`${snapshot.title}\n${snapshot.text}`),
        metrics,
      };
    }, { attempts: MEASURE_ATTEMPTS, settle: () => settle(page) });

    // Bytes are counted up to this moment; anything still downloading
    // contributes only what has arrived so far.
    const transfer = aggregateTransfer(networkEvents.slice());

    const finalUrl = page.url();
    const mainDocumentStatus = mainDocument
      ? mainDocument.status
      : (gotoResponse ? gotoResponse.status() : null);

    const jsCoverage = await page.coverage.stopJSCoverage();

    const { totalBytes, scriptBytes, imageBytes, resourceCount, unfinishedRequests, serviceWorkerResponses } = transfer;
    const topResources = [...transfer.resources].sort((a, b) => b.size - a.size).slice(0, 5);

    // Calculate unused JS bytes per file using Coverage API ranges
    const jsWaste = jsCoverage.map(entry => {
      const totalScriptBytes = entry.text.length;
      let usedBytes = 0;
      for (const range of entry.ranges) {
        usedBytes += range.end - range.start;
      }
      const unusedBytes = totalScriptBytes - usedBytes;
      const unusedPercent = totalScriptBytes > 0 ? (unusedBytes / totalScriptBytes) * 100 : 0;
      return { url: entry.url, totalScriptBytes, usedBytes, unusedBytes, unusedPercent };
    }).filter(f => f.totalScriptBytes > 0)
      .sort((a, b) => b.unusedBytes - a.unusedBytes)
      .slice(0, 5);

    return {
      url, finalUrl, mainDocumentStatus, pageTitle, challengePhrase,
      byteMethod: BYTE_METHOD, unfinishedRequests, serviceWorkerResponses,
      loadTime, totalBytes, scriptBytes, imageBytes, domNodeCount,
      scriptDuration: metrics.ScriptDuration || 0,
      jsHeapUsed: metrics.JSHeapUsedSize || 0,
      topResources, resourceCount,
      jsWaste
    };
  } finally {
    // Always close, including when a measurement throws -- otherwise each
    // failed URL in a batch leaks a Chromium process.
    await browser.close().catch(() => {});
  }
}

module.exports = { analyzePage };
