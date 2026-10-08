// Run: node test/transferBytes.test.js
// Feeds fake CDP Network events to the pure aggregator -- no puppeteer,
// no network.
const assert = require('assert');
const { aggregateTransfer, BYTE_METHOD, NETWORK_EVENTS } = require('../src/transferBytes');

// Tiny event builders, shaped like real CDP params.
const sent = (requestId, url, type, redirectResponse) => ({
  method: 'Network.requestWillBeSent',
  params: { requestId, type, request: { url }, ...(redirectResponse ? { redirectResponse } : {}) },
});
const response = (requestId, type, encodedDataLength, extra = {}) => ({
  method: 'Network.responseReceived',
  params: { requestId, type, response: { status: 200, encodedDataLength, ...extra } },
});
const data = (requestId, encodedDataLength, dataLength = encodedDataLength * 4) => ({
  method: 'Network.dataReceived', params: { requestId, dataLength, encodedDataLength },
});
const finished = (requestId, encodedDataLength) => ({
  method: 'Network.loadingFinished', params: { requestId, encodedDataLength },
});
const failed = (requestId, canceled = false) => ({
  method: 'Network.loadingFailed', params: { requestId, errorText: 'net::ERR_ABORTED', canceled },
});

assert.strictEqual(BYTE_METHOD, 'cdp-encoded-v1');
assert.ok(NETWORK_EVENTS.includes('Network.loadingFinished') && NETWORK_EVENTS.includes('Network.dataReceived'));

// --- Empty input ---
assert.deepStrictEqual(aggregateTransfer([]), {
  resources: [], totalBytes: 0, scriptBytes: 0, imageBytes: 0,
  resourceCount: 0, unfinishedRequests: 0, serviceWorkerResponses: 0,
});

// --- Finished request: loadingFinished total wins over the running count ---
// (Compressed script: 4x larger decoded, but only encoded bytes count.)
let r = aggregateTransfer([
  sent('1', 'https://a.example/app.js', 'Script'),
  response('1', 'Script', 300),
  data('1', 5000), data('1', 4000),
  finished('1', 9350),
]);
assert.deepStrictEqual(r.resources, [{ url: 'https://a.example/app.js', type: 'script', size: 9350 }]);
assert.strictEqual(r.totalBytes, 9350);
assert.strictEqual(r.scriptBytes, 9350);
assert.strictEqual(r.unfinishedRequests, 0);

// --- Redirect chain: each hop is its own entry, sized by its headers ---
r = aggregateTransfer([
  sent('doc', 'http://site.example/', 'Document'),
  sent('doc', 'https://site.example/', 'Document', { url: 'http://site.example/', status: 301, encodedDataLength: 210 }),
  sent('doc', 'https://www.site.example/', 'Document', { url: 'https://site.example/', status: 302, encodedDataLength: 190 }),
  response('doc', 'Document', 400),
  finished('doc', 20400),
]);
assert.deepStrictEqual(r.resources, [
  { url: 'http://site.example/', type: 'document', size: 210 },
  { url: 'https://site.example/', type: 'document', size: 190 },
  { url: 'https://www.site.example/', type: 'document', size: 20400 },
]);
assert.strictEqual(r.totalBytes, 20800);
assert.strictEqual(r.resourceCount, 3, 'redirect hops count as resources, as before');

// --- Canceled mid-download (e.g. by a JS redirect): bytes received so far ---
r = aggregateTransfer([
  sent('img', 'https://a.example/hero.jpg', 'Image'),
  response('img', 'Image', 250),
  data('img', 30000),
  failed('img', true),
]);
assert.deepStrictEqual(r.resources, [{ url: 'https://a.example/hero.jpg', type: 'image', size: 30250 }]);
assert.strictEqual(r.imageBytes, 30250);
assert.strictEqual(r.unfinishedRequests, 0, 'failed is not unfinished');

// --- Streaming video still running: partial bytes, never the full file ---
r = aggregateTransfer([
  sent('vid', 'https://cdn.example/clip.mp4', 'Media'),
  response('vid', 'Media', 300, { headers: { 'content-length': '50000000' } }),
  data('vid', 64000), data('vid', 64000),
]);
assert.strictEqual(r.totalBytes, 128300);
assert.strictEqual(r.unfinishedRequests, 1);

// --- Request with no response yet: unfinished, but not a resource ---
r = aggregateTransfer([sent('poll', 'https://a.example/poll', 'XHR')]);
assert.strictEqual(r.resourceCount, 0);
assert.strictEqual(r.unfinishedRequests, 1);

// --- Failed with nothing received (DNS / blocked): 0 bytes, not counted ---
r = aggregateTransfer([
  sent('ad', 'https://ads.example/x.js', 'Script'),
  failed('ad'),
]);
assert.strictEqual(r.resourceCount, 0);
assert.strictEqual(r.totalBytes, 0);
assert.strictEqual(r.unfinishedRequests, 0);

// --- Cache and service-worker hits: what Chrome reports (~0), still listed ---
r = aggregateTransfer([
  sent('c', 'https://a.example/logo.png', 'Image'),
  { method: 'Network.requestServedFromCache', params: { requestId: 'c' } },
  response('c', 'Image', 0, { fromDiskCache: true }),
  finished('c', 0),
  sent('sw', 'https://a.example/data.json', 'Fetch'),
  response('sw', 'Fetch', 0, { fromServiceWorker: true }),
  finished('sw', 0),
]);
assert.strictEqual(r.resourceCount, 2);
assert.strictEqual(r.totalBytes, 0);
assert.strictEqual(r.serviceWorkerResponses, 1);

// --- data: and blob: URLs are not network transfers ---
r = aggregateTransfer([
  sent('d', 'data:image/png;base64,AAAA', 'Image'),
  response('d', 'Image', 0), finished('d', 0),
  sent('b', 'blob:https://a.example/123', 'Media'),
  response('b', 'Media', 0),
]);
assert.strictEqual(r.resourceCount, 0);
assert.strictEqual(r.unfinishedRequests, 0, 'a pending blob: request is not an unfinished network request');

// --- Type: lowercased, responseReceived type wins, missing -> "other" ---
r = aggregateTransfer([
  sent('t1', 'https://a.example/a.css', 'Stylesheet'), response('t1', 'Stylesheet', 10), finished('t1', 10),
  sent('t2', 'https://a.example/x', undefined), response('t2', 'Fetch', 10), finished('t2', 10),
  sent('t3', 'https://a.example/y', undefined), response('t3', undefined, 10), finished('t3', 10),
]);
assert.deepStrictEqual(r.resources.map((x) => x.type), ['stylesheet', 'fetch', 'other']);

// --- Robust to junk: unknown requestIds, missing/negative/NaN lengths ---
r = aggregateTransfer([
  data('ghost', 999), finished('ghost', 999), failed('ghost'),
  { method: 'Network.somethingElse', params: {} },
  sent('n', 'https://a.example/n', 'Other'),
  response('n', 'Other', -5), data('n', NaN), data('n', 100),
]);
assert.deepStrictEqual(r.resources, [{ url: 'https://a.example/n', type: 'other', size: 100 }]);

// --- Interleaved requests stay separate ---
r = aggregateTransfer([
  sent('x', 'https://a.example/x.js', 'Script'), sent('y', 'https://a.example/y.png', 'Image'),
  response('y', 'Image', 100), response('x', 'Script', 100),
  data('x', 1000), data('y', 2000),
  finished('y', 2100), finished('x', 1100),
]);
assert.strictEqual(r.scriptBytes, 1100);
assert.strictEqual(r.imageBytes, 2100);
assert.strictEqual(r.totalBytes, 3200);

console.log('✅ transfer bytes tests passed');
