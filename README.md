# Green-Computing Audit Tool

A CLI tool that performs static and dynamic analysis of a webpage's loading cycle — calculating data payload size, JS execution energy drain, and DOM complexity, then converting these into an estimated carbon footprint per page view.

## Status

Functional — single-URL audits, batch auditing, configurable thresholds, and audit history are all working. Test coverage exists for config and history modules.

## Features

- 🔍 Audits any URL in a headless Chromium browser (puppeteer)
- 📦 Measures page weight, total requests, and load time
- 🧬 Calculates DOM complexity
- ⚙️ Captures JS execution time and heap memory usage
- ♻️ Detects unused JavaScript (dead code waste) via the Chrome Coverage API
- 🌍 Estimates the carbon footprint per page view (CO₂e)
- 🏆 Calculates a green score grade (A–F)
- 💾 Generates a self-contained HTML report, plus Markdown and JSON exports
- 🌐 Auto-opens the HTML report in your browser after the audit
- ⚡ Caches results per URL so repeat audits are instant
- 🗂️ Batch mode — audit a list of URLs from a `.txt`/`.csv` file in one run, with a comparison summary
- ⚙️ Configurable thresholds — override carbon constants, grade cutoffs, and DOM complexity limits via `.green-auditrc.json`
- 📜 Audit history — every run is logged to `history.csv`, viewable/filterable from the CLI

## Requirements

- Node.js (v16 or newer)
- Internet connection (to load the audited page)

## Installation

```bash
npm install
```

## Usage

### Single-URL audit

```bash
node index.js <url>
```

Examples:

```bash
node index.js https://example.com
node index.js amazon.in
node index.js https://www.google.com
```

The URL is optional to prefix — you can pass it with or without `https://`.

### Batch audit

```bash
node index.js batch <file.txt|file.csv>
```

Audits every URL in the file and prints a side-by-side comparison of grades and footprints.

### Configuration

```bash
node index.js --init-config     # writes a starter .green-auditrc.json
node index.js --show-config     # prints the currently active config
```

Override carbon constants (energy per GB, grid carbon intensity), grade cutoffs (A–F thresholds), and the DOM-complexity "high" threshold — all in `.green-auditrc.json` at the project root. Falls back to sane defaults if no config file is present.

### History

```bash
node index.js --history [urlFilter]   # view past audits, optionally filtered by URL
node index.js --clear-history         # wipe history.csv
```

Every audit (except when run with `--no-history`) appends a row to `history.csv` — timestamp, URL, grade, footprint, and whether it came from cache.

### Other flags

```bash
node index.js <url> --no-history   # skip logging this run
node index.js <url> --no-open      # don't auto-open the HTML report
```

### What happens on a single-URL audit

1. The tool loads the page in a headless browser and collects metrics.
2. It prints the audit summary to the terminal.
3. It saves a timestamped HTML report (plus Markdown and JSON) to the `reports/` folder.
4. It logs the run to `history.csv`.
5. It automatically opens the HTML report in your default browser.

## Output

Reports are saved to the `reports/` directory:

- `reports/<hostname>-<timestamp>.html` — self-contained HTML report
- `reports/<hostname>-<timestamp>.md` — Markdown summary
- `reports/<hostname>-<timestamp>.json` — raw JSON data

## Methodology

The tool loads a page in a headless Chromium browser and measures page weight as the bytes transferred over the network, as reported by Chrome's DevTools Protocol (`encodedDataLength`: compressed bodies plus response headers, the same figure as DevTools' "transferred" column). Requests that are aborted or still downloading when the page is measured count only the bytes received so far, and redirect hops are counted individually. It also captures DOM node count (structural complexity) and JS heap/script execution time via Chrome's performance metrics. To convert bytes into a carbon estimate, we use the Sustainable Web Design model's energy intensity figure — approximately 0.81 kWh per GB transferred (covering data center, network transmission, and end-user device energy) — multiplied by a global average grid carbon intensity of ~442g CO2e per kWh. This gives a per-page-view estimate in grams of CO2e, which can be compared across sites or before/after optimizations. These constants, along with grade cutoffs and DOM thresholds, are overridable via `.green-auditrc.json`.

## Limitations and methodology

Known limits of the numbers this tool produces. Figures below come from audits run while developing it; they are examples, not benchmarks.

### Byte counting
- Page weight is the bytes transferred over the network as reported by Chrome (`encodedDataLength`: compressed bodies plus response headers), for a cold load in a fresh browser profile. Ads, trackers and other third-party content are allowed to load.
- This can read higher than a manual check. For https://www.bbc.com the CLI read about 3.2 MB (median of 4 runs, range 2.9–3.7 MB); Chrome DevTools in an Incognito window showed 1.9 MB, and the ad scripts did not load there. For https://en.wikipedia.org/wiki/India the CLI read 965 KB and DevTools 789 KB.

### Run-to-run variability
- A single audit is one sample. Four BBC runs differed from their median by up to about 15%.
- Video-heavy and bot-protected sites vary much more: https://www.nytimes.com returned a 150 KB block page on one run and the full page on another.
- Streaming video counts only the bytes received before the page is measured, so it depends on how long the tool waits (until the network is mostly idle, plus about 1.5 s for late redirects).
- A page near a grade cutoff can get a different grade on another run.

### Bot protection
- Some sites serve headless Chrome a block or challenge page instead of the real page.
- A result is marked **unverified** if the main document returned HTTP 400 or higher, or if the page has fewer than 100 DOM nodes and its title or visible text contains a challenge phrase (for example "just a moment", "access denied", "verify you are human"). Unverified results are left out of batch averages, are not cached, and are not added to `history.csv`.
- A result is noted as **possibly incomplete** if the page has fewer than 30 DOM nodes but made 5 or more requests.
- Both rules are heuristics fitted to a handful of pages and will miss some block pages.

### Percentile comparison
- The "lighter than X% of desktop pages" line uses the five desktop page-weight points published in the Web Almanac 2025 (p10, p25, p50, p75, p90; July 2025 crawl).
- Values between those points are log-interpolated estimates. Below p10 or above p90 only a bound is shown ("lighter than over 90%", "heavier than 90%").
- It compares page weight, not emissions.

### Carbon model
- CO2e per view = bytes transferred × energy per GB (default 0.81 kWh; GB here is 1024³ bytes) × grid carbon intensity (default 442 g CO2e/kWh). Both are single global averages, overridable in `.green-auditrc.json`.
- End-user device energy is included only as part of the per-GB average; the page's actual CPU or screen time is not used.
- It does not account for hosting efficiency or renewable hosting, CDN placement, browser caching, or repeat visits: every view is treated as a full first load.

### Grades
- The default grade cutoffs (A < 0.5 g, B < 1.5 g, C < 3.5 g, D < 6.5 g, otherwise F) are constants chosen for this tool, not derived from a dataset. They can be overridden in `.green-auditrc.json`.
- With the default carbon constants, A means under about 1.4 MB, roughly the lightest 30% of desktop pages in the Web Almanac distribution. The B/C cutoff (about 4.3 MB) is near p73. The C/D cutoff (about 10 MB) and D/F cutoff (about 18.6 MB) are above p90, where no published figures exist.

### What affects the grade
- Only bytes transferred affect the grade. DOM size, JS execution time and memory are measured and reported but not used, except that DOM size feeds the unverified / possibly incomplete checks above.

### Extension vs. CLI
- The browser extension estimates page weight from the Resource Timing API (`transferSize`), which reads 0 for cross-origin resources served without a `Timing-Allow-Origin` header and for resources loaded from the browser cache. It undercounts and depends on cache state: the same page read 70 KB in one test and 216 KB in another.
- It does not measure unused JavaScript, script execution time or memory.
- The two tools' numbers are not directly comparable.

### Older audits
- Audits made before the switch to Chrome-reported transfer bytes summed `Content-Length` headers, falling back to the decompressed body size, which overstates compressed resources. Their reports in `reports/` and their rows in `history.csv` are not comparable with newer ones. Cached results from the old method are ignored and re-audited automatically.

## Running tests

```bash
npm test
```

Covers config loading/overrides and history read/write.

## Contributors

- Eva Sharma — core analyzer, carbon calculator, CLI entry point, grading system, unused-JS detection, HTML/Markdown/JSON reports, error handling
- Pranali Patil — HTML report generation, URL caching/normalization
- Sinhayana Naruka — batch CLI processing
- khushiharlalka — configurable thresholds, audit history tracking, test suite
