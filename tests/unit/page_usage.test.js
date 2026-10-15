// The usage script that runs on web pages (components/atlas/atlas-usage.js): how long the tab shows,
// how much of that is hands-on, media playing in front or behind, page views, images that came into
// view, clicks, keys and scrolling. It is loaded into a jsdom page the way the content script is, with
// the clock, the timers and IntersectionObserver under the test's control.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");
const { makeFakeChrome } = require("./helpers/fakeChrome");

const SCRIPT = fs.readFileSync(path.join(__dirname, "..", "..", "payload", "install-files", "components", "atlas", "atlas-usage.js"), "utf8");
const plain = (v) => JSON.parse(JSON.stringify(v));
let open = [];
test.afterEach(() => { for (const p of open) p.window.close(); open = []; });

/** A page at `url`. Time stands still until the test moves it; timers only run when the test calls them. */
function page(url = "https://www.example.com/watch?v=1", { before } = {}) {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", (e) => { if (e.type !== "not-implemented") errors.push(String(e.cause || e.message)); });
  const p = { clock: 1_000_000, visibility: "visible", focused: true, timers: [], cleared: [], observed: [], io: null, errors };
  const dom = new JSDOM("<!DOCTYPE html><body><main></main></body>", {
    url, runScripts: "outside-only", pretendToBeVisual: true, virtualConsole,
    beforeParse(window) {
      const fake = makeFakeChrome(window, {});
      window.chrome = fake.chrome;
      p.control = fake.control;
      window.Date.now = () => p.clock;
      Object.defineProperty(window.document, "visibilityState", { get: () => p.visibility, configurable: true });
      window.document.hasFocus = () => p.focused;   // the window in use has the focus
      window.setInterval = (fn, ms) => { p.timers.push({ fn, ms }); return p.timers.length; };
      window.clearInterval = (id) => p.cleared.push(id);
      window.IntersectionObserver = function (cb) {
        p.io = { cb, unobserved: [] };
        this.observe = (el) => p.observed.push(el);
        this.unobserve = (el) => p.io.unobserved.push(el);
      };
      if (before) before(window, p);
    },
  });
  p.dom = dom; p.window = dom.window; p.document = dom.window.document;
  open.push(p);
  return p;
}
/* jsdom marks every event as not a person's (event.isTrusted is false and cannot be set), so the script is run
   with that check swapped for a flag the test can set: an event is a script's when it has fromScript. In the
   browser the check is event.isTrusted. */
function run(p) { p.window.eval(SCRIPT.replace(/e\.isTrusted/g, "!e.fromScript")); }
const tickTimer = (p) => p.timers.find((t) => t.ms === 1000);
const flushTimer = (p) => p.timers.find((t) => t.ms === 30000);
/** Move the clock and run the once-a-second timer, second by second. */
function pass(p, seconds) { for (let i = 0; i < seconds; i++) { p.clock += 1000; tickTimer(p).fn(); } }
function flush(p) { flushTimer(p).fn(); }
const sent = (p) => p.control.sentMessages.filter((m) => m.action === "recordUsage");
const key = (p, k) => p.document.dispatchEvent(new p.window.KeyboardEvent("keydown", { key: k, bubbles: true }));

test("time: the showing tab counts, and only the part with something going on counts as hands on", async () => {
  const p = page(); run(p);
  pass(p, 10);
  p.document.body.dispatchEvent(new p.window.MouseEvent("click", { bubbles: true }));   // a person's click
  pass(p, 10);                      // within 15 s of the click: hands on
  pass(p, 10);                      // 10 more seconds: past 15 s of nothing, so just open
  flush(p);
  const d = sent(p)[0].delta;
  assert.equal(d.visibleMs, 30000);
  assert.equal(d.handsOnMs, 14000, "the 14 seconds after the click; from the 15th the page is just open");
  assert.equal(sent(p)[0].host, "example.com", "www. is dropped");
});

test("a visible window that is not the one in use adds no time, until you touch it", async () => {
  const p = page(); run(p);
  p.focused = false;                // a second window beside the one you are using
  pass(p, 20);
  flush(p);
  assert.equal(sent(p)[0].delta.visibleMs, undefined, "20 seconds beside the window in use: not counted");
  p.window.dispatchEvent(new p.window.Event("pointermove"));   // the pointer is over it
  pass(p, 10);
  p.focused = true;                 // and now it is the one in use
  pass(p, 10);
  flush(p);
  const d = sent(p)[1].delta;
  assert.equal(d.visibleMs, 20000, "counted while touched, and while it has the focus");
  assert.equal(d.handsOnMs, 14000, "hands-on for the 14 seconds after the touch; the rest is just open");
});

test("a hidden tab adds no time, and a sleeping computer is not counted", async () => {
  const p = page(); run(p);
  p.visibility = "hidden";
  pass(p, 20);
  p.visibility = "visible";
  p.clock += 3 * 3600 * 1000;       // the computer slept
  tickTimer(p).fn();
  flush(p);
  assert.equal(sent(p)[0].delta.visibleMs, 5000, "the sleep counts for at most five seconds");
});

test("media: playing with the tab in front, and playing with it in the background, are counted apart", async () => {
  const p = page(); run(p);
  const v = p.document.createElement("video");
  p.document.body.appendChild(v);
  Object.defineProperty(v, "paused", { value: false, configurable: true });
  v.dispatchEvent(new p.window.Event("playing"));
  pass(p, 8);
  p.visibility = "hidden";
  p.clock += 40000; tickTimer(p).fn();     // a hidden tab's timer can wake only now and then
  Object.defineProperty(v, "paused", { value: true, configurable: true });
  v.dispatchEvent(new p.window.Event("pause"));
  pass(p, 5);
  p.visibility = "visible";
  flush(p);
  const d = sent(p)[0].delta;
  assert.equal(d.mediaFrontMs, 8000);
  assert.equal(d.mediaBackMs, 40000);
});

test("page views: the load, and every change of address inside the site, but not a #fragment", async () => {
  const p = page("https://www.youtube.com/watch?v=a"); run(p);
  p.window.history.pushState({}, "", "/watch?v=b");
  pass(p, 1);
  p.window.history.pushState({}, "", "/watch?v=c");
  pass(p, 1);
  p.window.history.pushState({}, "", "/watch?v=c#t=30");
  pass(p, 1);
  flush(p);
  assert.equal(sent(p)[0].delta.pageViews, 3, "load + two video changes; the #t=30 is not a new page");
});

test("images and videos count once each when they come into view, and icons do not count", async () => {
  const p = page(); run(p);
  const mk = (tag) => { const el = p.document.createElement(tag); p.document.querySelector("main").appendChild(el); return el; };
  const big = mk("img"), icon = mk("img"), clip = mk("video");
  const entry = (el, w, h, isIntersecting = true) => ({ target: el, isIntersecting, boundingClientRect: { width: w, height: h } });
  assert.ok(p.observed.includes(big) === false, "added after the first look: found by the batch below");
  await new Promise((r) => setTimeout(r, 350));   // new content is looked at in a batch
  assert.ok([big, icon, clip].every((el) => p.observed.includes(el)), "all three are watched");
  p.io.cb([entry(big, 640, 480), entry(icon, 32, 32), entry(clip, 640, 360), entry(big, 640, 480)]);
  p.io.cb([entry(big, 640, 480)]);
  flush(p);
  assert.equal(sent(p)[0].delta.imagesSeen, 2, "the picture and the video once each; the icon not at all");
  assert.deepEqual(p.io.unobserved, [big, clip], "counted ones are not watched again");
});

test("clicks and key presses are only counted, and only when a person made them", async () => {
  const p = page(); run(p);
  p.document.body.dispatchEvent(new p.window.MouseEvent("click", { bubbles: true }));   // a person's
  const scripted = new p.window.MouseEvent("click", { bubbles: true });
  scripted.fromScript = true;
  p.document.body.dispatchEvent(scripted);   // a page's own click: not counted
  p.document.body.dispatchEvent(new p.window.MouseEvent("click", { bubbles: true }));   // a person's
  for (const k of ["h", "i", "s", "e", "c", "r", "e", "t"]) key(p, k);
  flush(p);
  const m = sent(p)[0];
  assert.equal(m.delta.clicks, 2);
  assert.equal(m.delta.keys, 8);
  const text = JSON.stringify(m);
  assert.ok(!/secret|example\.com\/|watch/.test(text.replace('"host":"example.com"', "")), "no typed text and no address in what is sent");
  assert.deepEqual(Object.keys(m).sort(), ["action", "delta", "host"]);
});

test("scrolling: distance in window heights and the time spent scrolling, from any scrolling box", async () => {
  const p = page(); run(p);
  const root = p.document.documentElement;
  const at = (n) => Object.defineProperty(root, "scrollTop", { value: n, configurable: true });
  const h = p.window.innerHeight;
  p.clock += 100; at(h * 2); p.document.dispatchEvent(new p.window.Event("scroll"));   // the page starts from where it was
  p.clock += 100; at(h * 3); p.document.dispatchEvent(new p.window.Event("scroll"));
  p.clock += 5000; at(h * 3 + 50); p.document.dispatchEvent(new p.window.Event("scroll"));  // a lone flick after a pause
  flush(p);
  const d = sent(p)[0].delta;
  assert.equal(d.scrollScreens, Math.round((3 + 50 / h) * 100) / 100);
  assert.equal(d.scrollMs, 100 + 100 + 100, "steady scrolling adds up; a lone flick counts 100 ms");
  // A feed that scrolls inside a box of its own, not the window.
  const box = p.document.createElement("div");
  p.document.body.appendChild(box);
  const boxAt = (n) => Object.defineProperty(box, "scrollTop", { value: n, configurable: true });
  boxAt(0); box.dispatchEvent(new p.window.Event("scroll"));          // a box on its own starts from its first scroll
  p.clock += 100; boxAt(h / 2); box.dispatchEvent(new p.window.Event("scroll"));
  flush(p);
  assert.equal(sent(p)[1].delta.scrollScreens, 0.5);
});

test("a jump of more than two screens (Home, End, a page back at its top) is not scrolling", async () => {
  const p = page(); run(p);
  const root = p.document.documentElement;
  const at = (n) => Object.defineProperty(root, "scrollTop", { value: n, configurable: true });
  const h = p.window.innerHeight;
  for (let i = 1; i <= 30; i++) { p.clock += 100; at(h * i); p.document.dispatchEvent(new p.window.Event("scroll")); }   // scrolled down 30 screens, a screen at a time
  p.clock += 100; at(0); p.document.dispatchEvent(new p.window.Event("scroll"));   // the page returns to its top
  p.clock += 100; at(h * 0.5); p.document.dispatchEvent(new p.window.Event("scroll"));   // and scrolling goes on from there
  flush(p);
  const d = sent(p)[0].delta;
  assert.equal(d.scrollScreens, 30.5, "the 30 screens down and the half after; not the 30 back to the top");
  assert.equal(d.scrollMs, 3100, "the jump adds no scrolling time either");
});

test("a send happens every 30 seconds and when the tab is left, and sends only what is new", async () => {
  const p = page(); run(p);
  assert.equal(sent(p).length, 0);
  assert.equal(flushTimer(p).ms, 30000);
  pass(p, 3);
  p.visibility = "hidden";
  p.document.dispatchEvent(new p.window.Event("visibilitychange"));
  assert.equal(sent(p).length, 1, "leaving the tab sends");
  assert.equal(sent(p)[0].delta.pageViews, 1);
  flush(p);
  assert.equal(sent(p).length, 1, "nothing new: nothing sent");
  assert.deepEqual(p.errors, []);
});

test("it stays out of frames and private windows, and stops itself when the extension was reloaded", async () => {
  const parent = new JSDOM('<!DOCTYPE html><iframe></iframe>', { url: "https://www.example.com/", runScripts: "outside-only" });
  const frame = parent.window.document.querySelector("iframe").contentWindow;
  frame.chrome = { runtime: { sendMessage() { throw new Error("a frame must not send"); } } };
  frame.eval(SCRIPT);
  assert.equal(frame.__atlasUsage, undefined, "not in a frame");
  parent.window.close();
  const priv = page("https://www.example.com/", { before: (w) => { w.chrome.extension = { inIncognitoContext: true }; } });
  run(priv);
  assert.equal(priv.timers.length, 0, "not in a private window");

  const gone = page(); run(gone);
  gone.window.chrome.runtime.sendMessage = () => { throw new Error("Extension context invalidated."); };
  pass(gone, 2);
  flush(gone);
  assert.deepEqual(gone.cleared, [1, 2], "both timers stopped");
  assert.deepEqual(gone.errors, []);
});
