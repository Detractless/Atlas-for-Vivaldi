// Loads Atlas's browser-window code (profilesCore.js + the generated atlas.js,
// which pulls in the service-worker bundle) into a minimal stand-in for
// Vivaldi's window.html. Vivaldi's own UI is not there, so this proves the code
// starts cleanly and does its non-visual jobs; it cannot test the restyling.
"use strict";

const fs = require("fs");
const path = require("path");
require("./jsdomNavigation");
const { JSDOM, VirtualConsole, requestInterceptor } = require("jsdom");
const { IDBFactory, IDBKeyRange } = require("fake-indexeddb");
const { makeFakeChrome } = require("./fakeChrome");

const ROOT = path.resolve(__dirname, "..", "..", "..");
const ORIGIN = "https://atlas.test";

/* The installed layout (Resources/vivaldi), mapped back to the repo. */
function fileFor(urlPath) {
  const p = decodeURIComponent(urlPath).replace(/^\//, "");
  if (p === "atlas.js") return path.join(ROOT, "payload", "install-files", "atlas.js");
  if (p.startsWith("components/")) return path.join(ROOT, "payload", "install-files", p);
  if (p.startsWith("src/atlas-")) return path.join(ROOT, "payload", "install-files", p);
  if (p.startsWith("src/")) return path.join(ROOT, "payload", "detractless", p);
  return null;
}

/** Any chrome.x.y(...) not faked resolves to undefined and is recorded in `calls`. */
function recorder(name, calls, listeners) {
  return new Proxy(function () {}, {
    get(_, prop) {
      if (prop === "then" || typeof prop === "symbol") return undefined;
      if (prop === "addListener") return (fn) => (listeners[name] = listeners[name] || []).push(fn);
      if (prop === "removeListener" || prop === "hasListener") return () => false;
      return recorder(`${name}.${prop}`, calls, listeners);
    },
    apply(_, __, args) {
      calls.push({ name, args });
      const cb = args.find((a) => typeof a === "function");
      if (cb) Promise.resolve().then(() => cb(undefined));
      return Promise.resolve(undefined);
    },
  });
}

/** chrome.* for the window: real-ish storage/runtime, everything else recorded. */
function windowChrome(window, seed, calls, listeners) {
  const { chrome: base, control } = makeFakeChrome(window, seed);
  const known = {
    storage: base.storage,
    runtime: new Proxy(base.runtime, { get: (t, p) => (p in t ? t[p] : recorder(`chrome.runtime.${String(p)}`, calls, listeners)) }),
    // tabs.query answers "no tabs" at once and is recorded, so a test can answer again.
    tabs: new Proxy({ query: (q, cb) => { calls.push({ name: "chrome.tabs.query", args: [q, cb] }); const r = window.JSON.parse("[]"); if (cb) Promise.resolve().then(() => cb(r)); return Promise.resolve(r); } },
      { get: (t, p) => (p in t ? t[p] : recorder(`chrome.tabs.${String(p)}`, calls, listeners)) }),
  };
  const chrome = new Proxy({}, {
    get: (t, p) => (p in t ? t[p] : p in known ? known[p] : recorder(`chrome.${String(p)}`, calls, listeners)),
    set: (t, p, v) => { t[p] = v; return true; },
  });
  return { chrome, control };
}

async function openWindow(opts = {}) {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", (err) => {
    if (err.type === "css-parsing" || err.type === "not-implemented") return;
    errors.push(`${err.type}: ${(err.cause && err.cause.stack) || err.message}`);
  });
  virtualConsole.on("error", (...args) => errors.push("console.error: " + args.map(String).join(" ")));
  const calls = [], listeners = {};
  let fake;
  const html = `<!DOCTYPE html><html><head></head><body>
    <div id="browser" class="theme-light"><div id="main"><div class="mainbar"></div></div></div>
    <script src="src/pages/newtab/profilesCore.js"></script>
    <script src="atlas.js"></script></body></html>`;
  const dom = new JSDOM(html, {
    url: `${ORIGIN}/window.html`,
    runScripts: "dangerously",
    pretendToBeVisual: true,
    virtualConsole,
    resources: {
      interceptors: [requestInterceptor((request) => {
        const file = fileFor(new URL(request.url).pathname);
        if (!file || !fs.existsSync(file)) return new Response("", { status: 404 });
        return new Response(fs.readFileSync(file), { headers: { "Content-Type": "application/javascript" } });
      })],
    },
    beforeParse(window) {
      window.matchMedia = (q) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
      window.indexedDB = new IDBFactory();
      window.IDBKeyRange = IDBKeyRange;
      // opts.fetch answers network requests (Google's account list); by default the network is off.
      window.fetch = opts.fetch || (() => Promise.reject(new Error("offline in tests")));
      fake = windowChrome(window, { sync: opts.sync, local: opts.local }, calls, listeners);
      window.chrome = fake.chrome;
      const rec = recorder("vivaldi", calls, listeners);
      // opts.searchEngines stands in for vivaldi.searchEngines; the rest is recorded.
      window.vivaldi = opts.searchEngines
        ? new Proxy({ searchEngines: opts.searchEngines }, { get: (t, p) => (p in t ? t[p] : rec[p]) })
        : rec;
    },
  });
  await new Promise((resolve) => dom.window.addEventListener("load", resolve));
  await new Promise((r) => setTimeout(r, opts.settleMs || 600));
  return { dom, window: dom.window, chrome: fake.chrome, control: fake.control, calls, listeners, errors };
}

module.exports = { openWindow };
