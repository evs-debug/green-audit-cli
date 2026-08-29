// src/config.js — Member 4: Config File Support
// Reads thresholds from .green-auditrc.json (repo root or any parent folder).
// Anything missing from the file falls back to the defaults below, which
// mirror the numbers previously hard-coded in carbon.js and index.js.

const fs = require('fs');
const path = require('path');

const CONFIG_FILENAME = '.green-auditrc.json';

const DEFAULTS = {
  carbon: {
    energyPerGbKwh: 0.81,            // kWh per GB transferred
    gridCarbonIntensityGPerKwh: 442  // grams CO2e per kWh
  },
  // Upper bound (exclusive) in grams CO2e per page view. Anything >= D bound => F
  grades: {
    A: 0.5,
    B: 1.5,
    C: 3.5,
    D: 6.5
  },
  labels: {
    A: 'Excellent — well below average',
    B: 'Good — near typical average',
    C: 'Fair — above average footprint',
    D: 'Poor — high footprint',
    F: 'Very poor — significant optimization needed'
  },
  dom: {
    highComplexityNodes: 1500 // DOM node count above which we warn
  },
  cache: {
    ttlHours: 24 // cached audits older than this are treated as a miss
                 // and re-audited, rather than trusted indefinitely
  }
};

function deepMerge(base, override) {
  if (!override || typeof override !== 'object' || Array.isArray(override)) return base;
  const out = { ...base };
  for (const key of Object.keys(override)) {
    const b = base[key];
    const o = override[key];
    out[key] =
      b && typeof b === 'object' && !Array.isArray(b) && o && typeof o === 'object' && !Array.isArray(o)
        ? deepMerge(b, o)
        : o;
  }
  return out;
}

function findConfigFile(startDir = process.cwd()) {
  let dir = path.resolve(startDir);
  for (;;) {
    const candidate = path.join(dir, CONFIG_FILENAME);
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function validate(cfg) {
  if (cfg.grades) {
    let prev = -Infinity;
    for (const g of ['A', 'B', 'C', 'D']) {
      if (cfg.grades[g] === undefined) continue;
      if (typeof cfg.grades[g] !== 'number') throw new Error(`grades.${g} must be a number`);
      if (cfg.grades[g] <= prev) throw new Error('grades must be strictly ascending (A < B < C < D)');
      prev = cfg.grades[g];
    }
  }
  for (const key of ['carbon', 'labels', 'dom', 'cache']) {
    if (cfg[key] !== undefined && (typeof cfg[key] !== 'object' || Array.isArray(cfg[key]))) {
      throw new Error(`${key} must be an object`);
    }
  }
  if (cfg.cache && cfg.cache.ttlHours !== undefined) {
    if (typeof cfg.cache.ttlHours !== 'number' || cfg.cache.ttlHours <= 0) {
      throw new Error('cache.ttlHours must be a positive number');
    }
  }
}

let cached = null;

/**
 * Load merged config. Never throws: a bad file prints a warning and defaults are used.
 * @param {{ configPath?: string, cwd?: string, fresh?: boolean }} options
 */
function loadConfig(options = {}) {
  if (cached && !options.fresh && !options.configPath && !options.cwd) return cached;

  const file = options.configPath ? path.resolve(options.configPath) : findConfigFile(options.cwd);
  let result;
  if (!file) {
    result = { ...deepMerge(DEFAULTS, {}), _source: 'defaults' };
  } else {
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      validate(parsed);
      result = { ...deepMerge(DEFAULTS, parsed), _source: file };
    } catch (err) {
      console.warn(`⚠️  Could not use ${file}: ${err.message}. Falling back to defaults.`);
      result = { ...deepMerge(DEFAULTS, {}), _source: 'defaults (config invalid)' };
    }
  }
  if (!options.configPath && !options.cwd) cached = result;
  return result;
}

/** Create a starter .green-auditrc.json in cwd. */
function writeSampleConfig(dir = process.cwd()) {
  const target = path.join(dir, CONFIG_FILENAME);
  if (fs.existsSync(target)) {
    console.log(`${CONFIG_FILENAME} already exists at ${target}`);
    return target;
  }
  fs.writeFileSync(target, JSON.stringify(DEFAULTS, null, 2) + '\n');
  console.log(`✅ Created ${target} — edit it to change thresholds.`);
  return target;
}

module.exports = { CONFIG_FILENAME, DEFAULTS, loadConfig, findConfigFile, writeSampleConfig };
