// "Add bookmark" and "Add page" in the address bar (src/modules/23-addbar-core.js, 24-addbar-screens.js):
// a field over the bar and a card under it, on whatever page you are on. The service worker's answers
// (background/addFlow.js) are played by a stand-in so each screen can be driven.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { openWindow } = require("./helpers/windowDom");

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const plain = (v) => JSON.parse(JSON.stringify(v));
let open = [];
test.afterEach(() => { for (const w of open) w.window.close(); open = []; });

const PAGES = [{ id: 11, label: "Home" }, { id: 12, label: "Streaming" }];
const SITES = { "": ["netflix.com", "reddit.com"], net: ["netflix.com", "netlify.com"] };

/** A window with an address field, a page area, and a service worker that answers like the real one. */
async function start({ thisUrl = "https://www.example.com/post", groups = { 11: ["SHOWS", "WORK"], 12: [] }, rect } = {}) {
  const w = await openWindow();
  open.push(w);
  const doc = w.window.document;
  doc.getElementById("browser").insertAdjacentHTML("beforeend",
    '<div class="toolbar-mainbar"><div class="UrlBar-AddressField"><input class="url"></div></div><div id="webpage-stack"></div>');
  if (rect) doc.querySelector(".UrlBar-AddressField").getBoundingClientRect = () => rect;
  w.asked = [];
  w.saved = { bookmarks: [], pages: [] };
  w.fail = null;
  w.window.chrome.tabs.query = (q, cb) => cb([{ id: 1, url: thisUrl }]);
  w.window.chrome.runtime.sendMessage = (msg, cb) => {
    w.asked.push(plain(msg));
    const reply = (r) => Promise.resolve().then(() => cb(plain(r)));
    if (w.fail && msg.action === w.fail.action) return reply(w.fail.reply);
    if (msg.action === "addInfo") return reply({ pages: PAGES });
    if (msg.action === "addGroups") return reply({ groups: groups[msg.page] || [] });
    if (msg.action === "addSuggest") {
      const list = (SITES[msg.typed] || SITES[""]).map((d) => ({ label: d, value: d }));
      const here = msg.thisUrl ? [{ label: "example.com · this page", value: "example.com" }] : [];
      const host = String(msg.typed || "").replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
      const cap = (x) => x.charAt(0).toUpperCase() + x.slice(1);
      return reply({ sites: [...here, ...list].slice(0, 8), names: host.includes(".") ? [cap(host.split(".")[0]), cap(host)] : [] });
    }
    if (msg.action === "addBookmark") { w.saved.bookmarks.push(plain(msg)); return reply({ ok: true }); }
    if (msg.action === "addPage") { w.saved.pages.push(plain(msg)); return reply({ ok: true }); }
    return reply({});
  };
  return w;
}

const $ = (w, sel) => w.window.document.querySelector(sel);
const card = (w) => $(w, ".atlas-addcard");
const field = (w) => $(w, ".atlas-addfield");
const ask = (w) => input(w).placeholder;                       // the question is the bar's placeholder
const step = (w) => input(w).getAttribute("data-ab-field");     // url, name | pageName, sub
const pills = (w) => [...card(w).querySelectorAll("[data-ab-site]")].map((b) => b.getAttribute("data-ab-site"));
const click = (w, el) => el.dispatchEvent(new w.window.MouseEvent("click", { bubbles: true }));
const type = (w, el, value) => { el.value = value; el.dispatchEvent(new w.window.Event("input", { bubbles: true })); };
const key = (w, el, k) => el.dispatchEvent(new w.window.KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
const input = (w) => field(w).querySelector("input");
const next = async (w) => { key(w, input(w), "Enter"); await wait(60); };   // screen 1 has no button: Enter moves on
async function opened(w, mode = "bookmark") { w.window.__Atlas.openAdd(mode); await wait(80); }

test("it opens over the address bar on any page: a small field, a card under it, the page dimmed", async () => {
  const w = await start({ rect: { left: 200, top: 10, width: 600, height: 30, right: 800, bottom: 40 } });
  await opened(w);
  assert.ok($(w, ".atlas-addscrim") && field(w) && card(w));
  assert.ok(w.window.document.getElementById("browser").classList.contains("atlas-add-open"));
  assert.equal(ask(w), "Type a website to bookmark, or pick one below", "an instruction in the bar, like the address bar's own");
  assert.equal(field(w).querySelector(".atlas-addchip"), null, "no 'Add bookmark 1/2' chip");
  assert.equal(step(w), "url");
  assert.equal(field(w).querySelector("[data-ab-back]"), null, "nothing to go back to on screen 1");
  assert.deepEqual([field(w).style.left, field(w).style.top, field(w).style.width], ["200px", "10px", "600px"], "the same place and width as the address field");
  assert.deepEqual([card(w).style.left, card(w).style.top, card(w).style.width], ["200px", "40px", "600px"], "the card hangs under it, 30px field");
  assert.equal(card(w).querySelector("button:not([data-ab-site])"), null, "screen 1 has no buttons: Enter or a pill moves on, Esc cancels");
  assert.match(card(w).textContent, /Esc cancels/);
  assert.deepEqual(w.errors, []);
});

test("it is never narrower than it can use, nor wider than the address bar's 620px", async () => {
  const w = await start({ rect: { left: 300, top: 10, width: 300, height: 30, right: 600, bottom: 40 } });
  await opened(w);
  assert.equal(field(w).style.width, "360px");
  assert.equal(field(w).style.left, "270px", "centred on the same middle");
  const wide = await start({ rect: { left: 100, top: 10, width: 800, height: 30, right: 900, bottom: 40 } });
  await opened(wide);
  assert.equal(field(wide).style.width, "620px");
  assert.equal(field(wide).style.left, "190px");
});

test("the first pill is the page you are on, then sites you visit; typing narrows them", async () => {
  const w = await start();
  await opened(w);
  assert.deepEqual(pills(w), ["example.com", "netflix.com", "reddit.com"]);
  assert.match(card(w).querySelector('[data-ab-site][aria-selected="true"]').textContent, /example\.com · this page/);
  assert.match(card(w).textContent, /Enter picks example\.com/);
  type(w, input(w), "net");
  await wait(150);
  assert.deepEqual(pills(w), ["example.com", "netflix.com", "netlify.com"]);
  assert.deepEqual(w.asked.filter((m) => m.action === "addSuggest").at(-1), { action: "addSuggest", db: "DetractlessBookmarks", typed: "net", thisUrl: "https://www.example.com/post" });
  key(w, input(w), "ArrowDown");
  assert.match(card(w).querySelector('[data-ab-site][aria-selected="true"]').textContent, /netflix\.com/, "arrows move the pick");
});

test("a pick goes to screen 2, named for the site, with the first page and its first group", async () => {
  const w = await start();
  await opened(w);
  type(w, input(w), "netflix.com");
  await wait(120);
  key(w, input(w), "Enter");              // nothing picked yet but pills show: Enter takes the highlighted one
  await wait(150);
  assert.equal(step(w), "name");
  assert.equal(ask(w), "Name this bookmark, or pick a name below");
  assert.match(card(w).querySelector(".atlas-addhint").textContent, /^Name this bookmark, or pick a name above · Enter adds · Esc cancels$/);
  assert.equal(input(w).value, "Example", "the name is filled in from the pick");
  assert.ok(field(w).querySelector("[data-ab-back]"), "a small back arrow in the bar");
  assert.equal(card(w).querySelectorAll("[data-ab-dd], [data-ab-save]").length, 3, "one row: Page, Group, Add");
  assert.deepEqual([...card(w).querySelectorAll("[data-ab-name]")].map((b) => b.textContent), ["Example", "Example.com"]);
  assert.equal(card(w).querySelector('[data-ab-dd="page"] span').textContent, "Home");
  assert.equal(card(w).querySelector('[data-ab-dd="group"] span').textContent, "SHOWS");
});

test("Back keeps what was typed, and a name you changed is kept", async () => {
  const w = await start({ thisUrl: "" });
  await opened(w);
  type(w, input(w), "netflix.com");
  await wait(120);
  await next(w);
  assert.equal(input(w).value, "Netflix");
  type(w, input(w), "Movie night");
  click(w, field(w).querySelector("[data-ab-back]"));
  await wait(60);
  assert.equal(step(w), "url");
  assert.equal(input(w).value, "netflix.com");
  await next(w);
  assert.equal(input(w).value, "Movie night");
  click(w, card(w).querySelector('[data-ab-name="Netflix.com"]'));
  assert.equal(input(w).value, "Netflix.com", "a name pill fills the name");
});

test("Add sends the bookmark to the service worker and closes; the other choices are in the drop-downs", async () => {
  const w = await start({ thisUrl: "" });
  await opened(w);
  type(w, input(w), "netflix.com");
  await wait(120);
  await next(w);
  await wait(80);
  assert.ok(card(w).querySelector('[data-ab-menu="page"]').hidden);
  click(w, card(w).querySelector('[data-ab-dd="page"]'));
  assert.ok(!card(w).querySelector('[data-ab-menu="page"]').hidden, "the page list opens");
  click(w, [...card(w).querySelectorAll('[data-ab-item="page"]')].find((b) => b.textContent === "Streaming"));
  await wait(80);
  assert.equal(card(w).querySelector('[data-ab-dd="group"] span').textContent, "+ New group", "a page with no groups starts a new one");
  assert.ok(!card(w).querySelector("[data-ab-newgroup]").hidden);
  click(w, card(w).querySelector("[data-ab-save]"));
  await wait(40);
  assert.match(card(w).querySelector("[data-ab-error]").textContent, /new group a name/);
  type(w, card(w).querySelector('[data-ab-field="newGroup"]'), "watch");
  click(w, card(w).querySelector("[data-ab-save]"));
  await wait(80);
  assert.deepEqual(w.saved.bookmarks, [{ action: "addBookmark", db: "DetractlessBookmarks", name: "Netflix", url: "netflix.com", page: 12, group: "WATCH", newGroup: true }]);
  assert.equal(card(w), null, "closed once saved");
  assert.ok(!w.window.document.getElementById("browser").classList.contains("atlas-add-open"));
});

test("a refusal from the service worker is shown and the flow stays open", async () => {
  const w = await start({ thisUrl: "" });
  await opened(w);
  type(w, input(w), "netflix.com"); await wait(120); await next(w); await wait(80);
  w.fail = { action: "addBookmark", reply: { error: "WORK already exists on this page." } };
  click(w, card(w).querySelector("[data-ab-save]"));
  await wait(80);
  assert.match(card(w).querySelector("[data-ab-error]").textContent, /already exists/);
  type(w, input(w), "");
  click(w, card(w).querySelector("[data-ab-save]"));
  assert.match(card(w).querySelector("[data-ab-error]").textContent, /name/i, "a missing name is caught here, before asking");
});

test("Add page: its name, then a subtitle of three to five words", async () => {
  const w = await start();
  await opened(w, "page");
  assert.equal(ask(w), "Give the new page a name, like Streaming");
  assert.equal(field(w).querySelector(".atlas-addchip"), null, "no chip on the page screens either");
  assert.equal(step(w), "pageName");
  assert.match(card(w).textContent, /empty is Page 3/, "the default name, from the pages there are");
  type(w, input(w), "Gym");
  await next(w);
  assert.equal(step(w), "sub");
  assert.equal(ask(w), "Add a short subtitle, 3 to 5 words");
  type(w, input(w), "Lifting");
  assert.match(card(w).querySelector("[data-ab-count]").textContent, /1 of 3-5 words · 7 \/ 32/);
  click(w, card(w).querySelector("[data-ab-save]"));
  assert.match(card(w).querySelector("[data-ab-error]").textContent, /at least 3 words/);
  assert.equal(w.saved.pages.length, 0);
  type(w, input(w), "Workouts and meal plans");
  click(w, card(w).querySelector("[data-ab-save]"));
  await wait(80);
  assert.deepEqual(w.saved.pages, [{ action: "addPage", label: "Gym", sub: "Workouts and meal plans" }]);
  assert.equal(card(w), null);
});

test("Escape closes the drop-down first, then the flow; the backdrop, another tab and a new flow close it too", async () => {
  const w = await start({ thisUrl: "" });
  await opened(w);
  type(w, input(w), "netflix.com"); await wait(120); await next(w); await wait(80);
  click(w, card(w).querySelector('[data-ab-dd="group"]'));
  w.window.document.dispatchEvent(new w.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  assert.ok(card(w), "the first Escape only closes the list");
  assert.ok(card(w).querySelector('[data-ab-menu="group"]').hidden);
  w.window.document.dispatchEvent(new w.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  assert.equal(card(w), null, "the second closes the flow");
  assert.equal(w.saved.bookmarks.length, 0, "nothing was saved");

  await opened(w);
  $(w, ".atlas-addscrim").dispatchEvent(new w.window.MouseEvent("mousedown", { bubbles: true, cancelable: true }));
  assert.equal(card(w), null, "clicking the dimmed page closes it");

  await opened(w);
  for (const fn of w.listeners["chrome.tabs.onActivated"] || []) fn({ tabId: 5 });
  assert.equal(card(w), null, "switching tabs closes it");

  await opened(w);
  await opened(w, "page");
  assert.equal(w.window.document.querySelectorAll(".atlas-addcard").length, 1, "only one flow at a time");
  assert.equal(ask(w), "Give the new page a name, like Streaming");
});

test("clicking a pill moves on, named for the pick", async () => {
  const w = await start();
  await opened(w);
  click(w, card(w).querySelector('[data-ab-site="netflix.com"]'));
  await wait(120);
  assert.equal(step(w), "name");
  assert.equal(input(w).value, "Netflix");
});
