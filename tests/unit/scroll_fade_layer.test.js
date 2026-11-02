// Scroll fade's dimming in the browser window (src/modules/36-scroll-fade-layer.js): one black layer over the page area,
// drawn from the one total the pages add to, for the tab you are on. It also keeps the wait: full dark starts it, and a
// wait or rest that is over clears the total. The page script that counts: scroll_fade_page.test.js. The rules:
// scroll_fade_rules.test.js. Like the colour filter (page_saturation.test.js) it is drawn in the window, not in a page.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { openWindow } = require("./helpers/windowDom");

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const MIN = 60000;
const NEWTAB = "chrome-extension://mpognobbkildjkofajifpdfhcoklimli/index.html";
const ON = { on: true };   // the setting's other values are its defaults: either, 5 minutes, 150 screens, 70%, 1 minute rest, 10 minute wait
let open = [];
test.afterEach(() => { for (const w of open) w.window.close(); open = []; });

/** A window with the page area Vivaldi builds, the setting `fade` saved and `total` kept, on the tab `url`. */
async function start({ fade, total, url = "https://www.reddit.com/" } = {}) {
  const w = await openWindow({ sync: fade ? { scrollFade: fade } : {}, local: total ? { atlas_scroll_fade: total } : {}, settleMs: 100 });
  open.push(w);
  w.window.document.body.insertAdjacentHTML("beforeend", '<webview-container id="wc"><div id="webpage-stack"></div></webview-container>');
  await openTab(w, url);
  await wait(60);
  return w;
}
/** The tab you are on changes to `url`: the window asks again and is told. The rest of chrome.tabs stays as it was. */
async function openTab(w, url) {
  if (!w.tabs) {
    const real = w.window.chrome.tabs;
    w.tabs = { url };
    w.window.chrome.tabs = new Proxy(real, { get: (t, p) => (p === "query" ? (q, cb) => cb([{ id: 1, url: w.tabs.url }]) : t[p]) });
  }
  w.tabs.url = url;
  for (const fn of w.listeners["chrome.tabs.onActivated"] || []) fn({ tabId: 1 });
  await wait(20);
}

const layer = (w) => w.window.document.getElementById("atlas-scroll-fade-layer");
const dim = (w) => (layer(w) ? Number(layer(w).children[0].style.opacity) : 0);
const pill = (w) => layer(w).children[1];
const pillOn = (w) => pill(w).style.opacity === "1";
const kept = async (w) => JSON.parse(JSON.stringify((await w.chrome.storage.local.get(["atlas_scroll_fade"])).atlas_scroll_fade));
const keep = async (w, total) => { await w.chrome.storage.local.set({ atlas_scroll_fade: total }); await wait(60); };
const EMPTY = { ms: 0, screens: 0, last: 0, until: 0 };
const half = () => ({ ms: 150000, screens: 0, last: Date.now(), until: 0 });   // half of the 5 minutes

test("off: nothing is drawn, whatever has been counted", async () => {
  const w = await start({ total: half() });
  assert.equal(layer(w), null);
  const off = await start({ fade: { ...ON, on: false }, total: { ms: 300000, screens: 20, last: Date.now(), until: 0 } });
  assert.equal(layer(off), null);
  assert.deepEqual(await kept(off), { ms: 300000, screens: 20, last: (await kept(off)).last, until: 0 }, "and nothing is changed while it is off");
  assert.deepEqual(w.errors.concat(off.errors), []);
});

test("on: one black layer over the page area, as dark as the total says, taking no clicks", async () => {
  const w = await start({ fade: ON, total: half() });
  const l = layer(w), stack = w.window.document.getElementById("webpage-stack");
  assert.ok(l, "the layer is there");
  assert.equal(l.parentNode, stack.parentNode, "in the page area's container");
  assert.equal(stack.nextElementSibling, l, "after the page stack, so it is over every page");
  assert.equal(dim(w), 0.35, "half of the 70%");
  assert.match(l.getAttribute("style"), /pointer-events:\s*none/);
  assert.match(l.children[0].getAttribute("style"), /background: rgb\(0, 0, 0\); opacity: 0\.35; pointer-events: none; transition: opacity 1200ms/, "black, never takes a click, eases in and out");
  assert.match(pill(w).getAttribute("style"), /pointer-events:\s*none/);
  assert.equal(w.window.document.querySelectorAll("#atlas-scroll-fade-layer").length, 1, "only one");
  assert.deepEqual(w.errors, []);
});

test("only the web page you are on is dimmed: Atlas's pages, Vivaldi's and a tab not known yet stay clear", async () => {
  const w = await start({ fade: ON, total: half() });
  assert.equal(dim(w), 0.35);
  for (const url of [NEWTAB, "vivaldi://settings", "chrome://extensions", "about:blank", "devtools://devtools/bundled/x.html", ""]) {
    await openTab(w, url);
    assert.equal(dim(w), 0, url || "(no address yet)");
  }
  await openTab(w, "https://chromewebstore.google.com/detail/x");
  assert.equal(dim(w), 0.35, "the Web Store too: a script can't run there, but the window can dim it");
  await openTab(w, "https://example.com/");
  assert.equal(dim(w), 0.35, "and any other site: one total for every page");
});

test("sites left alone are not dimmed, with their subdomains, but a look-alike is", async () => {
  const w = await start({ fade: { ...ON, except: ["example.com"] }, total: half(), url: "https://docs.example.com/guide" });
  assert.equal(dim(w), 0, "a subdomain of a site left alone");
  await openTab(w, "https://www.example.com/");
  assert.equal(dim(w), 0);
  await openTab(w, "https://notexample.com/");
  assert.equal(dim(w), 0.35);
  await openTab(w, "https://example.com.evil.test/");
  assert.equal(dim(w), 0.35);
  await openTab(w, "https://www.reddit.com/");
  assert.equal(dim(w), 0.35);
});

test("the pill shows once the page is half dim, and counts the rest while you are not scrolling", async () => {
  const w = await start({ fade: ON, total: { ms: 60000, screens: 0, last: Date.now(), until: 0 } });
  assert.equal(dim(w), 0.14, "a fifth of the way: 14%");
  assert.equal(pillOn(w), false, "no pill under half dim");
  await keep(w, half());
  assert.equal(pillOn(w), true);
  assert.equal(pill(w).textContent, "Rest 1:00 to clear", "while you scroll: what the rest has to be");
  await keep(w, { ...half(), last: Date.now() - 5000 });
  assert.equal(pill(w).textContent, "Clearing in 0:55");
  assert.equal(dim(w), 0.35, "it stays dim while you rest");
});

test("a page that is not fully dim clears after the rest, and the total is emptied", async () => {
  const w = await start({ fade: ON, total: { ms: 150000, screens: 0, last: Date.now() - 61000, until: 0 } });
  assert.deepEqual(await kept(w), EMPTY, "rested a full minute: nothing counted any more");
  assert.equal(layer(w), null, "and there was never anything to draw");
  const fresh = await start({ fade: { ...ON, restSeconds: 600 }, total: { ms: 150000, screens: 0, last: Date.now() - 61000, until: 0 } });
  assert.equal(dim(fresh), 0.35, "with a longer rest it is still dim");
});

test("fully dark starts the wait, and while it runs the page stays fully dark whatever the total does", async () => {
  const w = await start({ fade: ON, total: { ms: 5 * MIN, screens: 20, last: Date.now(), until: 0 } });
  const t = await kept(w);
  assert.ok(Math.abs(t.until - (Date.now() + 10 * MIN)) < 3000, "ten minutes from now: " + (t.until - Date.now()));
  assert.equal(dim(w), 0.7, "the darkest");
  assert.equal(pillOn(w), true);
  assert.match(pill(w).textContent, /^Back in (10:00|9:5\d)$/);
  await keep(w, { ...t, ms: 0, screens: 0, last: 0 });
  assert.equal(dim(w), 0.7, "the total going back to nothing does not end it: the wait does");
  await keep(w, { ...t, last: Date.now() });
  assert.equal(dim(w), 0.7, "and scrolling more does not make it longer");
  assert.equal((await kept(w)).until, t.until);
  await keep(w, { ...t, until: Date.now() + 90 * 1000 });
  assert.match(pill(w).textContent, /^Back in 1:(30|29)$/);
});

test("the wait ends by itself: the total is emptied and the page comes back", async () => {
  const w = await start({ fade: ON, total: { ms: 5 * MIN, screens: 20, last: Date.now() - 20 * MIN, until: Date.now() + 1500 } });
  assert.equal(dim(w), 0.7);
  await wait(2600);   // the window checks once a second
  assert.deepEqual(await kept(w), EMPTY);
  assert.equal(dim(w), 0);
  assert.equal(pillOn(w), false);
  const over = await start({ fade: ON, total: { ms: 5 * MIN, screens: 20, last: Date.now() - 20 * MIN, until: Date.now() - 1 } });
  assert.deepEqual(await kept(over), EMPTY, "a wait that ended while no window was open: cleared as soon as one is");
  assert.equal(dim(over), 0);
});

test("a wait uses the wait setting, and a different tab shows the same dimming", async () => {
  const w = await start({ fade: { ...ON, waitMinutes: 30, darkest: 50 }, total: { ms: 0, screens: 150, last: Date.now(), until: 0 } });
  assert.ok(Math.abs((await kept(w)).until - (Date.now() + 30 * MIN)) < 3000);
  assert.equal(dim(w), 0.5);
  await openTab(w, "https://docs.example.com/");
  assert.equal(dim(w), 0.5, "going to another site does not start again");
});

test("the setting is followed: off removes the layer, on draws it from the total, and a total from another window arrives", async () => {
  const w = await start({ fade: ON, total: half() });
  assert.equal(dim(w), 0.35);
  await w.chrome.storage.sync.set({ scrollFade: { ...ON, on: false } });
  await wait(40);
  assert.equal(layer(w), null, "off: the layer is gone at once");
  await w.chrome.storage.sync.set({ scrollFade: { ...ON, darkest: 40 } });
  await wait(40);
  assert.equal(dim(w), 0.2, "on again, from what was counted: half of the new darkest");
  await keep(w, { ms: 0, screens: 75, last: Date.now(), until: 0 });
  assert.equal(dim(w), 0.2);
  await keep(w, { ms: 0, screens: 30, last: Date.now(), until: 0 });
  assert.equal(dim(w), 0.08, "a window sees what another counted");
  assert.deepEqual(w.errors, []);
});

test("it does nothing it need not: no writes while the total holds still, and the layer is put back if Vivaldi drops it", async () => {
  const w = await start({ fade: ON, total: half() });
  const sets = [];
  const set = w.chrome.storage.local.set;
  w.chrome.storage.local.set = (...a) => { sets.push(a[0]); return set.apply(w.chrome.storage.local, a); };
  await wait(1300);
  assert.deepEqual(sets, [], "a tick with nothing to change writes nothing");
  layer(w).remove();
  await wait(1300);
  assert.ok(layer(w), "the next tick puts it back");
  assert.equal(dim(w), 0.35);
});
