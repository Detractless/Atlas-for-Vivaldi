// Scroll fade's setting and rules (utils/scrollFade.js), and that the page script (components/atlas/atlas-scroll-fade.js),
// the window's layer (src/modules/36-scroll-fade-layer.js) and profiles (pages/newtab/profilesCore.js), which repeat them
// in their own words, agree. Bundled to CommonJS and run as plain code.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const esbuild = require("esbuild");
const { JSDOM } = require("jsdom");
const { makeFakeChrome } = require("./helpers/fakeChrome");
const { openWindow } = require("./helpers/windowDom");

const ROOT = path.join(__dirname, "..", "..");
const SRC = path.join(ROOT, "payload", "detractless", "src");
function load(rel) {
  const out = esbuild.buildSync({ entryPoints: [path.join(SRC, rel)], bundle: true, format: "cjs", platform: "node", write: false }).outputFiles[0].text;
  const m = { exports: {} };
  new Function("module", "exports", "require", out)(m, m.exports, require);
  return m.exports;
}
const R = load("utils/scrollFade.js");
const KEYS = JSON.parse(fs.readFileSync(path.join(SRC, "constants", "atlasKeys.json"), "utf8"));
const plain = (v) => JSON.parse(JSON.stringify(v));

/** The page script's own copies, taken from a page it ran in. */
function pageCopy() {
  const dom = new JSDOM("<!DOCTYPE html><body></body>", { url: "https://www.reddit.com/", runScripts: "outside-only" });
  dom.window.chrome = makeFakeChrome(dom.window, {}).chrome;
  dom.window.eval(fs.readFileSync(path.join(ROOT, "payload", "install-files", "components", "atlas", "atlas-scroll-fade.js"), "utf8"));
  const inner = dom.window.__atlasScrollFade.internals;
  dom.window.close();
  return inner;
}
/** profilesCore.js's copy of the lock rule, taken from a profile switch: the keys a locked switch would keep. */
function profileKeeps(live, snap, locks) {
  const src = fs.readFileSync(path.join(SRC, "pages", "newtab", "profilesCore.js"), "utf8");
  const m = /var LOCK_DEFAULTS[\s\S]*?function lockedLooser\(snap, live, keys\) \{[\s\S]*?\r?\n  \}\r?\n/.exec(src);
  assert.ok(m, "profilesCore.js still has its lock rule in one block");
  return new Function(`${m[0]}; return lockedLooser;`)()(snap, { ...live, focusLocks: locks }, ["scrollFade"]).length === 1;
}

const SAMPLES = [
  undefined, null, "x", 5, [], {}, { on: true }, { on: "yes" }, { on: true, by: "time" }, { on: true, by: "nope" },
  { minutes: 0 }, { minutes: 9999 }, { minutes: "7" }, { minutes: "abc" }, { screens: 1 }, { screens: 99999 }, { screens: 80.5 },
  { darkest: 0 }, { darkest: 100 }, { darkest: 45 }, { restSeconds: 1 }, { restSeconds: 100000 }, { restSeconds: 45 },
  { waitMinutes: 0 }, { waitMinutes: 99999 }, { waitMinutes: "15" }, { waitMinutes: "abc" },
  { except: [] }, { except: ["Reddit.com", "https://www.YouTube.com/watch?v=1", "reddit.com", "nope", "", 5, null, "a.b"] },
  { except: "reddit.com" }, { except: Array.from({ length: 80 }, (_, i) => `site${i}.com`) },
  { where: "all", sites: ["x.com"] },
];

test("the setting is made safe: known values, numbers inside their range, sites as clean host names once each", () => {
  assert.deepEqual(R.normalize(undefined), { on: false, by: "either", minutes: 5, screens: 150, darkest: 70, restSeconds: 60, waitMinutes: 10, except: [] });
  assert.deepEqual(R.normalize({ on: "yes" }).on, false, "only a real true switches it on");
  assert.equal(R.normalize({ by: "nope" }).by, "either");
  assert.deepEqual([R.normalize({ minutes: 0 }).minutes, R.normalize({ minutes: 9999 }).minutes, R.normalize({ minutes: "7" }).minutes, R.normalize({ minutes: "abc" }).minutes], [1, 240, 7, 5]);
  assert.deepEqual([R.normalize({ waitMinutes: 0 }).waitMinutes, R.normalize({ waitMinutes: 9999 }).waitMinutes, R.normalize({ waitMinutes: "15" }).waitMinutes, R.normalize({ waitMinutes: "abc" }).waitMinutes], [1, 240, 15, 10]);
  assert.deepEqual([R.normalize({ darkest: 0 }).darkest, R.normalize({ darkest: 100 }).darkest], [10, 90], "never fully black, never barely there");
  assert.deepEqual(R.normalize({ except: ["Reddit.com", "https://www.YouTube.com/watch?v=1", "reddit.com", "nope", "", 5, null, "a.b"] }).except, ["reddit.com", "youtube.com", "a.b"]);
  assert.deepEqual(R.normalize({ except: "reddit.com" }).except, [], "damaged: nothing left alone");
  assert.equal(R.normalize({ except: Array.from({ length: 80 }, (_, i) => `site${i}.com`) }).except.length, 60);
  assert.deepEqual(R.normalize(R.normalize({ on: true, except: ["x.com"] })), R.normalize({ on: true, except: ["x.com"] }), "safe twice is safe once");
  assert.equal("where" in R.normalize({ where: "all", sites: ["x.com"] }), false, "the old list of sites is dropped");
  assert.deepEqual([R.cleanSite("  HTTP://m.Reddit.com:8080/r/all?x=1#y "), R.cleanSite("localhost"), R.cleanSite("a b.com"), R.cleanSite(null)], ["m.reddit.com", null, null, null]);
});

test("every site is dimmed unless excepted, and atlasKeys.json says so", () => {
  assert.deepEqual(R.DEFAULTS.except, [], "nothing is left alone to start with");
  assert.deepEqual(KEYS.sync.scrollFade.default, R.DEFAULTS, "the saved default and the code's agree");
  assert.equal(KEYS.sync.scrollFade.profile, "focus");
  assert.equal(KEYS.sync.scrollFade.backup, true);
  assert.equal(KEYS.local.atlas_scroll_fade.backup, false, "the total is never backed up");
  assert.equal(R.DEFAULTS.on, false, "off until you switch it on");
  assert.equal(R.DEFAULTS.waitMinutes, 10);
});

test("how dark: the darkest, times how far along time or distance is, whichever counts", () => {
  const at = (cfg, minutes, screens) => Math.round(R.amount(cfg, minutes * 60000, screens) * 1000) / 1000;
  assert.equal(at({}, 0, 0), 0);
  assert.equal(at({}, 2.5, 0), 0.35);
  assert.equal(at({}, 0, 75), 0.35);
  assert.equal(at({}, 1, 75), 0.35, "the further along wins");
  assert.equal(at({}, 4, 75), 0.56);
  assert.equal(at({ by: "time" }, 1, 150), 0.14, "by time, distance does nothing");
  assert.equal(at({ by: "distance" }, 60, 15), 0.07, "by distance, time does nothing");
  assert.equal(at({}, 100, 1000), 0.7, "never past the darkest");
  assert.equal(at({ darkest: 40, minutes: 10 }, 5, 0), 0.2);
  assert.equal(R.progress({}, 150000, 0), 0.5);
  assert.equal(R.progress({}, 1e9, 1e9), 1);
});

test("which sites it works on: every one when it is on, except the ones left alone and their subdomains", () => {
  const on = { on: true };
  assert.equal(R.appliesTo({ on: false }, "reddit.com"), false);
  assert.equal(R.appliesTo(on, "www.reddit.com"), true);
  assert.equal(R.appliesTo(on, "docs.example.com"), true);
  assert.equal(R.appliesTo({ ...on, except: ["example.com"] }, "docs.example.com"), false, "a subdomain of an excepted site");
  assert.equal(R.appliesTo({ ...on, except: ["example.com"] }, "www.example.com"), false);
  assert.equal(R.appliesTo({ ...on, except: ["example.com"] }, "notexample.com"), true);
  assert.equal(R.appliesTo({ ...on, except: ["example.com"] }, "example.com.evil.test"), true);
  assert.equal(R.appliesTo(on, ""), false);
});

const T = 1_700_000_000_000;
const MIN = 60000;
test("the total: it clears after a rest, full dark starts the wait, and the wait holds until it ends", () => {
  const settle = (cfg, raw, now) => plain(R.settle(cfg, raw, now));
  const part = { ms: 60000, screens: 10, last: T, until: 0 };
  assert.deepEqual(settle({}, null, T), R.EMPTY, "nothing counted");
  assert.deepEqual(settle({}, part, T + 30000), part, "a short pause keeps it");
  assert.deepEqual(settle({}, part, T + 60000), R.EMPTY, "a rest of the full time clears a page that is not fully dim");
  assert.deepEqual(settle({ restSeconds: 600 }, part, T + 120000), part, "a longer rest keeps it longer");
  const full = { ms: 5 * MIN, screens: 20, last: T, until: 0 };
  assert.deepEqual(settle({}, full, T), { ...full, until: T + 10 * MIN }, "fully dim by time starts the wait");
  assert.deepEqual(settle({}, { ms: 0, screens: 150, last: T, until: 0 }, T).until, T + 10 * MIN, "and by distance");
  assert.equal(settle({ by: "time" }, { ms: 0, screens: 9999, last: T, until: 0 }, T).until, 0, "distance is not counted by time");
  assert.equal(settle({ waitMinutes: 3 }, full, T + 5).until, T + 5 + 3 * MIN, "the wait is the setting's");
  const waiting = { ...full, until: T + 10 * MIN };
  assert.deepEqual(settle({}, waiting, T + 10 * MIN - 1), waiting, "the wait holds, whether or not you scroll or rest");
  assert.deepEqual(settle({}, { ...waiting, last: T + 5 * MIN }, T + 10 * MIN - 1), { ...waiting, last: T + 5 * MIN }, "scrolling in the wait does not change it");
  assert.deepEqual(settle({ restSeconds: 10 }, waiting, T + 5 * MIN), waiting, "a long rest does not end the wait early");
  assert.deepEqual(settle({}, waiting, T + 10 * MIN), R.EMPTY, "the wait ends");
  assert.deepEqual(settle({ minutes: 60, screens: 5000 }, waiting, T + MIN), waiting, "a wait that began holds even if the limits change");
  assert.deepEqual(settle({}, { "youtube.com": { ms: 5, screens: 1, last: T } }, T), R.EMPTY, "an older shape is nothing counted");
  assert.deepEqual(settle({}, { ms: -5, screens: "x", last: NaN, until: -1 }, T), R.EMPTY, "damaged numbers are nothing");
});

test("looser: off, a limit farther away, a lighter dimming, a shorter rest or wait, or more sites left alone", () => {
  const on = R.normalize({ on: true });
  const looser = (to, from = on) => R.looser(from, { ...from, ...to });
  assert.equal(R.looser(R.normalize(undefined), on), false, "off to on is stricter");
  assert.equal(R.looser(R.normalize(undefined), { on: false, minutes: 60 }), false, "while it is off nothing can be loosened");
  assert.equal(looser({ on: false }), true);
  assert.deepEqual([looser({ minutes: 10 }), looser({ minutes: 3 }), looser({ minutes: 5 })], [true, false, false]);
  assert.deepEqual([looser({ screens: 250 }), looser({ screens: 100 })], [true, false]);
  assert.deepEqual([looser({ darkest: 50 }), looser({ darkest: 80 })], [true, false]);
  assert.deepEqual([looser({ restSeconds: 30 }), looser({ restSeconds: 120 })], [true, false], "a shorter rest clears it sooner: looser");
  assert.deepEqual([looser({ waitMinutes: 5 }), looser({ waitMinutes: 30 })], [true, false], "a shorter wait is looser");
  assert.deepEqual([looser({ by: "time" }), looser({ by: "distance" })], [true, true], "dropping one of the two limits is looser");
  const time = { ...on, by: "time" };
  assert.equal(looser({ by: "either" }, time), false, "adding a limit is stricter");
  assert.equal(looser({ by: "distance" }, time), true, "swapping one for the other loosens the one you had");
  assert.equal(looser({ minutes: 60 }, { ...on, by: "distance" }), false, "a limit that is not counted can change");
  assert.equal(looser({ except: ["example.com"] }), true, "a site left alone is looser");
  assert.equal(looser({ except: ["example.com"] }, { ...on, except: ["example.com", "b.com"] }), false, "fewer sites left alone is stricter");
  assert.equal(looser({ except: ["c.com"] }, { ...on, except: ["example.com"] }), true, "a new site left alone, even in place of another");
});

test("the page script repeats the setting's rules exactly, for the fields it uses", () => {
  const P = pageCopy();
  for (const s of SAMPLES) {
    const want = R.normalize(s);
    assert.deepEqual(plain(P.normalize(s)), { on: want.on, restSeconds: want.restSeconds, except: want.except }, JSON.stringify(s));
  }
  for (const s of ["https://www.Reddit.com/r/all", "x.com:81", "a.b.c", "nope", "", null, "  UPPER.example.org/path?q#h"]) {
    assert.equal(P.cleanSite(s), R.cleanSite(s), String(s));
  }
});

test("the window's layer repeats the setting's rules exactly", async () => {
  const w = await openWindow({ settleMs: 100 });
  try {
    const W = w.window.__Atlas.scrollFade;
    assert.ok(W, "the layer module is in the window bundle");
    for (const s of SAMPLES) assert.deepEqual(plain(W.normalize(s)), plain(R.normalize(s)), JSON.stringify(s));
    const totals = [null, {}, { ms: 90000, screens: 10, last: T }, { ms: 300000, screens: 20, last: T }, { ms: 0, screens: 150, last: T },
      { ms: 1e9, screens: 1e9, last: T }, { ms: 60000, screens: 10, last: T, until: T + 600000 }, { ms: 60000, screens: 10, last: T, until: T - 1 },
      { ms: -1, screens: "x", last: NaN, until: -3 }, { "youtube.com": { ms: 1 } }];
    for (const s of SAMPLES) {
      const cfg = R.normalize(s);
      for (const t of totals) {
        for (const now of [T, T + 30000, T + 61000, T + 5 * MIN, T + 11 * MIN]) {
          assert.deepEqual(plain(W.settle(plain(cfg), t, now)), plain(R.settle(cfg, t, now)), JSON.stringify([s, t, now]));
        }
        assert.equal(W.progress(cfg, (t && t.ms) || 0, (t && t.screens) || 0), R.progress(cfg, (t && t.ms) || 0, (t && t.screens) || 0));
      }
    }
  } finally { w.window.close(); }
});

test("profiles keep a locked fade from loosening on a switch, by the same rule", () => {
  const locks = { scrollFade: { unlockAt: null } };
  const strong = R.normalize({ on: true, minutes: 3 });
  const weak = R.normalize({ on: true, minutes: 20 });
  assert.equal(profileKeeps({ scrollFade: strong }, { scrollFade: weak }, locks), true, "a switch to a looser one is kept out");
  assert.equal(profileKeeps({ scrollFade: weak }, { scrollFade: strong }, locks), false, "a stricter one comes in");
  assert.equal(profileKeeps({ scrollFade: strong }, { scrollFade: weak }, {}), false, "unlocked, anything comes in");
  assert.equal(profileKeeps({ scrollFade: strong }, {}, locks), true, "a profile with nothing saved is Off, the loosest");
  assert.equal(profileKeeps({}, { scrollFade: strong }, locks), false, "nothing saved is off: switching to a stronger one is fine");
  const ON = [{}, { minutes: 3 }, { minutes: 20 }, { by: "time" }, { by: "distance" }, { screens: 50 }, { darkest: 40 }, { restSeconds: 30 }, { restSeconds: 300 },
    { waitMinutes: 2 }, { waitMinutes: 30 }, { except: ["a.com"] }, { except: ["a.com", "b.com"] }, { except: ["c.com"] }].map((o) => R.normalize({ on: true, ...o }));
  for (const a of [...ON, R.normalize(undefined)]) {
    for (const b of [...ON, R.normalize(undefined)]) {
      assert.equal(profileKeeps({ scrollFade: a }, { scrollFade: b }, locks), R.looser(a, b), JSON.stringify([a, b]));
    }
  }
});
