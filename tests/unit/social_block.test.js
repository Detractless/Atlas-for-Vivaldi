// "Block social sites entirely": with the mode on, opening a page of a social site is replaced by the block page
// (background/socialBlock.js, inside serviceWorker.bundle.js, run in a Node vm with a stand-in chrome.*).
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { IDBFactory, IDBKeyRange } = require("fake-indexeddb");

const BUNDLE = path.join(__dirname, "..", "..", "payload", "detractless", "src", "dist", "serviceWorker.bundle.js");

function anyApi(name, listeners, calls) {
  return new Proxy(function () {}, {
    get(_, prop) {
      if (prop === "then") return undefined;
      if (prop === "addListener") return (fn) => (listeners[name] = listeners[name] || []).push(fn);
      return anyApi(`${name}.${String(prop)}`, listeners, calls);
    },
    apply(_, __, args) {
      calls.push({ name, args });
      const cb = args.find((a) => typeof a === "function");
      if (cb) Promise.resolve().then(() => cb(undefined));
      return Promise.resolve(undefined);
    },
  });
}

function storageArea(data) {
  return {
    get(keys, cb) {
      const pick = {};
      for (const k of [].concat(keys == null ? Object.keys(data) : keys)) if (k in data) pick[k] = JSON.parse(JSON.stringify(data[k]));
      if (cb) Promise.resolve().then(() => cb(pick));
      return Promise.resolve(pick);
    },
    set(items, cb) { Object.assign(data, JSON.parse(JSON.stringify(items))); if (cb) Promise.resolve().then(cb); return Promise.resolve(); },
    remove() { return Promise.resolve(); },
  };
}

function loadWorker(sync, openTabs) {
  const listeners = {}, calls = [];
  const any = anyApi("chrome", listeners, calls);
  const tabsApi = new Proxy({ query: (q, cb) => { Promise.resolve().then(() => cb(openTabs || [])); } }, { get: (t, p) => (p in t ? t[p] : any.tabs[p]) });
  const fake = {
    tabs: tabsApi,
    storage: { sync: storageArea(sync || {}), local: storageArea({}), session: storageArea({}), onChanged: anyApi("chrome.storage.onChanged", listeners, calls) },
  };
  const runtime = new Proxy({ id: "test", lastError: undefined, getURL: (p) => "chrome-extension://test/" + p }, {
    get: (t, p) => (p in t ? t[p] : anyApi(`chrome.runtime.${String(p)}`, listeners, calls)),
  });
  const chrome = new Proxy({}, { get: (_, p) => (p in fake ? fake[p] : p === "runtime" ? runtime : any[p]) });
  const context = vm.createContext({
    chrome, self: {}, console: { log() {}, info() {}, warn() {}, error() {} },
    setTimeout, clearTimeout, setInterval, clearInterval, URL, URLSearchParams, TextEncoder, TextDecoder,
    indexedDB: new IDBFactory(), IDBKeyRange, structuredClone, Promise, Date, Math, JSON,
  });
  context.globalThis = context;
  vm.runInContext(fs.readFileSync(BUNDLE, "utf8"), context, { filename: "serviceWorker.bundle.js" });
  return { listeners, calls, storage: fake.storage };
}

const navigate = (w, details, kind = "onBeforeNavigate") => (w.listeners[`chrome.webNavigation.${kind}`] || []).forEach((fn) => fn(details));
const updates = (w) => w.calls.filter((c) => c.name === "chrome.tabs.update").map((c) => c.args[1].url);
const tick = () => new Promise((r) => setTimeout(r, 20));

test("mode all: a page of a social site is replaced by the block page, naming the site", async () => {
  const w = loadWorker({ socialFilter: { mode: "all", parts: [] } });
  navigate(w, { frameId: 0, tabId: 7, url: "https://www.youtube.com/watch?v=1" });
  navigate(w, { frameId: 0, tabId: 8, url: "https://old.reddit.com/r/x" });
  navigate(w, { frameId: 0, tabId: 9, url: "https://twitter.com/home" });
  await tick();
  assert.deepEqual(updates(w), [
    "chrome-extension://test/gate.html?why=social&site=YouTube",
    "chrome-extension://test/gate.html?why=social&site=Reddit",
    "chrome-extension://test/gate.html?why=social&site=X",
  ]);
});

test("mode all: other sites, look-alikes, the block page itself and frames inside pages are left alone", async () => {
  const w = loadWorker({ socialFilter: { mode: "all", parts: [] } });
  for (const url of ["https://example.com/", "https://notyoutube.com/", "https://example.com/?u=https://youtube.com", "chrome-extension://test/gate.html?why=social&site=YouTube"]) {
    navigate(w, { frameId: 0, tabId: 1, url });
  }
  navigate(w, { frameId: 3, tabId: 1, url: "https://www.youtube.com/embed/x" });
  await tick();
  assert.deepEqual(updates(w), []);
});

test("modes off and parts block nothing", async () => {
  for (const mode of ["off", "parts"]) {
    const w = loadWorker({ socialFilter: { mode, parts: ["comments"] } });
    navigate(w, { frameId: 0, tabId: 1, url: "https://www.youtube.com/" });
    await tick();
    assert.deepEqual(updates(w), [], mode);
  }
  const none = loadWorker({});
  navigate(none, { frameId: 0, tabId: 1, url: "https://www.youtube.com/" });
  await tick();
  assert.deepEqual(updates(none), [], "nothing saved yet");
});

test("a navigation that wakes the worker before its first read has come back is still blocked", async () => {
  const w = loadWorker({ socialFilter: { mode: "all", parts: [] } });
  navigate(w, { frameId: 0, tabId: 5, url: "https://www.tiktok.com/" });   // no tick: the read is still in flight
  await tick();
  assert.equal(updates(w).length, 1);
});

test("switching the mode takes effect at once, in both directions", async () => {
  const w = loadWorker({ socialFilter: { mode: "off", parts: [] } });
  await tick();
  const change = (mode) => (w.listeners["chrome.storage.onChanged"] || []).forEach((fn) => fn({ socialFilter: { newValue: { mode, parts: [] } } }, "sync"));
  change("all");
  navigate(w, { frameId: 0, tabId: 1, url: "https://www.instagram.com/" });
  await tick();
  assert.equal(updates(w).length, 1);
  change("off");
  navigate(w, { frameId: 0, tabId: 1, url: "https://www.instagram.com/" });
  await tick();
  assert.equal(updates(w).length, 1, "off again: no new block");
});

test("a single-page site moving to another address is blocked too", async () => {
  const w = loadWorker({ socialFilter: { mode: "all", parts: [] } });
  navigate(w, { frameId: 0, tabId: 2, url: "https://www.facebook.com/watch" }, "onHistoryStateUpdated");
  await tick();
  assert.equal(updates(w).length, 1);
});

test("a redirect that ends on a social site is blocked when the page commits", async () => {
  const w = loadWorker({ socialFilter: { mode: "all", parts: [] } });
  navigate(w, { frameId: 0, tabId: 3, url: "https://www.youtube.com/watch?v=1" }, "onCommitted");
  await tick();
  assert.deepEqual(updates(w), ["chrome-extension://test/gate.html?why=social&site=YouTube"]);
});

test("short-link and sister hosts are blocked with their site, and a trailing dot does not get round it", async () => {
  const w = loadWorker({ socialFilter: { mode: "all", parts: [] } });
  for (const url of ["https://youtu.be/abc", "https://redd.it/x", "https://fb.me/y", "https://www.messenger.com/", "https://www.youtube.com./", "https://instagr.am/p/z"]) {
    navigate(w, { frameId: 0, tabId: 1, url });
  }
  await tick();
  assert.equal(updates(w).length, 6);
});

test("switching the mode to all also takes the tabs that are already on those sites", async () => {
  const w = loadWorker({ socialFilter: { mode: "off", parts: [] } }, [
    { id: 11, url: "https://www.youtube.com/watch?v=1" }, { id: 12, url: "https://example.com/" }, { id: 13, url: "https://old.reddit.com/" }, { id: 14 },
  ]);
  await tick();
  const change = (mode) => (w.listeners["chrome.storage.onChanged"] || []).forEach((fn) => fn({ socialFilter: { newValue: { mode, parts: [] } } }, "sync"));
  change("parts");
  await tick();
  assert.deepEqual(w.calls.filter((c) => c.name === "chrome.tabs.update").length, 0, "parts mode leaves open tabs alone");
  change("all");
  await tick();
  const tabsUpdated = w.calls.filter((c) => c.name === "chrome.tabs.update").map((c) => c.args[0]);
  assert.deepEqual(tabsUpdated, [11, 13]);
  change("all");
  await tick();
  assert.equal(w.calls.filter((c) => c.name === "chrome.tabs.update").length, 2, "already all: no second sweep");
});
