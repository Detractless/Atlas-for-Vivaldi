// The locks on Settings > Focus (utils/focusLock.js): you lock it, while locked it can only get stricter,
// clicking again starts a 30-minute unlock, clicking during it keeps it locked. Also the queued changes from the
// version before, which still finish unless locked since (background/pendingChanges.js).
// The Settings page around them: settings_focus_locks.test.js. Bundled to CommonJS and run as plain code.
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

const L = load("utils/focusLock.js");
const NOW = 1_800_000_000_000;
const MIN = 60 * 1000;

test("nothing is locked until you lock it, and unlocked everything moves both ways", () => {
  for (const key of L.LOCKABLE) assert.equal(L.lockState({}, key, NOW), "open", key);
  assert.equal(L.lockState(undefined, "saturation", NOW), "open");
  assert.equal(L.changeAllowed({}, "tabLimit", 5, 9, NOW), true);
  assert.equal(L.changeAllowed(null, "searchDelaySeconds", 30, 0, NOW), true);
  assert.equal(L.changeAllowed({}, "saturation", 20, 100, NOW), true);
});

test("clicking the lock: open, locked, unlocking for 30 minutes, and clicking again keeps it locked", () => {
  let locks = L.clickLock({}, "searchDelaySeconds", NOW);
  assert.deepEqual(locks, { searchDelaySeconds: { unlockAt: null } });
  assert.equal(L.lockState(locks, "searchDelaySeconds", NOW + 365 * 24 * 60 * MIN), "held", "it never unlocks by itself");
  locks = L.clickLock(locks, "searchDelaySeconds", NOW);
  assert.deepEqual(locks, { searchDelaySeconds: { unlockAt: NOW + 30 * MIN } });
  assert.equal(L.UNLOCK_MS, 30 * MIN);
  assert.equal(L.lockState(locks, "searchDelaySeconds", NOW + 29 * MIN), "unlocking");
  assert.equal(L.unlockSecondsLeft(locks, "searchDelaySeconds", NOW + 29 * MIN), 60);
  assert.equal(L.unlockTime(locks, "searchDelaySeconds", NOW), NOW + 30 * MIN);
  assert.deepEqual(L.clickLock(locks, "searchDelaySeconds", NOW + 5 * MIN), { searchDelaySeconds: { unlockAt: null } }, "a click while unlocking: locked again");
  assert.equal(L.lockState(locks, "searchDelaySeconds", NOW + 30 * MIN), "open", "when the 30 minutes are up it is unlocked");
  assert.equal(L.unlockSecondsLeft(locks, "searchDelaySeconds", NOW + 30 * MIN), 0);
  assert.deepEqual(L.clickLock(locks, "searchDelaySeconds", NOW + 31 * MIN), { searchDelaySeconds: { unlockAt: null } }, "and the next click locks it again");
});

test("each lock is its own: clicking one leaves the others as they are", () => {
  const locks = { tabLimit: { unlockAt: null }, saturation: { unlockAt: NOW + 10 * MIN } };
  assert.deepEqual(L.clickLock(locks, "searchDelaySeconds", NOW), { ...locks, searchDelaySeconds: { unlockAt: null } });
});

test("locked, a setting can only get stricter: fewer tabs, a longer delay, grayer", () => {
  const all = { tabLimit: { unlockAt: null }, searchDelaySeconds: { unlockAt: null }, saturation: { unlockAt: null } };
  const ok = (key, from, to) => L.changeAllowed(all, key, from, to, NOW);
  assert.equal(ok("tabLimit", 5, 3), true);
  assert.equal(ok("tabLimit", 5, 8), false);
  assert.equal(ok("tabLimit", 5, 0), false, "Off is no limit: the loosest of all");
  assert.equal(ok("tabLimit", 0, 10), true, "from Off, any limit is stricter");
  assert.equal(ok("tabLimit", undefined, 6), true, "nothing saved means Off");
  assert.equal(ok("searchDelaySeconds", 15, 60), true);
  assert.equal(ok("searchDelaySeconds", 60, 15), false);
  assert.equal(ok("searchDelaySeconds", 15, 0), false, "Off is no delay");
  assert.equal(ok("saturation", 40, 20), true);
  assert.equal(ok("saturation", 40, 60), false);
  assert.equal(ok("saturation", undefined, 100), true, "nothing saved means full color: staying there is fine");
  for (const key of L.LOCKABLE) assert.equal(ok(key, 7, 7), true, `${key}: no change is always fine`);
  assert.equal(L.changeAllowed({ searchDelaySeconds: { unlockAt: NOW + MIN } }, "searchDelaySeconds", 60, 15, NOW), false, "unlocking still holds");
});

test("damaged locks: a bad time stays locked until clicked; anything else that isn't a lock is ignored", () => {
  assert.equal(L.lockState({ tabLimit: { unlockAt: "soon" } }, "tabLimit", NOW), "held");
  assert.equal(L.lockState({ tabLimit: true }, "tabLimit", NOW), "open");
  assert.equal(L.lockState("nope", "tabLimit", NOW), "open");
  assert.deepEqual(L.clickLock({ tabLimit: { unlockAt: "soon" } }, "tabLimit", NOW), { tabLimit: { unlockAt: NOW + 30 * MIN } });
  assert.deepEqual(L.tidyLocks({ tabLimit: { unlockAt: NOW - 1 }, saturation: { unlockAt: "x" }, other: { unlockAt: null } }, NOW),
    { saturation: { unlockAt: null } }, "ended and unknown locks are dropped");
});

test("a profile's values or a backup can't loosen a locked setting; stricter ones and unlocked ones come in", () => {
  const locks = { searchDelaySeconds: { unlockAt: null }, saturation: { unlockAt: NOW + MIN } };
  const current = { searchDelaySeconds: 60, saturation: 40, tabLimit: 5 };
  assert.deepEqual(L.withoutLoosening({ searchDelaySeconds: 15, saturation: 30, tabLimit: 0, Theme: "x" }, current, locks, NOW),
    { saturation: 30, tabLimit: 0, Theme: "x" });
  assert.deepEqual(L.withoutLoosening({ searchDelaySeconds: 120, saturation: 90 }, current, locks, NOW), { searchDelaySeconds: 120 });
});

test("an old color lock carries on until it would have ended", () => {
  assert.deepEqual(L.fromSaturationLock({ ceiling: 40, until: NOW + MIN, manual: true }, NOW), { unlockAt: NOW + MIN });
  assert.equal(L.fromSaturationLock({ ceiling: 40, until: NOW - 1, manual: true }, NOW), null, "already over");
  assert.equal(L.fromSaturationLock({ ceiling: 40, until: NOW + MIN }, NOW), null, "an automatic one never held");
  assert.equal(L.fromSaturationLock(null, NOW), null);
});

test("a change queued by the version before finishes on time, unless the setting has been locked since", async () => {
  const data = {
    tabLimit: 3, pendingIncrease: { targetLimit: 8, startTime: Date.now() - 31 * MIN },
    searchDelaySeconds: 60, pendingDelayDecrease: { targetDelay: 15, startTime: Date.now() - 31 * MIN },
    focusLocks: { searchDelaySeconds: { unlockAt: null } },
  };
  const area = {
    get: (keys, cb) => { const out = {}; for (const k of [].concat(keys)) if (k in data) out[k] = data[k]; cb(out); },
    set: (items, cb) => { Object.assign(data, items); cb(); },
    remove: (keys, cb) => { for (const k of [].concat(keys)) delete data[k]; cb(); },
  };
  globalThis.chrome = { storage: { sync: area, local: area }, runtime: {}, tabs: { query: (q, cb) => (cb ? cb([]) : Promise.resolve([])) } };
  const { checkPendingIncrease, checkPendingDelayDecrease } = load("background/pendingChanges.js");
  await checkPendingIncrease();
  await checkPendingDelayDecrease();
  assert.equal(data.tabLimit, 8, "the tab limit is unlocked: its queued increase finishes");
  assert.equal(data.searchDelaySeconds, 60, "the delay was locked since: its queued decrease is dropped");
  assert.equal("pendingIncrease" in data || "pendingDelayDecrease" in data, false, "both queues are cleared");
  delete globalThis.chrome;
});
