// src/carbon.js — now reads constants and grade thresholds from config
// (.green-auditrc.json), falling back to the original hard-coded defaults.
const { loadConfig } = require('./config');

function estimateCarbon(totalBytes, cfg = loadConfig()) {
  const gb = totalBytes / (1024 ** 3);
  const energyKwh = gb * cfg.carbon.energyPerGbKwh;
  const carbonGrams = energyKwh * cfg.carbon.gridCarbonIntensityGPerKwh;
  return { energyKwh, carbonGrams };
}

function getGrade(carbonGrams, cfg = loadConfig()) {
  const { grades, labels } = cfg;
  if (carbonGrams < grades.A) return { grade: 'A', label: labels.A };
  if (carbonGrams < grades.B) return { grade: 'B', label: labels.B };
  if (carbonGrams < grades.C) return { grade: 'C', label: labels.C };
  if (carbonGrams < grades.D) return { grade: 'D', label: labels.D };
  return { grade: 'F', label: labels.F };
}

module.exports = { estimateCarbon, getGrade };
