// The color slider's rules (utils/saturationLock.js), the folds of old settings into it
// (background/saturationMigration.js), and the Never setting for bookmark pills (utils/pillSelection.js).
// The lock itself is shared with the tab limit and the delay: focus_lock.test.js.
// These source files are ES modules, so each is bundled to CommonJS here and run as plain code.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const esbuild = require("esbuild");

const SRC = path.join(__dirname, "..", "..", "payload", "detractless", "src");
function load(rel) {
  const out = esbuild.buildSync({ entryPoints: [path.join(SRC, rel)], bundle: true, format: "cjs", platform: "node", write: false }).outputFiles[0].text;
  const m = { exports: {} };
  new Function("module", "exports", "require", out)(m, m.exports, require);
  return m.exports;
}

const { planChange, clampSaturation, legacySaturation } = load("utils/saturationLock.js");
const NOW = 1_800_000_000_000;
const locked = { saturation: { unlockAt: null } };

/** A chrome.storage.sync stand-in holding `data`. */
function fakeSync(data) {
  const area = {
    get: (keys, cb) => { const out = {}; for (const k of [].concat(keys)) if (k in data) out[k] = data[k]; cb(out); },
    set: (items, cb) => { Object.assign(data, items); cb(); },
    remove: (keys, cb) => { for (const k of [].concat(keys)) delete data[k]; cb(); },
  };
  globalThis.chrome = { storage: { sync: area }, runtime: {} };
}

test("without a lock the slider moves freely, both ways", () => {
  assert.deepEqual(planChange({ current: 100, locks: null, target: 40, now: NOW }), { saturation: 40, changed: true });
  assert.deepEqual(planChange({ current: 40, locks: {}, target: 90, now: NOW }), { saturation: 90, changed: true });
  assert.deepEqual(planChange({ current: 40, locks: null, target: 40, now: NOW }), { saturation: 40, changed: false });
});

test("while locked: going grayer works, more color is refused, however long it has been locked", () => {
  assert.deepEqual(planChange({ current: 40, locks: locked, target: 25, now: NOW }), { saturation: 25, changed: true });
  assert.deepEqual(planChange({ current: 25, locks: locked, target: 35, now: NOW }), { saturation: 25, changed: false }, "not even back up to where it was");
  assert.deepEqual(planChange({ current: 40, locks: locked, target: 70, now: NOW + 365 * 864e5 }), { saturation: 40, changed: false }, "a year later: still locked");
});

test("while unlocking it still holds; when the 30 minutes are up it moves freely again", () => {
  const unlocking = { saturation: { unlockAt: NOW + 60 * 1000 } };
  assert.deepEqual(planChange({ current: 40, locks: unlocking, target: 70, now: NOW }), { saturation: 40, changed: false });
  assert.deepEqual(planChange({ current: 40, locks: unlocking, target: 70, now: NOW + 61 * 1000 }), { saturation: 70, changed: true });
});

test("levels stay between 0 and 100; nonsense means full color", () => {
  assert.equal(clampSaturation(-5), 0);
  assert.equal(clampSaturation(140), 100);
  assert.equal(clampSaturation("55"), 55);
  assert.equal(clampSaturation("x"), 100);
});

test("settings from before the slider: the level that was showing is kept", () => {
  assert.equal(legacySaturation(true, 30), 30, "switch on: the saved level");
  assert.equal(legacySaturation(true, undefined), 0, "switch on, no level: fully gray, as it was");
  assert.equal(legacySaturation(false, 0), 100, "switch off: full color, whatever level was left behind");
  assert.equal(legacySaturation(undefined, 20), undefined, "no old switch: nothing to fold");
  assert.equal(legacySaturation(null, 20), undefined);
});

test("the service worker folds the old Grayscale switch into the slider once, then drops it", async () => {
  const data = { grayscale: true, saturation: 30 };
  fakeSync(data);
  const { migrateGrayscale } = load("background/saturationMigration.js");
  await migrateGrayscale();
  assert.deepEqual(data, { saturation: 30 });
  data.grayscale = false; data.saturation = 0;
  await migrateGrayscale();
  assert.deepEqual(data, { saturation: 100 }, "switch off became full color");
  await migrateGrayscale();
  assert.deepEqual(data, { saturation: 100 }, "nothing left to fold: nothing changes");
  delete globalThis.chrome;
});

test("a color lock running when you update becomes a Focus lock that unlocks when it would have ended", async () => {
  const until = Date.now() + 10 * 60 * 1000;
  const data = { saturation: 40, saturationLock: { ceiling: 40, until, manual: true }, focusLocks: { searchDelaySeconds: { unlockAt: null } } };
  fakeSync(data);
  const { migrateSaturationLock } = load("background/saturationMigration.js");
  await migrateSaturationLock();
  assert.deepEqual(data, { saturation: 40, focusLocks: { searchDelaySeconds: { unlockAt: null }, saturation: { unlockAt: until } } }, "the other locks are kept");
  data.saturationLock = { ceiling: 40, until: Date.now() - 1, manual: true };
  await migrateSaturationLock();
  assert.equal("saturationLock" in data, false, "a finished one is just removed");
  data.saturationLock = null;
  await migrateSaturationLock();
  assert.equal("saturationLock" in data, false, "so is an empty one");
  assert.deepEqual(data.focusLocks.saturation, { unlockAt: until }, "and nothing else changes");
  delete globalThis.chrome;
});

test("the pills setting Never shows no pills, not even after ./", () => {
  const { modeForInput } = load("utils/pillSelection.js");
  assert.equal(modeForInput("net", "never"), null);
  assert.equal(modeForInput("./net", "never"), null);
  assert.notEqual(modeForInput("./net", "prefix"), null, "When typing ./ still works");
  assert.notEqual(modeForInput("net", "always"), null, "Always still works");
});
