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

The tool loads a page in a headless Chromium browser and intercepts every network response to measure total bytes transferred. It also captures DOM node count (structural complexity) and JS heap/script execution time via Chrome's performance metrics. To convert bytes into a carbon estimate, we use the Sustainable Web Design model's energy intensity figure — approximately 0.81 kWh per GB transferred (covering data center, network transmission, and end-user device energy) — multiplied by a global average grid carbon intensity of ~442g CO2e per kWh. This gives a per-page-view estimate in grams of CO2e, which can be compared across sites or before/after optimizations. These constants, along with grade cutoffs and DOM thresholds, are overridable via `.green-auditrc.json`.

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
