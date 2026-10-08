// src/transferBytes.js
//
// Turns a recorded list of Chrome DevTools Protocol Network events into
// per-resource transferred bytes -- what actually crossed the network
// (compressed body + headers), the same figure DevTools shows as
// "transferred". Pure: no puppeteer, so it's unit-testable with fake events.
//
// Counting rules:
//   - Finished requests: Network.loadingFinished.encodedDataLength
//     (authoritative total, headers included).
//   - Failed / canceled / still-running requests: only the bytes received so
//     far (response headers + Network.dataReceived chunks), so an aborted
//     download or a streaming video isn't counted as the full file.
//   - Redirects: each 3xx hop is its own entry, sized by
//     redirectResponse.encodedDataLength.
//   - Cache and service-worker hits: whatever Chrome reports (~0 bytes).
//   - data: and blob: URLs are not network transfers and are skipped.

// Stored on every audit as data.byteMethod. The cache only serves entries
// whose byteMethod matches exactly, so changing how bytes are counted means
// bumping this string -- older measurements then stop being reused.
const BYTE_METHOD = 'cdp-encoded-v1';

// Events analyze.js subscribes to and passes in as { method, params }.
const NETWORK_EVENTS = [
  'Network.requestWillBeSent',
  'Network.requestServedFromCache',
  'Network.responseReceived',
  'Network.dataReceived',
  'Network.loadingFinished',
  'Network.loadingFailed',
];

const bytes = (n) => (Number.isFinite(n) && n > 0 ? n : 0);
const isNonNetworkUrl = (url) => /^(data|blob):/i.test(url || '');

function newEntry(url, type) {
  return {
    url: url || '',
    type: type ? String(type).toLowerCase() : 'other',
    headerBytes: 0,
    bodyBytes: 0,
    finalBytes: null,
    gotResponse: false,
    finished: false,
    failed: false,
    fromServiceWorker: false,
  };
}

function entrySize(e) {
  return e.finalBytes !== null ? e.finalBytes : e.headerBytes + e.bodyBytes;
}

/**
 * @param {{ method: string, params: object }[]} events  in arrival order
 * @returns {{
 *   resources: { url: string, type: string, size: number }[],
 *   totalBytes: number, scriptBytes: number, imageBytes: number,
 *   resourceCount: number, unfinishedRequests: number, serviceWorkerResponses: number
 * }}
 */
function aggregateTransfer(events = []) {
  const entries = [];             // every entry, in request order (hops included)
  const current = new Map();      // requestId -> entry currently in flight

  for (const { method, params = {} } of events) {
    const id = params.requestId;
    let entry = current.get(id);

    switch (method) {
      case 'Network.requestWillBeSent': {
        const redirect = params.redirectResponse;
        if (redirect) {
          // Same requestId continues with a new URL: close off the hop.
          let hop = entry;
          if (!hop) {
            hop = newEntry(redirect.url, params.type);
            entries.push(hop);
          }
          hop.gotResponse = true;
          hop.finished = true;
          hop.finalBytes = bytes(redirect.encodedDataLength);
        }
        entry = newEntry(params.request && params.request.url, params.type);
        entries.push(entry);
        current.set(id, entry);
        break;
      }
      case 'Network.requestServedFromCache':
        // Nothing to add: memory-cache hits transfer ~0 bytes.
        break;
      case 'Network.responseReceived': {
        if (!entry) break;
        const response = params.response || {};
        entry.gotResponse = true;
        if (params.type) entry.type = String(params.type).toLowerCase();
        entry.headerBytes = bytes(response.encodedDataLength);
        entry.fromServiceWorker = Boolean(response.fromServiceWorker);
        break;
      }
      case 'Network.dataReceived':
        if (entry) entry.bodyBytes += bytes(params.encodedDataLength);
        break;
      case 'Network.loadingFinished':
        if (!entry) break;
        entry.finished = true;
        entry.finalBytes = bytes(params.encodedDataLength);
        break;
      case 'Network.loadingFailed':
        // Keep the bytes that did arrive; there is no final total.
        if (entry) entry.failed = true;
        break;
      default:
        break;
    }
  }

  const counted = entries.filter((e) => !isNonNetworkUrl(e.url));
  // Same meaning as before: a resource is something that responded (or at
  // least sent bytes). Requests that failed with nothing received are out.
  const resources = counted
    .filter((e) => e.gotResponse || entrySize(e) > 0)
    .map((e) => ({ url: e.url, type: e.type, size: entrySize(e) }));

  const sum = (list) => list.reduce((total, r) => total + r.size, 0);
  return {
    resources,
    totalBytes: sum(resources),
    scriptBytes: sum(resources.filter((r) => r.type === 'script')),
    imageBytes: sum(resources.filter((r) => r.type === 'image')),
    resourceCount: resources.length,
    unfinishedRequests: counted.filter((e) => !e.finished && !e.failed).length,
    serviceWorkerResponses: counted.filter((e) => e.fromServiceWorker).length,
  };
}

module.exports = { BYTE_METHOD, NETWORK_EVENTS, aggregateTransfer };
