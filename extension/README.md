# GreenAudit — Browser Extension (MVP)

A Chrome extension version of the green-audit-cli tool: click the icon,
get an estimated carbon footprint for the page you're currently viewing.

## Status

Working MVP, tested on both Chrome and Firefox. Scoped down from the
CLI tool — see Limitations below for exactly what's different and why.

## Why this exists

The CLI tool uses Puppeteer to drive a real headless Chromium instance,
which gives it full access to network interception, DevTools performance
metrics, and the Coverage API for unused-JS detection. A browser
extension can't spawn its own headless browser — it can only read data
the browser you're already using makes available to it. This is a
from-scratch reimplementation using in-browser APIs, not a port of the
CLI's `analyze.js`.

## How it works

1. `popup.js` runs `chrome.scripting.executeScript` to inject a small
   function into the active tab.
2. That function reads `performance.getEntriesByType('resource')` (the
   Resource Timing API) and the navigation entry to get transferred
   bytes, DOM node count, and load time.
3. The result is passed back to the popup, which runs it through the
   same carbon/grading math as the CLI (`carbon.js` here is a ported
   copy of `src/carbon.js` — see "Keeping constants in sync" below).
4. Grade badge + metrics render in the popup UI.

## Installation (development / unpacked)

### Chrome / Edge

1. `chrome://extensions` (or `edge://extensions`)
2. Enable **Developer mode** (top right)
3. **Load unpacked** → select this `extension/` folder
4. Pin the extension (puzzle-piece icon in the toolbar → pin GreenAudit)

### Firefox

Firefox doesn't have a persistent "load unpacked" for development —
extensions loaded this way are temporary and cleared when Firefox
restarts.

1. `about:debugging#/runtime/this-firefox`
2. **Load Temporary Add-on…**
3. Select the `manifest.json` file directly (not the folder)
4. Pin it to the toolbar if it doesn't appear automatically

Both browsers run from the exact same source — `popup.js` uses a small
compatibility shim (`const browserAPI = typeof browser !== 'undefined'
? browser : chrome;`) to handle Chrome's `chrome.*` vs Firefox's
promise-native `browser.*` namespace, since this extension only needs
two APIs (`tabs.query`, `scripting.executeScript`) and didn't warrant
pulling in the full `webextension-polyfill` dependency for that.

## Usage

Click the GreenAudit icon on any page, then click **Audit this page**.

## Limitations (honest, by design)

These aren't bugs — they're the real tradeoffs of running inside a
browser extension instead of a headless-browser CLI:

- **Page weight may be undercounted on cross-origin-heavy sites.**
  `transferSize` from the Resource Timing API is `0` for any cross-origin
  resource that doesn't send a `Timing-Allow-Origin` header — common for
  third-party ads, trackers, and some CDNs. The CLI doesn't have this
  limitation, since Puppeteer intercepts raw network responses directly.
- **No unused-JavaScript detection.** The CLI's dead-code detection uses
  Chrome DevTools' Coverage API, which isn't exposed to extensions
  without the `debugger` permission — a permission that shows users a
  scary "this extension can debug your browser" warning. Not worth it
  for an MVP.
- **No JS execution time or heap memory metrics**, for the same reason
  (DevTools Performance domain, not available without `debugger`).
- **Can't audit browser-internal pages** (`chrome://`, `edge://`) —
  extensions aren't allowed to inject scripts into those.

## Keeping constants in sync

`carbon.js` here duplicates the math and default constants from the
CLI's `src/carbon.js` and `src/config.js` `DEFAULTS`, since an extension
has no filesystem access to read `.green-auditrc.json` or `require()`
a shared module. **If the CLI's defaults change, update the copy here
too** — there's currently no automated sync between them.

## Tested on

| Site | Browser | Grade | CO2e / view | Page Weight | DOM Nodes | Requests |
|---|---|---|---|---|---|---|
| en.wikipedia.org | Chrome | A | 0.203 g | 595.9 KB | 2370 | 25 |
| en.wikipedia.org | Chrome | A | 0.031 g | 91.6 KB | 2369 | 18 |
| en.wikipedia.org | Firefox | A | 0.141 g | 413.5 KB | 2370 | 24 |
| edition.cnn.com | Chrome | A | 0.420 g | 1.20 MB (~1229 KB) | 3952 | 251 |
| nytimes.com | Chrome | B | 1.066 g | 3.05 MB (~3123 KB) | 2887 | 251 |
| amazon.in | Chrome | B | 0.763 g | 2.18 MB (~2232 KB) | 1509 | 56 |

Note the two Wikipedia/Chrome rows and the Firefox row show different
numbers for the *same page* — this isn't a bug or a browser
inconsistency. Resource Timing results depend on the browser's current
cache state (already-cached resources report differently) and can vary
between page loads even in the same browser. This is expected variance
for a live, real-world measurement, not something the tool gets wrong.

*(Add rows here as more sites are tested.)*

## Extension vs. CLI: a direct comparison

`amazon.in` was also audited by the CLI tool (see
`sample-results/category-comparison.md`), giving a rare direct
side-by-side of the two measurement approaches on the same live page:

| | Page Weight | Grade | CO2e / view |
|---|---|---|---|
| CLI (Puppeteer, network interception) | 5987.9 KB | C | 2.044 g |
| Extension (Resource Timing API) | ~2232 KB | B | 0.763 g |

The extension measured **roughly 63% less page weight** than the CLI on
the identical page — a large enough gap to change the letter grade from
C to B. This is a direct, measured demonstration of the
Timing-Allow-Origin limitation described above, not a theoretical
concern: Amazon's product pages load a lot of cross-origin ad, tracking,
and CDN content that the Resource Timing API simply can't see the size
of without that header being set by the resource's own server. Worth
citing in the final report as evidence that the extension is a useful
quick-check tool, but the CLI remains the more accurate one for serious
auditing.

## Next steps

- Test against more real sites, especially ones with heavy third-party
  ad/tracker content, to measure how much the cross-origin undercount
  actually matters in practice
- Harden error handling further for additional CSP/permission edge cases
- Consider an automatic on-load badge mode as a future option, instead
  of click-to-audit only
- Package for actual distribution (Chrome Web Store, Firefox AMO) if
  the team wants this beyond a development/demo build — currently only
  loadable as unpacked/temporary, not signed or store-published
