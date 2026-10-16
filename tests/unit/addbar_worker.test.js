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

test("a pick leads to the name and the page list; a page with no groups gets one from Add group; Add saves the bookmark", async () => {
  const w = await start();
  w.window.__Atlas.openAdd("bookmark");
  await wait(200);
  type(w, input(w), "net");
  await wait(400);
  enter(w);                                   // takes the highlighted pill, netflix.com
  await wait(400);
  assert.equal(input(w).value, "Netflix", "the name comes from the worker");
  enter(w);                                   // the name: on to the page and group
  await wait(100);
  const card = () => w.window.document.querySelector(".atlas-addcard");
  assert.match(card().querySelector('[data-ab-dd="page"]').textContent, /Home/, "the page list comes from the worker");
  assert.equal(card().querySelector(".atlas-addnone").textContent, "None yet", "a new page has no groups yet");
  assert.equal(card().querySelector("[data-ab-save]").textContent, "Add group");
  enter(w);                                   // Add group: its name
  await wait(100);
  type(w, input(w), "shows");
  enter(w);                                   // on to its page
  await wait(100);
  enter(w);                                   // Enter adds the group, and comes back to the bookmark
  await wait(600);
  assert.equal(card().querySelector('[data-ab-dd="group"] span').textContent, "SHOWS", "the group the real worker saved is the one chosen");
  enter(w);                                   // Enter adds the bookmark
  await wait(600);
  assert.equal(card(), null, "the flow closes once it is saved");
  const saved = await new Promise((resolve, reject) => {
    const r = w.window.indexedDB.open(w.window.AtlasProfiles.dbName());
    r.onsuccess = () => { const g = r.result.transaction(["bookmarks"]).objectStore("bookmarks").get(11); g.onsuccess = () => resolve(g.result); g.onerror = () => reject(g.error); };
    r.onerror = () => reject(r.error);
  });
  assert.deepEqual(JSON.parse(JSON.stringify(saved.data)), { SHOWS: [{ name: "Netflix", url: "https://netflix.com" }] });
  assert.deepEqual(w.errors, []);
});

test("Shift+Enter saves the typed address with its path, through the real worker", async () => {
  const w = await start();
  w.window.__Atlas.openAdd("bookmark");
  await wait(200);
  type(w, input(w), "discord.com/channels/9");
  await wait(400);
  assert.deepEqual(pills(w), ["discord.com"], "the pill is the main address only");
  input(w).dispatchEvent(new w.window.KeyboardEvent("keydown", { key: "Enter", shiftKey: true, bubbles: true, cancelable: true }));
  await wait(400);
  assert.equal(input(w).value, "Discord");
  enter(w);                                   // the name
  await wait(100);
  enter(w);                                   // Add group: its name
  await wait(100);
  type(w, input(w), "chat");
  enter(w);                                   // its page
  await wait(100);
  enter(w);                                   // adds the group, and comes back to the bookmark
  await wait(600);
  enter(w);                                   // adds the bookmark
  await wait(600);
  const saved = await new Promise((resolve, reject) => {
    const r = w.window.indexedDB.open(w.window.AtlasProfiles.dbName());
    r.onsuccess = () => { const g = r.result.transaction(["bookmarks"]).objectStore("bookmarks").get(11); g.onsuccess = () => resolve(g.result); g.onerror = () => reject(g.error); };
    r.onerror = () => reject(r.error);
  });
  assert.deepEqual(JSON.parse(JSON.stringify(saved.data)), { CHAT: [{ name: "Discord", url: "https://discord.com/channels/9" }] });
  assert.deepEqual(w.errors, []);
});

test("Add group saves a group with nothing in it through the real worker, and refuses a name the page has", async () => {
  const w = await start();
  w.window.__Atlas.openAdd("group");
  await wait(200);
  type(w, input(w), "gym");
  enter(w);                                   // its page
  await wait(150);
  enter(w);                                   // adds it
  await wait(600);
  assert.equal(w.window.document.querySelector(".atlas-addcard"), null, "closed once saved");
  const groupsOf = () => new Promise((resolve, reject) => {
    const r = w.window.indexedDB.open(w.window.AtlasProfiles.dbName());
    r.onsuccess = () => { const g = r.result.transaction(["bookmarks"]).objectStore("bookmarks").get(11); g.onsuccess = () => resolve(g.result); g.onerror = () => reject(g.error); };
    r.onerror = () => reject(r.error);
  });
  assert.deepEqual(JSON.parse(JSON.stringify((await groupsOf()).data)), { GYM: [] }, "the group is there, empty");

  w.window.__Atlas.openAdd("group");
  await wait(200);
  type(w, input(w), "Gym");
  enter(w);
  await wait(150);
  enter(w);
  await wait(600);
  assert.match(w.window.document.querySelector("[data-ab-error]").textContent, /GYM already exists on this page/);
  assert.ok(w.window.document.querySelector(".atlas-addcard"), "still open, so the name can be changed");
  assert.deepEqual(JSON.parse(JSON.stringify((await groupsOf()).data)), { GYM: [] }, "nothing was added twice");
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
