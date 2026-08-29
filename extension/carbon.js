// carbon.js — ported from the CLI's src/carbon.js so the extension uses
// the exact same math and default constants. Kept as a plain ES module
// (no config-file loading here, since an extension has no filesystem) —
// if these constants change in .green-auditrc.json defaults, update here
// too so the two stay in sync.

export const DEFAULTS = {
  carbon: {
    energyPerGbKwh: 0.81,
    gridCarbonIntensityGPerKwh: 442,
  },
  grades: { A: 0.5, B: 1.5, C: 3.5, D: 6.5 },
  labels: {
    A: 'Excellent — well below average',
    B: 'Good — near typical average',
    C: 'Fair — above average footprint',
    D: 'Poor — high footprint',
    F: 'Very poor — significant optimization needed',
  },
};

export function estimateCarbon(totalBytes, cfg = DEFAULTS) {
  const gb = totalBytes / (1024 ** 3);
  const energyKwh = gb * cfg.carbon.energyPerGbKwh;
  const carbonGrams = energyKwh * cfg.carbon.gridCarbonIntensityGPerKwh;
  return { energyKwh, carbonGrams };
}

export function getGrade(carbonGrams, cfg = DEFAULTS) {
  const { grades, labels } = cfg;
  if (carbonGrams < grades.A) return { grade: 'A', label: labels.A };
  if (carbonGrams < grades.B) return { grade: 'B', label: labels.B };
  if (carbonGrams < grades.C) return { grade: 'C', label: labels.C };
  if (carbonGrams < grades.D) return { grade: 'D', label: labels.D };
  return { grade: 'F', label: labels.F };
}
