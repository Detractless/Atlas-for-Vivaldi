// The background bundle (serviceWorker.bundle.js) loaded in a Node vm with a
// stand-in chrome.*: it must start without errors and answer its messages.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { IDBFactory, IDBKeyRange } = require("fake-indexeddb");

const BUNDLE = path.join(__dirname, "..", "..", "payload", "detractless", "src", "dist", "serviceWorker.bundle.js");

/** Any chrome.a.b.c(...) call resolves to `undefined` and is recorded; so are addListener calls. */
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

function storageArea(data = {}) {
  return {
    get(keys, cb) {
      const pick = {};
      const list = keys == null ? Object.keys(data) : typeof keys === "string" ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys);
      for (const k of list) if (k in data) pick[k] = JSON.parse(JSON.stringify(data[k]));
      if (cb) Promise.resolve().then(() => cb(pick));
      return Promise.resolve(pick);
    },
    set(items, cb) { Object.assign(data, JSON.parse(JSON.stringify(items))); if (cb) Promise.resolve().then(cb); return Promise.resolve(); },
    remove(keys, cb) { for (const k of [].concat(keys)) delete data[k]; if (cb) Promise.resolve().then(cb); return Promise.resolve(); },
    _data: data,
  };
}

function loadWorker(seed = {}) {
  const listeners = {}, calls = [];
  const chrome = anyApi("chrome", listeners, calls);
  const fake = {
    storage: { sync: storageArea(seed.sync), local: storageArea(seed.local), session: storageArea(), onChanged: anyApi("chrome.storage.onChanged", listeners, calls) },
    tabs: new Proxy({ query: (q, cb) => { if (cb) Promise.resolve().then(() => cb([])); return Promise.resolve([]); } }, {
      get: (t, p) => (p in t ? t[p] : anyApi(`chrome.tabs.${String(p)}`, listeners, calls)),
    }),
  };
  const chromeObj = new Proxy({}, {
    get: (_, p) => (p in fake ? fake[p] : p === "runtime" ? runtime : chrome[p]),
  });
  const runtime = new Proxy({ id: "test", lastError: undefined, getURL: (p) => "chrome-extension://test/" + p }, {
    get: (t, p) => (p in t ? t[p] : anyApi(`chrome.runtime.${String(p)}`, listeners, calls)),
  });
  const errors = [];
  const context = vm.createContext({
    chrome: chromeObj, self: {}, console: { log() {}, info() {}, warn() {}, error: (...a) => errors.push(a.join(" ")) },
    setTimeout, clearTimeout, setInterval, clearInterval, URL, URLSearchParams, TextEncoder, TextDecoder,
    indexedDB: new IDBFactory(), IDBKeyRange, structuredClone, Promise, Date, Math, JSON,
  });
  context.globalThis = context;
  vm.runInContext(fs.readFileSync(BUNDLE, "utf8"), context, { filename: "serviceWorker.bundle.js" });
  return { listeners, calls, storage: fake.storage, errors };
}

function send(w, message) {
  const fns = w.listeners["chrome.runtime.onMessage"] || [];
  // Replies come from the vm's realm; copy them so deepStrictEqual compares values.
  return new Promise((resolve) => {
    const reply = (r) => resolve(JSON.parse(JSON.stringify(r)));
    const kept = fns.map((fn) => fn(message, { tab: { id: 1 } }, reply));
    if (!kept.some((k) => k === true)) resolve("not handled");
  });
}

test("the service worker starts and registers its message listener", () => {
  const w = loadWorker();
  assert.ok((w.listeners["chrome.runtime.onMessage"] || []).length >= 1);
  assert.deepEqual(w.errors, []);
});

test("search-delay messages get their answers", async () => {
  const w = loadWorker();
  const url = "https://www.google.com/search?q=cats";
  assert.deepEqual(await send(w, { action: "checkDelayStatus", url }), { inDelay: false });
  assert.deepEqual(await send(w, { action: "updateSearchDelay", delaySeconds: 30 }), { success: true });
  assert.deepEqual(await send(w, { action: "markDelayCompleted", url }), { success: true });
  assert.deepEqual(await send(w, { action: "startDelayDecrease" }), { success: true });
  assert.deepEqual(await send(w, { action: "cancelDelayDecrease" }), { success: true });
});

test("a delay on a custom engine is found again (no reload loop on Reddit and friends)", async () => {
  // The delay is stored under the URL standardised WITH the saved engines; the gate
  // page's status and "done" messages must look it up the same way.
  const url = "https://www.reddit.com/search/?q=cats&type=link";
  const key = "https://www.reddit.com/search/?q=cats";
  const w = loadWorker({
    sync: { searchDelaySeconds: 30, customSearchEngines: { reddit: { name: "Reddit", url: "https://www.reddit.com/search/?q=" } } },
    local: { activeDelays: { [key]: { startTime: Date.now(), completed: false } } },
  });
  await new Promise((r) => setTimeout(r, 20));
  const status = await send(w, { action: "checkDelayStatus", url });
  assert.equal(status.inDelay, true, JSON.stringify(status));
  assert.deepEqual(await send(w, { action: "markDelayCompleted", url }), { success: true });
  assert.equal(w.storage.local._data.activeDelays[key].completed, true);
});

test("tab-limit messages get their answers", async () => {
  const w = loadWorker();
  assert.deepEqual(await send(w, { action: "enforceLimit" }), { success: true });
  assert.deepEqual(await send(w, { action: "startIncrease" }), { success: true });
  assert.deepEqual(await send(w, { action: "cancelIncrease" }), { success: true });
});

test("an unknown message is left for other listeners", async () => {
  const w = loadWorker();
  assert.equal(await send(w, { action: "toString" }), "not handled");
  assert.equal(await send(w, { action: "nope" }), "not handled");
});

test("the archived Remover and PasteKit no longer answer, and their menu item is removed", async () => {
  const w = loadWorker();
  assert.equal(await send(w, { action: "getRemoverState", tabId: 1 }), "not handled");
  assert.equal(await send(w, { path: "page-to-background" }), "not handled");
  assert.equal(await send(w, { type: "pastekit:get-snippets" }), "not handled");
  assert.ok(w.calls.some((c) => c.name === "chrome.contextMenus.remove" && c.args[0] === "pastekit-save-selection"));
});
