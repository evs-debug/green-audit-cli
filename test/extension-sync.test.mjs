// Run: node test/extension-sync.test.mjs
//
// The extension has no filesystem access to require() the CLI's
// src/config.js, so extension/carbon.js keeps a manually-duplicated
// copy of DEFAULTS. This test catches silent drift between the two --
// if someone updates one without the other, this fails loudly instead
// of the mismatch being discovered by a confused user comparing
// CLI vs extension results.
//
// Written as .mjs (real ESM) specifically so it can import the
// extension's carbon.js directly, unmodified -- not a copy-pasted
// stand-in for it.

import assert from 'assert';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const cliConfigModule = await import(path.join(__dirname, '..', 'src', 'config.js'));
const cliDefaults = cliConfigModule.default.DEFAULTS;

const extCarbonModule = await import(path.join(__dirname, '..', 'extension', 'carbon.js'));
const extDefaults = extCarbonModule.DEFAULTS;

assert.deepStrictEqual(
  extDefaults.carbon,
  cliDefaults.carbon,
  'extension/carbon.js DEFAULTS.carbon has drifted from src/config.js DEFAULTS.carbon'
);
assert.deepStrictEqual(
  extDefaults.grades,
  cliDefaults.grades,
  'extension/carbon.js DEFAULTS.grades has drifted from src/config.js DEFAULTS.grades'
);
assert.deepStrictEqual(
  extDefaults.labels,
  cliDefaults.labels,
  'extension/carbon.js DEFAULTS.labels has drifted from src/config.js DEFAULTS.labels'
);

console.log('✅ extension/CLI constant-sync test passed');
