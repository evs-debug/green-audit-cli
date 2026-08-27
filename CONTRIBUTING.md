# Architecture & Contributing Notes

A quick map of how the pieces fit together, useful both for onboarding
and as a reference when writing the final project report.

## Module layout

    index.js                 CLI entry point: routes to single-URL audit,
                              batch mode, or a utility command (--history,
                              --show-config, etc.)

    src/
      analyze.js              Drives the headless Puppeteer browser: loads a
                               page, intercepts network responses, captures
                               DOM/JS/heap metrics and unused-JS coverage.
      carbon.js                Pure calculation: bytes -> energy (kWh) -> CO2e
                                grams, and CO2e -> A-F grade, using constants
                                from config.js.
      config.js                 Loads/merges .green-auditrc.json with defaults;
                                 falls back gracefully on missing/malformed config.
      cache.js                  Per-URL result caching so repeat audits are instant.
      history.js                 Appends every audit to history.csv; CLI viewing/
                                  filtering/clearing.
      url.js                      normalizeUrl(): adds https:// to bare domains,
                                   validates and passes through full URLs.
      report.js / htmlReport.js    Single-URL report generation: Markdown, JSON,
                                    and the styled HTML report (grade colors,
                                    glass-card UI).
      batch.js                     Batch mode: parses a .txt/.csv URL list, runs
                                    each audit sequentially, prints a comparison.
      batchReport.js / batchHtmlReport.js
                                    Persists the batch comparison as Markdown
                                    and HTML (same visual style as single-URL
                                    HTML reports).
      openReport.js                 Auto-opens the HTML report in the default
                                     browser after a single-URL audit.

    test/                            One file per module under test, run
                                      directly with node test/<name>.test.js
                                      (no test framework, plain assert).
                                      Run all: npm test.

    reports/                          Generated output (gitignored), HTML/MD/
                                       JSON per audit, plus batch-*.md/.html.

    sample-results/                    Curated, tracked sample audit data
                                        (cross-category comparison) kept for
                                        the final report, distinct from the
                                        gitignored reports/ folder.

## Data flow (single-URL audit)

    index.js -> url.js (normalize)
             -> cache.js (check for existing result)
             -> analyze.js (headless browser audit, if not cached)
             -> carbon.js (bytes -> energy -> CO2e -> grade)
             -> report.js / htmlReport.js (save MD + JSON + HTML)
             -> history.js (log the run)
             -> openReport.js (open HTML in browser)

## Data flow (batch audit)

    index.js -> batch.js: parseInputFile() -> [urls]
             -> for each url: same single-URL pipeline above (via auditOne)
             -> batchReport.js / batchHtmlReport.js: save combined comparison

## Adding a new metric or feature

1. If it's a new measurement, add it to analyze.js's returned data object.
2. If it affects the carbon estimate or grading, add it to carbon.js
   and expose any new constants via config.js / .green-auditrc.json
   rather than hardcoding, keeping it consistent with existing thresholds.
3. Update htmlReport.js (single-URL) and, if relevant, add a test.
4. Run npm test before committing. Every module in src/ that has
   pure/testable logic should have a matching file in test/.

## Running tests

    npm test

Runs, in order: config, history, carbon, url, batch (parsing + error
handling). Each file can also be run individually, e.g. node test/carbon.test.js.
