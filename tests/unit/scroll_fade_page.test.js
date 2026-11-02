// The Scroll fade script that runs on web pages (components/atlas/atlas-scroll-fade.js): it counts how long and how far you
// scroll and adds it to one total for every site. It draws nothing (the window's layer does: scroll_fade_layer.test.js).
// It is loaded into a jsdom page the way the content script is, with a fake chrome.storage and the clock under the test's
// control. The setting's own rules: scroll_fade_rules.test.js.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");
const { makeFakeChrome } = require("./helpers/fakeChrome");

const SCRIPT = fs.readFileSync(path.join(__dirname, "..", "..", "payload", "install-files", "components", "atlas", "atlas-scroll-fade.js"), "utf8");
const plain = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
const settle = () => new Promise((r) => setTimeout(r, 5));
let open = [];
test.afterEach(() => { for (const p of open) p.window.close(); open = []; });

const ON = { on: true };   // everything else is the setting's default: a 1 minute rest, nothing left alone
const T0 = 5_000_000;

/** A page at `url` with `fade` saved as the setting. Time stands still until the test moves it. */
async function page(url, { fade, local, incognito } = {}) {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", (e) => { if (e.type !== "not-implemented") errors.push(String(e.cause || e.message)); });
  const p = { clock: T0, timeouts: [], errors, top: 0, sets: [] };
  const dom = new JSDOM("<!DOCTYPE html><body><main></main></body>", {
    url, runScripts: "outside-only", pretendToBeVisual: true, virtualConsole,
    beforeParse(window) {
      const seed = { sync: fade === undefined ? {} : { scrollFade: fade }, local: local || {} };
      const fake = makeFakeChrome(window, seed);
      window.chrome = fake.chrome;
      if (incognito) window.chrome.extension.inIncognitoContext = true;
      p.chrome = fake.chrome;
      window.Date.now = () => p.clock;
      window.setTimeout = (fn, ms) => { p.timeouts.push({ fn, ms }); return p.timeouts.length; };
      window.clearTimeout = (id) => { if (p.timeouts[id - 1]) p.timeouts[id - 1].fn = null; };
    },
  });
  p.dom = dom; p.window = dom.window; p.document = dom.window.document;
  p.root = p.document.scrollingElement || p.document.documentElement;
  open.push(p);
  p.window.eval(SCRIPT);
  await settle();
  const set = p.chrome.storage.local.set;
  p.chrome.storage.local.set = (...args) => { p.sets.push(plain(args[0])); return set.apply(p.chrome.storage.local, args); };
  return p;
}

const H = 768;   // jsdom's window height
/** Scroll the page by `screens` window heights, `ms` after the last scroll. */
function scroll(p, screens, ms = 100) {
  p.clock += ms;
  p.top += screens * H;
  Object.defineProperty(p.root, "scrollTop", { value: p.top, configurable: true });
  p.document.dispatchEvent(new p.window.Event("scroll"));
}
/** Scroll steadily: `n` steps of `screens` each, 100 ms apart. Storage answers between steps, as it does in a real page. */
async function scrollSteadily(p, n, screens) {
  for (let i = 0; i < n; i++) { scroll(p, screens); await new Promise((r) => setImmediate(r)); }
}
/** The page goes away (or to the background): what is counted but not saved is saved. */
const leave = async (p) => { p.window.dispatchEvent(new p.window.Event("pagehide")); await settle(); };
/** The delayed save the script asked for. */
const later = async (p) => { for (const t of p.timeouts) if (t.fn) { const fn = t.fn; t.fn = null; fn(); } await settle(); };

const total = async (p) => plain((await p.chrome.storage.local.get(["atlas_scroll_fade"])).atlas_scroll_fade);
const round = (t) => ({ ...t, screens: Math.round(t.screens * 100) / 100 });

test("off, or a site left alone, or a private window: nothing is counted and nothing is written", async () => {
  const off = await page("https://www.reddit.com/r/all");
  await scrollSteadily(off, 400, 0.5);
  await leave(off);
  assert.deepEqual(off.sets, [], "off means off, however far you scroll");
  const alone = await page("https://docs.example.com/guide", { fade: { ...ON, except: ["example.com"] } });
  await scrollSteadily(alone, 400, 0.5);
  await leave(alone);
  assert.deepEqual(alone.sets, [], "a subdomain of a site left alone");
  const priv = await page("https://www.reddit.com/", { fade: ON, incognito: true });
  await scrollSteadily(priv, 400, 0.5);
  await leave(priv);
  assert.deepEqual(priv.sets, [], "never in a private window");
  assert.deepEqual(off.errors.concat(alone.errors, priv.errors), []);
});

test("it counts distance and time, and draws nothing in the page", async () => {
  const p = await page("https://www.reddit.com/", { fade: ON });
  await scrollSteadily(p, 150, 0.5);                  // 75 screens, 150 steps of 100 ms
  await leave(p);
  assert.deepEqual(round(await total(p)), { ms: 15000, screens: 75, last: p.clock, until: 0 });
  assert.equal(p.document.querySelector("atlas-scroll-fade"), null, "the dimming is the window's job");
  assert.equal(p.document.documentElement.children.length, 2, "nothing was added to the page");
  assert.deepEqual(p.errors, []);
});

test("a lone flick counts a tenth of a second; a jump of more than two screens is not scrolling", async () => {
  const p = await page("https://www.reddit.com/", { fade: ON });
  scroll(p, 30);                                // End
  scroll(p, -30);                               // back to the top
  await leave(p);
  assert.equal(await total(p), undefined, "nothing counted, nothing written");
  scroll(p, 1.5, 5000);                         // a flick after a long pause
  await leave(p);
  assert.deepEqual(round(await total(p)), { ms: 100, screens: 1.5, last: p.clock, until: 0 });
});

test("it saves at most once a second, adding what was counted since", async () => {
  const p = await page("https://www.reddit.com/", { fade: ON });
  await scrollSteadily(p, 5, 1);                      // 500 ms of scrolling
  await settle();
  assert.equal(p.sets.length, 1, "the first scroll is saved at once, the rest wait");
  assert.deepEqual(round(plain((await total(p)))), { ms: 100, screens: 1, last: T0 + 100, until: 0 });
  p.clock += 1000; scroll(p, 1, 0);             // a second on: saved with everything since
  await settle();
  assert.equal(p.sets.length, 2);
  assert.deepEqual(round(await total(p)), { ms: 600, screens: 6, last: p.clock, until: 0 });
  await scrollSteadily(p, 3, 1);
  await later(p);                               // the delayed save for what came after
  assert.equal(p.sets.length, 3);
  assert.deepEqual(round(await total(p)), { ms: 900, screens: 9, last: p.clock, until: 0 });
});

test("one total for every site: a second tab adds to the first, whatever the site", async () => {
  const a = await page("https://www.reddit.com/", { fade: ON });
  await scrollSteadily(a, 50, 1);                     // 50 screens
  await leave(a);
  const kept = await total(a);
  const b = await page("https://docs.example.org/", { fade: ON, local: { atlas_scroll_fade: kept } });
  b.clock = a.clock;
  await scrollSteadily(b, 20, 1);                     // 20 more, on another site
  await leave(b);
  const t = await total(b);
  assert.equal(t.screens, 70, "70 screens in all, not 20");
  assert.equal(t.ms, 7000);
  assert.deepEqual(Object.keys(t).sort(), ["last", "ms", "screens", "until"], "only numbers, never a site name or address");
});

test("after a rest that was long enough, or a wait that is over, it starts again from nothing", async () => {
  const stale = { ms: 120000, screens: 90, last: T0 - 61000, until: 0 };
  const p = await page("https://www.reddit.com/", { fade: ON, local: { atlas_scroll_fade: stale } });
  scroll(p, 1);
  await leave(p);
  assert.deepEqual(round(await total(p)), { ms: 100, screens: 1, last: p.clock, until: 0 }, "a minute's rest: the old total is gone");
  const fresh = { ms: 120000, screens: 90, last: T0 - 30000, until: 0 };
  const q = await page("https://www.reddit.com/", { fade: ON, local: { atlas_scroll_fade: fresh } });
  scroll(q, 1);
  await leave(q);
  assert.deepEqual(round(await total(q)), { ms: 120100, screens: 91, last: q.clock, until: 0 }, "a short pause: it carries on");
  const over = { ms: 300000, screens: 150, last: T0 - 700000, until: T0 - 1 };
  const r = await page("https://www.reddit.com/", { fade: ON, local: { atlas_scroll_fade: over } });
  scroll(r, 1);
  await leave(r);
  assert.deepEqual(round(await total(r)), { ms: 100, screens: 1, last: r.clock, until: 0 }, "the wait is over: the new scrolling is the start of the next");
});

test("while a wait is running, scrolling changes nothing: it can't be made shorter or longer", async () => {
  const waiting = { ms: 300000, screens: 150, last: T0 - 1000, until: T0 + 600000 };
  const p = await page("https://www.reddit.com/", { fade: ON, local: { atlas_scroll_fade: waiting } });
  await scrollSteadily(p, 100, 1);
  await leave(p);
  assert.deepEqual(await total(p), waiting, "the wait is as it was");
  assert.equal(p.sets.filter((s) => s.atlas_scroll_fade).length, 0, "and nothing was written");
});

test("the setting is followed while the page is open, and what is not saved is saved when the tab is hidden", async () => {
  const p = await page("https://www.reddit.com/", { fade: ON });
  await scrollSteadily(p, 3, 1);
  await p.chrome.storage.sync.set({ scrollFade: { ...ON, on: false } });
  await later(p);
  await scrollSteadily(p, 50, 1);
  await leave(p);
  assert.deepEqual(round(await total(p)), { ms: 100, screens: 1, last: T0 + 100, until: 0 }, "off: what was counted but not saved is dropped, and nothing more is");
  await p.chrome.storage.sync.set({ scrollFade: ON });
  await settle();
  await scrollSteadily(p, 5, 1);
  Object.defineProperty(p.document, "visibilityState", { value: "hidden", configurable: true });
  p.document.dispatchEvent(new p.window.Event("visibilitychange"));
  await settle();
  assert.ok((await total(p)).screens >= 5, "hidden: saved at once");
  await p.chrome.storage.sync.set({ scrollFade: { ...ON, except: ["reddit.com"] } });
  await settle();
  const before = p.sets.length;
  await scrollSteadily(p, 50, 1);
  await leave(p);
  assert.equal(p.sets.length, before, "a site left alone while it is open: counted no more");
  assert.deepEqual(p.errors, []);
});
