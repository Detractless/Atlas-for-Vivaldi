// Right-click on the new tab, in the address bar, against the REAL worker script (serviceWorker.bundle.js) as it
// runs in Vivaldi: loaded into the browser window's own page, with a real IndexedDB. No stand-in worker here.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { openWindow } = require("./helpers/windowDom");

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let open = [];
test.afterEach(() => { for (const w of open) w.window.close(); open = []; });

const TABS = [
  { id: "search", label: "Home", type: "search" },
  { id: 11, label: "Essentials", type: "bookmarks", sub: "Everything you need" },
  { id: 12, label: "Streaming", type: "bookmarks", sub: "Shows and movies" },
];

async function start() {
  const w = await openWindow({ sync: { activeTabs: TABS, page12: "saved page data" } });
  open.push(w);
  w.window.document.getElementById("browser").insertAdjacentHTML("beforeend", '<div class="UrlBar-AddressField"><input class="url"></div><div id="webpage-stack"></div>');
  w.db = w.window.AtlasProfiles.dbName();
  w.ask = (msg) => w.window.__atlasWorker.ask({ db: w.db, ...msg });
  w.stored = (page) => new Promise((resolve, reject) => {
    const r = w.window.indexedDB.open(w.db);
    r.onsuccess = () => { const g = r.result.transaction(["bookmarks"]).objectStore("bookmarks").get(page); g.onsuccess = () => resolve(g.result ? JSON.parse(JSON.stringify(g.result.data)) : null); g.onerror = () => reject(g.error); };
    r.onerror = () => reject(r.error);
  });
  return w;
}

const input = (w) => w.window.document.querySelector(".atlas-addfield input");
const card = (w) => w.window.document.querySelector(".atlas-addcard");
const type = (w, el, value) => { el.value = value; el.dispatchEvent(new w.window.Event("input", { bubbles: true })); };
const enter = (w) => input(w).dispatchEvent(new w.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
const arrow = (w, k) => input(w).dispatchEvent(new w.window.KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
const told = (w) => w.control.sentMessages.filter((m) => m.atlas && m.atlas.act === "data-changed").length;

test("Rename saves a bookmark's new name in the database, and the new tab is told", async () => {
  const w = await start();
  await w.ask({ action: "addBookmark", name: "Slack", url: "slack.com", page: 11, group: "WORK" });
  const before = told(w);
  w.window.__Atlas.openEdit({ kind: "bookmark", page: 11, group: "WORK", name: "Slack", url: "https://slack.com" });
  await wait(200);
  enter(w);                                   // Rename
  await wait(100);
  type(w, input(w), "Slack HQ");
  enter(w);
  await wait(500);
  assert.equal(card(w), null, "the bar closes once it is saved");
  assert.deepEqual(await w.stored(11), { WORK: [{ name: "Slack HQ", url: "https://slack.com" }] });
  assert.equal(told(w), before + 1, "every new tab is told");
  assert.deepEqual(w.errors, []);
});

test("Move refuses a page that has the group's name, and nothing is lost", async () => {
  const w = await start();
  await w.ask({ action: "addBookmark", name: "Slack", url: "slack.com", page: 11, group: "WORK" });
  await w.ask({ action: "addBookmark", name: "Notion", url: "notion.so", page: 12, group: "WORK" });
  w.window.__Atlas.openEdit({ kind: "group", page: 11, group: "WORK", count: 1 });
  await wait(200);
  arrow(w, "ArrowRight");                     // Move to page
  enter(w);
  await wait(300);
  assert.equal(card(w).querySelector('[data-ab-dd="page"] span').textContent, "Streaming", "the pages come from the real worker");
  enter(w);                                   // Move
  await wait(500);
  assert.match(card(w).querySelector("[data-ab-error]").textContent, /WORK already exists on that page/);
  assert.deepEqual(await w.stored(11), { WORK: [{ name: "Slack", url: "https://slack.com" }] });
  assert.deepEqual(await w.stored(12), { WORK: [{ name: "Notion", url: "https://notion.so" }] }, "the group on the other page is untouched");
  assert.deepEqual(w.errors, []);
});

test("Move puts the group, with its bookmarks, on the other page", async () => {
  const w = await start();
  await w.ask({ action: "addBookmark", name: "Slack", url: "slack.com", page: 11, group: "WORK" });
  await w.ask({ action: "addBookmark", name: "Netflix", url: "netflix.com", page: 11, group: "WATCH" });
  w.window.__Atlas.openEdit({ kind: "group", page: 11, group: "WATCH", count: 1 });
  await wait(200);
  arrow(w, "ArrowRight");
  enter(w);
  await wait(300);
  enter(w);
  await wait(500);
  assert.equal(card(w), null);
  assert.deepEqual(Object.keys(await w.stored(11)), ["WORK"]);
  assert.deepEqual(await w.stored(12), { WATCH: [{ name: "Netflix", url: "https://netflix.com" }] });
});

test("Deleting a page removes it from the page list, with its bookmarks and saved page data", async () => {
  const w = await start();
  await w.ask({ action: "addBookmark", name: "Netflix", url: "netflix.com", page: 12, group: "WATCH" });
  w.window.__Atlas.openEdit({ kind: "page", id: 12, label: "Streaming", name: "Streaming", sub: "Shows and movies", type: "bookmarks" });
  await wait(200);
  arrow(w, "ArrowLeft");                      // Delete
  enter(w);
  await wait(100);
  assert.equal(input(w).value, "Delete Streaming and its bookmarks?");
  enter(w);
  await wait(600);
  assert.equal(card(w), null);
  const { activeTabs } = await w.window.chrome.storage.sync.get(["activeTabs", "page12"]);
  assert.deepEqual(Array.from(activeTabs, (t) => t.id), ["search", 11]);
  assert.equal((await w.window.chrome.storage.sync.get(["page12"])).page12, undefined, "the saved page data is gone");
  assert.equal(await w.stored(12), null, "and so are its bookmarks");
  assert.deepEqual(w.errors, []);
});

test("Subtitle: a bad one says why in the bar and saves nothing; a good one is saved", async () => {
  const w = await start();
  w.window.__Atlas.openEdit({ kind: "page", id: 12, label: "Streaming", name: "Streaming", sub: "Shows and movies", type: "bookmarks" });
  await wait(200);
  arrow(w, "ArrowRight");                     // Subtitle
  enter(w);
  await wait(100);
  type(w, input(w), "Lifting");
  enter(w);
  await wait(400);
  assert.match(card(w).querySelector("[data-ab-error]").textContent, /at least 3 words/);
  assert.equal((await w.window.chrome.storage.sync.get(["activeTabs"])).activeTabs[2].sub, "Shows and movies");
  type(w, input(w), "Movies and series list");
  enter(w);
  await wait(400);
  assert.equal(card(w), null);
  assert.equal((await w.window.chrome.storage.sync.get(["activeTabs"])).activeTabs[2].sub, "Movies and series list");
  assert.deepEqual(w.errors, []);
});
