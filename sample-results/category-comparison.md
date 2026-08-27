# Sample Audit Results by Site Category

Real audit data collected with the batch-mode tool, comparing site categories
to illustrate how page weight and structure drive carbon footprint. Intended
as evidence/data for the final project report.

Date collected: 2026-08-27

## Results

| Category | URL | Grade | CO2e / view | Page Weight |
|---|---|---|---|---|
| News | https://www.bbc.com | C | 1.878 g | 5501.5 KB |
| News | https://www.reuters.com | A | 0.186 g | 543.4 KB |
| E-commerce | https://www.amazon.in | C | 2.044 g | 5987.9 KB |
| E-commerce | https://www.flipkart.com | B | 1.430 g | 4188.7 KB |
| Lightweight | https://example.com | A | 0.000 g | 0.5 KB |
| Lightweight | https://motherfuckingwebsite.com | A | 0.061 g | 179.3 KB |

## Observations

- **News and e-commerce sites carry the heaviest footprint** in this sample (1.4g–2.0g CO2e per view), driven almost entirely by page weight (4–6 MB) rather than DOM complexity or JS execution time alone — consistent with the tool's methodology, which weights transferred bytes most heavily in the carbon estimate.
- **Not all sites within a category are equal**: Reuters (0.186g) scores dramatically better than BBC (1.878g) despite both being major news outlets — a ~10x difference — suggesting asset optimization (image compression, script bundling) matters more than site category alone.
- **Lightweight/reference sites confirm the tool's baseline is sane**: example.com (a near-empty static page) scores essentially zero footprint, and a deliberately minimal real-world site (motherfuckingwebsite.com) still scores A with a small non-zero footprint — the grading scale behaves as expected at both extremes.

## Reproducing this data

```bash
node index.js batch sample-results/sample-sites.txt
```
