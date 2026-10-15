// The color slider's rules (utils/saturationLock.js), the fold of the old Grayscale switch into it
// (background/saturationMigration.js), and the Never setting for bookmark pills (utils/pillSelection.js).
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

const { planChange, activeLock, lockedMax, clampSaturation, legacySaturation, lockNote, lockSecondsLeft, startLock, LOCK_MS } = load("utils/saturationLock.js");
const NOW = 1_800_000_000_000;
const lockAt40 = { ceiling: 40, until: NOW + 10 * 60 * 1000, manual: true };

test("without a lock the slider moves freely, both ways, and nothing locks by itself", () => {
  assert.deepEqual(planChange({ current: 100, lock: null, target: 40, now: NOW }), { saturation: 40, lock: null, changed: true });
  assert.deepEqual(planChange({ current: 40, lock: null, target: 90, now: NOW }), { saturation: 90, lock: null, changed: true });
  assert.deepEqual(planChange({ current: 40, lock: null, target: 40, now: NOW }), { saturation: 40, lock: null, changed: false });
});

test("pressing the lock holds the level for 30 minutes", () => {
  assert.deepEqual(startLock(40, NOW), { ceiling: 40, until: NOW + LOCK_MS, manual: true });
  assert.equal(LOCK_MS, 30 * 60 * 1000);
  assert.equal(lockedMax(lockAt40, NOW), 40);
  assert.equal(lockedMax(null, NOW), 100);
});

test("while locked: going grayer works and lowers the ceiling, more color is refused, the time left stays", () => {
  const grayer = planChange({ current: 40, lock: lockAt40, target: 25, now: NOW });
  assert.deepEqual(grayer, { saturation: 25, lock: { ceiling: 25, until: lockAt40.until, manual: true }, changed: true }, "same end time");
  assert.deepEqual(planChange({ current: 40, lock: lockAt40, target: 70, now: NOW }), { saturation: 40, lock: lockAt40, changed: false });
  assert.deepEqual(planChange({ current: 25, lock: grayer.lock, target: 35, now: NOW }), { saturation: 25, lock: grayer.lock, changed: false }, "not even back up to where it was");
  assert.deepEqual(planChange({ current: 40, lock: lockAt40, target: 40, now: NOW }), { saturation: 40, lock: lockAt40, changed: false });
});

test("when the 30 minutes are up it frees itself", () => {
  const later = NOW + 11 * 60 * 1000;
  assert.equal(activeLock(lockAt40, later), null);
  assert.deepEqual(planChange({ current: 40, lock: lockAt40, target: 90, now: later }), { saturation: 90, lock: null, changed: true });
  assert.equal(lockedMax(lockAt40, later), 100);
});

test("an automatic lock from before (not pressed by hand) no longer holds", () => {
  const old = { ceiling: 40, until: NOW + 10 * 60 * 1000 };
  assert.equal(activeLock(old, NOW), null);
  assert.deepEqual(planChange({ current: 40, lock: old, target: 80, now: NOW }), { saturation: 80, lock: null, changed: true });
});

test("levels stay between 0 and 100; nonsense means full color", () => {
  assert.equal(clampSaturation(-5), 0);
  assert.equal(clampSaturation(140), 100);
  assert.equal(clampSaturation("55"), 55);
  assert.equal(clampSaturation("x"), 100);
  assert.equal(activeLock({ ceiling: "x", until: NOW + 1000 }, NOW), null, "a damaged lock does not lock");
  assert.equal(activeLock("nope", NOW), null);
});

test("the note says until when the lock holds, and the seconds left", () => {
  const fmt = (ms) => (ms === lockAt40.until ? "4:42 pm" : "?");
  assert.equal(lockNote(lockAt40, fmt, NOW), "Locked. You can go grayer, but not back above 40% until 4:42 pm.");
  assert.equal(lockNote(null, fmt, NOW), "");
  assert.equal(lockNote({ ceiling: 40, until: NOW - 1, manual: true }, fmt, NOW), "");
  assert.equal(lockSecondsLeft(lockAt40, NOW), 600);
  assert.equal(lockSecondsLeft(null, NOW), 0);
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
  const area = {
    get: (keys, cb) => { const out = {}; for (const k of [].concat(keys)) if (k in data) out[k] = data[k]; cb(out); },
    set: (items, cb) => { Object.assign(data, items); cb(); },
    remove: (keys, cb) => { for (const k of [].concat(keys)) delete data[k]; cb(); },
  };
  globalThis.chrome = { storage: { sync: area }, runtime: {} };
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

test("the pills setting Never shows no pills, not even after ./", () => {
  const { modeForInput } = load("utils/pillSelection.js");
  assert.equal(modeForInput("net", "never"), null);
  assert.equal(modeForInput("./net", "never"), null);
  assert.notEqual(modeForInput("./net", "prefix"), null, "When typing ./ still works");
  assert.notEqual(modeForInput("net", "always"), null, "Always still works");
});
