# Green-Computing Audit Tool

A CLI tool that performs static and dynamic analysis of a webpage's loading cycle — calculating data payload size, JS execution energy drain, and DOM complexity, then converting these into an estimated carbon footprint per page view.

## Status
🚧 In early development.

## Methodology

The tool loads a page in a headless Chromium browser and intercepts every network response to measure total bytes transferred. It also captures DOM node count (structural complexity) and JS heap/script execution time via Chrome's performance metrics. To convert bytes into a carbon estimate, we use the Sustainable Web Design model's energy intensity figure — approximately 0.81 kWh per GB transferred (covering data center, network transmission, and end-user device energy) — multiplied by a global average grid carbon intensity of ~442g CO2e per kWh. This gives a per-page-view estimate in grams of CO2e, which can be compared across sites or before/after optimizations.
