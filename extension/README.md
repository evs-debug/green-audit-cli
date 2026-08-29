# GreenAudit — Browser Extension (MVP)

A Chrome extension version of the green-audit-cli tool: click the icon,
get an estimated carbon footprint for the page you're currently viewing.

## Status

Working MVP. Scoped down from the CLI tool — see Limitations below for
exactly what's different and why.

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

1. `chrome://extensions`
2. Enable **Developer mode** (top right)
3. **Load unpacked** → select this `extension/` folder
4. Pin the extension (puzzle-piece icon in the toolbar → pin GreenAudit)

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

| Site | Grade | Notes |
|---|---|---|
| en.wikipedia.org | A | 595.9 KB, 2370 DOM nodes, 25 requests — close to the CLI's own Wikipedia audit (538.6 KB), confirming the two measurement approaches roughly agree. |

*(Add rows here as more sites are tested — see Next Steps.)*

## Next steps

- Test against more real sites, especially ones with heavy third-party
  ad/tracker content, to measure how much the cross-origin undercount
  actually matters in practice
- Harden error handling for CSP-restricted pages and other edge cases
- Real MV2/Firefox build (this is Manifest V3, Chrome/Edge only for now)
- Consider an automatic on-load badge mode as a future option, instead
  of click-to-audit only
