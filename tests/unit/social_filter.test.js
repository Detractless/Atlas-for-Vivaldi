// The social media filter's rules (utils/socialFilter.js) and its Focus lock (utils/focusLock.js): the list of parts, what
// a saved value is made into, and what counts as loosening it. The Settings page around it: settings_social_filter.test.js.
// Bundled to CommonJS and run as plain code.
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

const F = load("utils/socialFilter.js");
const L = load("utils/focusLock.js");
const NOW = 1_800_000_000_000;
const locked = { socialFilter: { unlockAt: null } };
const ok = (from, to) => L.changeAllowed(locked, "socialFilter", from, to, NOW);

test("the parts: four groups, twenty parts, each with a name, a line about it and the sites planned", () => {
  assert.deepEqual(F.GROUPS.map((g) => g.label), ["Feeds", "Video", "Interaction", "Numbers and alerts"]);
  assert.equal(F.PARTS.length, 20);
  assert.equal(new Set(F.PART_IDS).size, 20, "every id is its own");
  for (const p of F.PARTS) {
    assert.ok(p.label && p.desc, `${p.id} has a name and a line about it`);
    assert.ok(p.sites.length > 0 && p.sites.every(Boolean), `${p.id} names the sites it is planned for`);
  }
  assert.equal(F.partOf("shortVideos").label, "Short videos");
  assert.equal(F.partOf("nope"), null);
});

test("normalize: a known mode, and known part ids once each in the page's order; anything else is dropped", () => {
  assert.deepEqual(F.normalize(undefined), { mode: "off", parts: [] });
  assert.deepEqual(F.normalize("parts"), { mode: "off", parts: [] }, "a bare string is not a setting");
  assert.deepEqual(F.normalize({ mode: "toString", parts: "likes" }), { mode: "off", parts: [] }, "no inherited names, no non-lists");
  assert.deepEqual(F.normalize({ mode: "parts", parts: ["comments", "likes", "likes", "bogus"] }), { mode: "parts", parts: ["likes", "comments"] });
  assert.deepEqual(F.normalize({ mode: "all" }), { mode: "all", parts: [] });
});

test("togglePart and withMode: change one thing, keep the rest in order", () => {
  const a = F.togglePart({ mode: "parts", parts: ["comments"] }, "likes");
  assert.deepEqual(a, { mode: "parts", parts: ["likes", "comments"] });
  assert.deepEqual(F.togglePart(a, "comments"), { mode: "parts", parts: ["likes"] });
  assert.deepEqual(F.togglePart(a, "bogus"), a, "an unknown part changes nothing");
  assert.deepEqual(F.withMode(a, "all"), { mode: "all", parts: ["likes", "comments"] }, "the chosen parts are kept while the mode is another");
});

test("looser: a lower mode, or the same Parts mode with a chosen part dropped", () => {
  const parts = (...p) => ({ mode: "parts", parts: p });
  assert.equal(F.looser(parts("likes"), { mode: "off", parts: ["likes"] }), true);
  assert.equal(F.looser({ mode: "all", parts: [] }, parts("likes")), true);
  assert.equal(F.looser({ mode: "all", parts: [] }, { mode: "off", parts: [] }), true);
  assert.equal(F.looser(parts("likes", "comments"), parts("likes")), true, "dropping a part");
  assert.equal(F.looser(parts("likes"), parts("comments")), true, "swapping one part for another still drops one");
  assert.equal(F.looser(parts("likes"), parts("likes", "comments")), false, "adding a part");
  assert.equal(F.looser(parts("likes"), { mode: "all", parts: [] }), false, "everything is stricter than some parts");
  assert.equal(F.looser({ mode: "off", parts: [] }, parts("likes")), false);
  assert.equal(F.looser({ mode: "off", parts: ["likes"] }, { mode: "off", parts: [] }), false, "parts are not in force while Off");
  assert.equal(F.looser({ mode: "all", parts: [] }, { mode: "all", parts: [] }), false);
});

test("locked, the filter can only get stricter; unlocked, anything goes", () => {
  assert.equal(ok({ mode: "parts", parts: ["likes"] }, { mode: "off", parts: ["likes"] }), false, "it can't be turned off");
  assert.equal(ok({ mode: "all", parts: [] }, { mode: "parts", parts: ["likes"] }), false, "all can't go back to some");
  assert.equal(ok({ mode: "parts", parts: ["likes"] }, { mode: "parts", parts: [] }), false, "a chosen part can't be unchosen");
  assert.equal(ok({ mode: "parts", parts: ["likes"] }, { mode: "parts", parts: ["likes", "comments"] }), true, "another can be added");
  assert.equal(ok({ mode: "parts", parts: ["likes"] }, { mode: "all", parts: ["likes"] }), true);
  assert.equal(ok(undefined, { mode: "parts", parts: [] }), true, "nothing saved means Off, and anything is stricter");
  assert.equal(ok({ mode: "off", parts: [] }, { mode: "off", parts: [] }), true);
  assert.equal(L.changeAllowed({}, "socialFilter", { mode: "all", parts: [] }, { mode: "off", parts: [] }, NOW), true, "no lock: no rule");
  const unlocking = { socialFilter: { unlockAt: NOW + 5 * 60 * 1000 } };
  assert.equal(L.changeAllowed(unlocking, "socialFilter", { mode: "all", parts: [] }, { mode: "off", parts: [] }, NOW), false, "still locked while it unlocks");
});

test("a profile or a backup can't loosen a locked filter, and its lock is kept like the others", () => {
  const current = { socialFilter: { mode: "parts", parts: ["likes"] }, tabLimit: 5 };
  assert.deepEqual(L.withoutLoosening({ socialFilter: { mode: "off", parts: [] }, tabLimit: 9 }, current, locked, NOW), { tabLimit: 9 });
  const stricter = { socialFilter: { mode: "all", parts: [] } };
  assert.deepEqual(L.withoutLoosening(stricter, current, locked, NOW), stricter);
  assert.ok(L.LOCKABLE.includes("socialFilter"));
  assert.deepEqual(L.clickLock({}, "socialFilter", NOW), { socialFilter: { unlockAt: null } });
  assert.equal(L.lockState(L.clickLock({}, "socialFilter", NOW), "socialFilter", NOW), "held");
});
