# Green-Computing Audit Tool

A CLI tool that performs static and dynamic analysis of a webpage's loading cycle — calculating data payload size, JS execution energy drain, and DOM complexity, then converting these into an estimated carbon footprint per page view.

## Status
🚧 In early development.

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

## Requirements

- Node.js (v16 or newer)
- Internet connection (to load the audited page)

## Installation

```bash
npm install
```

## Usage

```bash
node index.js <url>
```

Examples:

```bash
node index.js https://example.com
node index.js amazon.in
node index.js https://www.google.com
```

The URL is optional — you can pass it with or without the `https://` prefix.

### What happens

1. The tool loads the page in a headless browser and collects metrics.
2. It prints the audit summary to the terminal.
3. It saves a timestamped HTML report (plus Markdown and JSON) to the `reports/` folder.
4. It automatically opens the HTML report in your default browser.

## Output

Reports are saved to the `reports/` directory:

- `reports/<hostname>-<timestamp>.html` — self-contained HTML report
- `reports/<hostname>-<timestamp>.md` — Markdown summary
- `reports/<hostname>-<timestamp>.json` — raw JSON data

## Methodology

The tool loads a page in a headless Chromium browser and intercepts every network response to measure total bytes transferred. It also captures DOM node count (structural complexity) and JS heap/script execution time via Chrome's performance metrics. To convert bytes into a carbon estimate, we use the Sustainable Web Design model's energy intensity figure — approximately 0.81 kWh per GB transferred (covering data center, network transmission, and end-user device energy) — multiplied by a global average grid carbon intensity of ~442g CO2e per kWh. This gives a per-page-view estimate in grams of CO2e, which can be compared across sites or before/after optimizations.
