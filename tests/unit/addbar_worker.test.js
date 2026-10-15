// The address bar's Add flow against the REAL worker script (serviceWorker.bundle.js), as it runs in Vivaldi:
// loaded into the browser window's own page. Chrome never delivers a message to the page that sent it, so
// the flow cannot reach the worker by chrome.runtime.sendMessage: a stand-in worker (addbar_flow.test.js) hid
// that, and in the real browser no site pills, page list or saving worked. These tests have no stand-in.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { openWindow } = require("./helpers/windowDom");

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let open = [];
test.afterEach(() => { for (const w of open) w.window.close(); open = []; });

const DAY = 86400000;
function history() {
  const rows = [];
  // Thousands of newer pages first, as in a real history, then the sites you have not opened lately.
  for (let i = 0; i < 4000; i++) rows.push({ url: `https://feed${i % 30}.example.com/post/${i}`, visitCount: 1, lastVisitTime: Date.now() - i * 1000 });
  rows.push({ url: "https://discord.com/channels/1", visitCount: 59, lastVisitTime: Date.now() - 20 * DAY });
  rows.push({ url: "https://www.netflix.com/browse", visitCount: 12, lastVisitTime: Date.now() - 30 * DAY });
  return rows.sort((a, b) => b.lastVisitTime - a.lastVisitTime);
}

async function start() {
  const w = await openWindow({ sync: { activeTabs: [{ id: 11, label: "Home", type: "bookmarks" }] } });
  open.push(w);
  const doc = w.window.document;
  doc.getElementById("browser").insertAdjacentHTML("beforeend", '<div class="UrlBar-AddressField"><input class="url"></div><div id="webpage-stack"></div>');
  // chrome.history answers like Chrome's: newest first, cut off at maxResults.
  w.window.chrome.history = { search: (q, cb) => { const all = history(); Promise.resolve().then(() => cb(all.slice(0, q.maxResults || 100))); } };
  assert.ok(w.window.__atlasWorker, "the worker script is loaded in the window");
  return w;
}

const input = (w) => w.window.document.querySelector(".atlas-addfield input");
const pills = (w) => [...w.window.document.querySelectorAll(".atlas-addcard [data-ab-site]")].map((b) => b.getAttribute("data-ab-site"));
const type = (w, el, value) => { el.value = value; el.dispatchEvent(new w.window.Event("input", { bubbles: true })); };
const enter = (w) => input(w).dispatchEvent(new w.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));

test("typing part of a site you visited long ago offers it, from the real worker", async () => {
  const w = await start();
  w.window.__Atlas.openAdd("bookmark");
  await wait(200);
  type(w, input(w), "dis");
  await wait(400);
  assert.deepEqual(pills(w), ["discord.com"]);
  type(w, input(w), "");
  await wait(400);
  assert.ok(pills(w).includes("discord.com") && pills(w).includes("netflix.com"), "the first pills are your most visited sites: " + pills(w));
  assert.deepEqual(w.errors, []);
});

test("a pick leads to the name and the page list, and Add saves the bookmark", async () => {
  const w = await start();
  w.window.__Atlas.openAdd("bookmark");
  await wait(200);
  type(w, input(w), "net");
  await wait(400);
  enter(w);                                   // takes the highlighted pill, netflix.com
  await wait(400);
  assert.equal(input(w).value, "Netflix", "the name comes from the worker");
  const card = w.window.document.querySelector(".atlas-addcard");
  assert.match(card.querySelector('[data-ab-dd="page"]').textContent, /Home/, "the page list comes from the worker");
  assert.ok(card.querySelector('[data-ab-newgroup]:not([hidden])'), "a new page has no groups yet, so a new group is asked for");
  type(w, card.querySelector('[data-ab-field="newGroup"]'), "shows");
  enter(w);                                   // Enter adds
  await wait(600);
  assert.equal(w.window.document.querySelector(".atlas-addcard"), null, "the flow closes once it is saved");
  const saved = await new Promise((resolve, reject) => {
    const r = w.window.indexedDB.open(w.window.AtlasProfiles.dbName());
    r.onsuccess = () => { const g = r.result.transaction(["bookmarks"]).objectStore("bookmarks").get(11); g.onsuccess = () => resolve(g.result); g.onerror = () => reject(g.error); };
    r.onerror = () => reject(r.error);
  });
  assert.deepEqual(JSON.parse(JSON.stringify(saved.data)), { SHOWS: [{ name: "Netflix", url: "https://netflix.com" }] });
  assert.deepEqual(w.errors, []);
});

test("Add page saves a page through the real worker", async () => {
  const w = await start();
  w.window.__Atlas.openAdd("page");
  await wait(200);
  type(w, input(w), "Gym");
  enter(w);
  await wait(200);
  type(w, input(w), "Lifting and cardio plans");
  enter(w);
  await wait(500);
  assert.equal(w.window.document.querySelector(".atlas-addcard"), null);
  const { activeTabs } = await w.window.chrome.storage.sync.get(["activeTabs"]);
  assert.deepEqual(Array.from(activeTabs, (t) => t.label), ["Home", "Gym"]);
  assert.deepEqual(w.errors, []);
});
