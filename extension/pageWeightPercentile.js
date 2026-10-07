// extension/pageWeightPercentile.js
//
// ES-module mirror of src/pageWeightPercentile.js -- the extension can't
// require() the CLI's CommonJS modules. Keep the two in sync;
// test/page-weight-percentile-sync.test.mjs fails if they drift.

// PUBLISHED FIGURES -- do not edit without a new source.
// Source: Web Almanac 2025, Chapter 14 "Page Weight", Figure 14.3
// "Page weight distribution by device" (desktop column), July 2025 crawl.
// https://almanac.httparchive.org/en/2025/page-weight
// KB here is KiB (bytes / 1024), matching the chapter's query
// (sql/2025/page-weight/bytes_per_type.sql) and this repo's formatting.
// Covers home and inner pages combined.
export const DESKTOP_PAGE_WEIGHT_KB = [
  { percentile: 10, kb: 607 },
  { percentile: 25, kb: 1275 },
  { percentile: 50, kb: 2412 },
  { percentile: 75, kb: 4570 },
  { percentile: 90, kb: 9179 },
];

const SOURCE_LABEL = 'desktop pages measured by HTTP Archive (Web Almanac 2025)';

/**
 * Returns where totalBytes falls in the desktop page-weight distribution.
 *
 * Only the five breakpoints above are published. Any percentile strictly
 * between two of them is an INTERPOLATED ESTIMATE: we interpolate linearly
 * in log(KB), since page weights are roughly log-normally distributed.
 *
 * Outside the published range (below p10 or above p90) no figures exist,
 * so instead of extrapolating we return a bound:
 *   bound: 'below' -> lighter than over 90% of pages
 *   bound: 'above' -> heavier than 90% of pages
 *
 * @param {number} totalBytes
 * @returns {{ kb: number, percentile: number|null, lighterThanPct: number|null, bound: 'below'|'above'|null }|null}
 *   null when totalBytes is missing or not positive.
 */
export function pageWeightPercentile(totalBytes) {
  if (typeof totalBytes !== 'number' || !Number.isFinite(totalBytes) || totalBytes <= 0) return null;

  const kb = totalBytes / 1024;
  const first = DESKTOP_PAGE_WEIGHT_KB[0];
  const last = DESKTOP_PAGE_WEIGHT_KB[DESKTOP_PAGE_WEIGHT_KB.length - 1];

  if (kb < first.kb) return { kb, percentile: null, lighterThanPct: null, bound: 'below' };
  if (kb > last.kb) return { kb, percentile: null, lighterThanPct: null, bound: 'above' };

  for (let i = 0; i < DESKTOP_PAGE_WEIGHT_KB.length - 1; i++) {
    const lo = DESKTOP_PAGE_WEIGHT_KB[i];
    const hi = DESKTOP_PAGE_WEIGHT_KB[i + 1];
    if (kb <= hi.kb) {
      // Interpolated estimate (exact only when kb equals a breakpoint).
      const t = (Math.log(kb) - Math.log(lo.kb)) / (Math.log(hi.kb) - Math.log(lo.kb));
      const percentile = Math.round(lo.percentile + t * (hi.percentile - lo.percentile));
      return { kb, percentile, lighterThanPct: 100 - percentile, bound: null };
    }
  }
  // Unreachable: kb is within [first.kb, last.kb].
  return null;
}

function formatWeight(bytes) {
  const kb = bytes / 1024;
  return kb >= 1024 ? `${(kb / 1024).toFixed(2)} MB` : `${kb.toFixed(1)} KB`;
}

/**
 * Human-readable comparison sentence, or null when totalBytes is unusable.
 * @param {number} totalBytes
 * @returns {string|null}
 */
export function describePageWeightPercentile(totalBytes) {
  const result = pageWeightPercentile(totalBytes);
  if (!result) return null;

  const size = formatWeight(totalBytes);
  if (result.bound === 'below') return `At ${size}, this page is lighter than over 90% of ${SOURCE_LABEL}.`;
  if (result.bound === 'above') return `At ${size}, this page is heavier than 90% of ${SOURCE_LABEL}.`;
  return `At ${size}, this page is lighter than about ${result.lighterThanPct}% of ${SOURCE_LABEL}.`;
}
