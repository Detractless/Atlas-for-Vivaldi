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
    ...(seed.history ? { history: { search: (q, cb) => Promise.resolve().then(() => cb(seed.history)) } } : {}),
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
  return { listeners, calls, storage: fake.storage, errors, idb: context.indexedDB };
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

test("usage from pages is added to the totals, two at once without losing either", async () => {
  const w = loadWorker();
  const msg = (host, delta) => ({ action: "recordUsage", host, delta });
  const results = await Promise.all([
    send(w, msg("youtube.com", { visibleMs: 30000, pageViews: 1, imagesSeen: 3 })),
    send(w, msg("www.youtube.com", { visibleMs: 20000, clicks: 2 })),
    send(w, msg("reddit.com", { visibleMs: 5000 })),
  ]);
  assert.deepEqual(results, [{ success: true }, { success: true }, { success: true }]);
  const store = w.storage.local._data.atlas_usage;
  const hour = Object.values(store.hours)[0];
  assert.equal(hour["youtube.com"].visibleMs, 50000, "www. and plain are one site, and nothing was overwritten");
  assert.equal(hour["youtube.com"].clicks, 2);
  assert.equal(hour["reddit.com"].visibleMs, 5000);
  assert.deepEqual(w.errors, []);
});

test("usage with a bad host or nothing to add is ignored, and the totals can be cleared", async () => {
  const w = loadWorker();
  await send(w, { action: "recordUsage", host: "https://x.com/secret", delta: { visibleMs: 1000 } });
  await send(w, { action: "recordUsage", host: "ok.com", delta: { junk: 5 } });
  assert.equal(w.storage.local._data.atlas_usage, undefined, "nothing saved");
  await send(w, { action: "recordUsage", host: "ok.com", delta: { clicks: 1 } });
  assert.ok(w.storage.local._data.atlas_usage);
  assert.deepEqual(await send(w, { action: "clearUsage" }), { success: true });
  assert.equal(w.storage.local._data.atlas_usage, undefined, "cleared");
});

/* ── Add bookmark / Add page from the address bar (background/addFlow.js) ── */

const DB = "DetractlessBookmarks";
const PAGES = [{ id: "search", label: "Home", type: "search" }, { id: 1, label: "Essentials", type: "bookmarks", sub: "Everything you need" }];
const stored = (w, page) => new Promise((resolve, reject) => {
  const open = w.idb.open(DB);
  open.onsuccess = () => {
    const req = open.result.transaction(["bookmarks"], "readonly").objectStore("bookmarks").get(page);
    req.onsuccess = () => { resolve(JSON.parse(JSON.stringify(req.result ? req.result.data : null))); open.result.close(); };
    req.onerror = () => reject(req.error);
  };
  open.onerror = () => reject(open.error);
});
const toldNewTabs = (w) => w.calls.filter((c) => c.name === "chrome.runtime.sendMessage" && c.args[0] && c.args[0].atlas && c.args[0].atlas.act === "data-changed").length;

test("the bar asks which pages bookmarks can go on, and which groups a page has", async () => {
  const w = loadWorker({ sync: { activeTabs: PAGES } });
  assert.deepEqual(await send(w, { action: "addInfo" }), { pages: [{ id: 1, label: "Essentials" }] }, "not the search page");
  assert.deepEqual(await send(w, { action: "addGroups", db: DB, page: 1 }), { groups: [] }, "a page with no bookmarks yet");
});

test("a bookmark added from the bar is saved on its page and group, with https:// added, and new tabs are told", async () => {
  const w = loadWorker({ sync: { activeTabs: PAGES } });
  const add = (extra) => send(w, { action: "addBookmark", db: DB, name: "Netflix", url: "netflix.com", page: 1, group: "WATCH", ...extra });
  assert.deepEqual(await add(), { ok: true });
  assert.deepEqual(await stored(w, 1), { WATCH: [{ name: "Netflix", url: "https://netflix.com" }] });
  assert.deepEqual(await send(w, { action: "addGroups", db: DB, page: 1 }), { groups: ["WATCH"] });
  assert.deepEqual(await add({ name: "Disney+", url: "https://disneyplus.com/home" }), { ok: true });
  assert.deepEqual((await stored(w, 1)).WATCH.map((b) => b.url), ["https://netflix.com", "https://disneyplus.com/home"]);
  assert.equal(toldNewTabs(w), 2, "told once per saved bookmark");
  assert.match((await send(w, { action: "addBookmark", db: DB, name: "", url: "x.com", page: 1, group: "A" })).error, /missing/i);
  assert.deepEqual(w.errors, []);
});

test("a group added from the bar is saved with nothing in it, a name the page has is refused, and new tabs are told", async () => {
  const w = loadWorker({ sync: { activeTabs: PAGES } });
  const add = (group, page = 1) => send(w, { action: "addGroup", db: DB, page, group });
  assert.deepEqual(await add("MOVIES"), { ok: true });
  assert.deepEqual(await stored(w, 1), { MOVIES: [] }, "an empty group");
  assert.deepEqual(await send(w, { action: "addGroups", db: DB, page: 1 }), { groups: ["MOVIES"] }, "the bar can offer it");
  assert.match((await add("MOVIES")).error, /MOVIES already exists on this page/);
  assert.deepEqual(await stored(w, 1), { MOVIES: [] }, "nothing changed");
  assert.deepEqual(await send(w, { action: "addBookmark", db: DB, name: "Netflix", url: "netflix.com", page: 1, group: "MOVIES" }), { ok: true }, "a bookmark can go into it");
  assert.deepEqual((await stored(w, 1)).MOVIES, [{ name: "Netflix", url: "https://netflix.com" }]);
  assert.equal(toldNewTabs(w), 2, "told once for the group and once for the bookmark");
  assert.match((await add("")).error, /missing/i);
  assert.match((await send(w, { action: "addGroup", db: DB, group: "X" })).error, /missing/i, "a page is needed");
  assert.deepEqual(w.errors, []);
});

/* ── Right-click on the new tab: change a bookmark, group or page (background/editFlow.js) ── */

const PAGES2 = [...PAGES, { id: 2, label: "Streaming", type: "bookmarks", sub: "Shows and movies" }];
const put = (w, page, group, name, url) => send(w, { action: "addBookmark", db: DB, name, url, page, group });

test("a bookmark changed from the bar is renamed, re-addressed or deleted, and its group goes with the last one", async () => {
  const w = loadWorker({ sync: { activeTabs: PAGES } });
  await put(w, 1, "WATCH", "Netflix", "netflix.com");
  await put(w, 1, "WATCH", "Disney+", "disneyplus.com");
  const edit = (op, extra, name = "Netflix", url = "https://netflix.com") => send(w, { action: "editBookmark", db: DB, page: 1, group: "WATCH", name, url, op, ...extra });
  const told = toldNewTabs(w);
  assert.deepEqual(await edit("rename", { value: "  Netflix HQ " }), { ok: true });
  assert.deepEqual((await stored(w, 1)).WATCH.map((b) => b.name), ["Netflix HQ", "Disney+"], "renamed in place, trimmed");
  assert.match((await edit("rename", { value: "  " }, "Netflix HQ")).error, /Give the bookmark a name/);
  assert.deepEqual(await edit("url", { value: "netflix.com/browse" }, "Netflix HQ"), { ok: true });
  assert.equal((await stored(w, 1)).WATCH[0].url, "https://netflix.com/browse", "https:// added");
  assert.match((await edit("url", { value: "" }, "Netflix HQ", "https://netflix.com/browse")).error, /Give the bookmark a URL/);
  assert.match((await edit("rename", { value: "x" }, "Nobody")).error, /not there any more/);
  assert.equal(toldNewTabs(w), told + 2, "new tabs are told once per change that worked");
  assert.deepEqual(await edit("delete", {}, "Netflix HQ", "https://netflix.com/browse"), { ok: true });
  assert.deepEqual((await stored(w, 1)).WATCH.map((b) => b.name), ["Disney+"], "the group is still there");
  assert.deepEqual(await edit("delete", {}, "Disney+", "https://disneyplus.com"), { ok: true });
  assert.deepEqual(await stored(w, 1), {}, "the last bookmark takes its group with it");
  assert.match((await send(w, { action: "editBookmark", db: DB, page: 1, group: "WATCH", name: "a", url: "b", op: "fly" })).error, /missing/i);
  assert.deepEqual(w.errors, []);
});

test("a group changed from the bar is renamed in place, moved unless the other page has the name, or deleted", async () => {
  const w = loadWorker({ sync: { activeTabs: PAGES2 } });
  await put(w, 1, "WATCH", "Netflix", "netflix.com");
  await put(w, 1, "WORK", "Notion", "notion.so");
  await put(w, 2, "WORK", "Slack", "slack.com");
  const edit = (op, extra, group = "WATCH", page = 1) => send(w, { action: "editGroup", db: DB, page, group, op, ...extra });
  assert.deepEqual(await edit("rename", { value: " binge " }), { ok: true });
  assert.deepEqual(Object.keys(await stored(w, 1)), ["BINGE", "WORK"], "capitals, and still first");
  assert.match((await edit("rename", { value: "work" }, "BINGE")).error, /already exists/);
  assert.match((await edit("rename", { value: " " }, "BINGE")).error, /Give the group a name/);
  assert.deepEqual(await edit("rename", { value: "Binge" }, "BINGE"), { ok: true }, "the same name is not an error");
  assert.match((await edit("move", { to: 2 }, "WORK")).error, /WORK already exists on that page/, "a same-named group on the other page is refused");
  assert.deepEqual((await stored(w, 2)).WORK, [{ name: "Slack", url: "https://slack.com" }], "and left as it was");
  assert.deepEqual((await stored(w, 1)).WORK, [{ name: "Notion", url: "https://notion.so" }], "with nothing lost here either");
  assert.match((await edit("move", { to: 1 }, "BINGE")).error, /another page/);
  assert.deepEqual(await edit("move", { to: 2 }, "BINGE"), { ok: true });
  assert.deepEqual(Object.keys(await stored(w, 1)), ["WORK"]);
  assert.deepEqual(Object.keys(await stored(w, 2)), ["WORK", "BINGE"]);
  assert.deepEqual((await stored(w, 2)).BINGE, [{ name: "Netflix", url: "https://netflix.com" }], "its bookmarks came along");
  assert.deepEqual(await edit("delete", {}, "WORK"), { ok: true });
  assert.deepEqual(await stored(w, 1), {});
  assert.match((await edit("delete", {}, "WORK")).error, /not there any more/);
  assert.deepEqual(w.errors, []);
});

test("a page changed from the bar is renamed, given a subtitle or deleted with its bookmarks; Home stays", async () => {
  const w = loadWorker({ sync: { activeTabs: PAGES2, page2: "old" } });
  await put(w, 2, "WATCH", "Netflix", "netflix.com");
  const edit = (op, extra, id = 2) => send(w, { action: "editPage", db: DB, id, op, ...extra });
  assert.deepEqual(await edit("rename", { value: " Binge " }), { ok: true });
  assert.equal(w.storage.sync._data.activeTabs[2].label, "Binge");
  assert.match((await edit("rename", { value: "" })).error, /Give the page a name/);
  assert.match((await edit("sub", { value: "Lifting" })).error, /at least 3 words/);
  assert.deepEqual(await edit("sub", { value: "Shows   and movies list" }), { ok: true });
  assert.equal(w.storage.sync._data.activeTabs[2].sub, "Shows and movies list");
  assert.match((await edit("delete", {}, "search")).error, /Home/, "Home is kept");
  assert.equal(w.storage.sync._data.activeTabs.length, 3);
  assert.deepEqual(await edit("delete", {}), { ok: true });
  assert.deepEqual(w.storage.sync._data.activeTabs.map((t) => t.id), ["search", 1]);
  assert.equal(await stored(w, 2), null, "its bookmarks went with it");
  assert.equal(w.storage.sync._data.page2, undefined, "and its saved page data");
  assert.match((await edit("delete", {})).error, /not there any more/);
  assert.deepEqual(w.errors, []);
});

test("a page added from the bar joins the page list with its subtitle, and a bad subtitle is refused", async () => {
  const w = loadWorker({ sync: { activeTabs: PAGES } });
  assert.match((await send(w, { action: "addPage", label: "Gym", sub: "Lifting" })).error, /at least 3 words/);
  assert.equal(w.storage.sync._data.activeTabs.length, 2, "nothing added yet");
  const r = await send(w, { action: "addPage", label: " Gym ", sub: "Workouts   and meal plans" });
  assert.equal(r.ok, true);
  const added = w.storage.sync._data.activeTabs[2];
  assert.deepEqual([added.label, added.sub, added.type, added.id], ["Gym", "Workouts and meal plans", "bookmarks", r.id]);
  assert.equal(toldNewTabs(w), 1);
  const blank = loadWorker();
  assert.match((await send(blank, { action: "addPage", label: "Gym", sub: "Workouts and meal plans" })).error, /new tab once/);
});

test("typing offers the main address of visited sites, the page you are on first, and not what is saved already", async () => {
  const history = [
    { url: "https://www.netflix.com/browse", visitCount: 40 }, { url: "https://netlify.com/", visitCount: 5 },
    { url: "https://docs.google.com/document/d/1/edit", visitCount: 9 }, { url: "https://www.nytimes.com/", visitCount: 12 },
  ];
  const w = loadWorker({ sync: { activeTabs: PAGES }, history });
  const ask = (typed, thisUrl = "") => send(w, { action: "addSuggest", db: DB, typed, thisUrl });
  assert.deepEqual((await ask("net")).sites.map((s) => s.value), ["netflix.com", "netlify.com"]);
  const here = await ask("", "https://www.nytimes.com/section/world");
  assert.deepEqual(here.sites[0], { label: "nytimes.com · this page", value: "nytimes.com" });
  assert.equal(here.sites.filter((s) => s.value === "nytimes.com").length, 1, "once, not twice");
  await send(w, { action: "addBookmark", db: DB, name: "Netflix", url: "netflix.com", page: 1, group: "WATCH", newGroup: true });
  assert.ok(!(await ask("net")).sites.some((s) => s.value === "netflix.com"), "saved sites are not offered again");
  assert.deepEqual((await ask("netflix.com")).names, ["Netflix", "Netflix.com"]);
});

test("a database name that is not one is refused and answered, not left hanging", async () => {
  const w = loadWorker();
  assert.match((await send(w, { action: "addGroups", db: "../evil", page: 1 })).error, /did not work/);
  assert.equal(w.errors.length, 1, "and the failure is logged");
});
