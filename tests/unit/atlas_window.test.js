// Atlas's browser-window code (atlas.js from src/modules, plus profilesCore.js
// and the service-worker bundle it loads) in a stand-in window.html.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { openWindow } = require("./helpers/windowDom");

const plain = (v) => JSON.parse(JSON.stringify(v === undefined ? null : v));
let open = [];
test.afterEach(() => { for (const w of open) w.window.close(); open = []; });

async function start(opts) {
  const w = await openWindow(opts);
  open.push(w);
  return w;
}

test("atlas.js starts in the browser window without errors", async () => {
  const w = await start();
  assert.deepEqual(w.errors, []);
  assert.ok(w.window.__Atlas, "window.__Atlas exists");
  assert.equal(typeof w.window.__Atlas.showUiMenu, "function", "the toolbar menu is published for other modules");
});

test("the service worker defaults are seeded once", async () => {
  const w = await start({ sync: { tabLimit: 4 } });
  const got = plain(await w.chrome.storage.sync.get(["tabLimit", "managementMethod", "searchDelaySeconds", "showQueryOnDelay", "customSearchEngines"]));
  assert.deepEqual(got, { tabLimit: 4, managementMethod: "block", searchDelaySeconds: 0, showQueryOnDelay: true, customSearchEngines: {} });
  const local = plain(await w.chrome.storage.local.get(["activeDelays"]));
  assert.deepEqual(local, { activeDelays: {} });
});

test("the context-menu content script is registered", async () => {
  const w = await start();
  const reg = w.calls.find((c) => c.name === "chrome.scripting.getRegisteredContentScripts");
  assert.ok(reg, "asks which scripts are registered");
  const cb = reg.args.find((a) => typeof a === "function");
  cb(w.window.JSON.parse('[{"id":"detractless-rules"}]'));
  await new Promise((r) => setTimeout(r, 20));
  const registered = w.calls.filter((c) => c.name === "chrome.scripting.registerContentScripts").map((c) => plain(c.args[0])[0].id);
  // Called twice: the stand-in answers once by itself ("none registered") and once here.
  assert.deepEqual([...new Set(registered)], ["atlas-ctxmenu"]);
  const swept = w.calls.find((c) => c.name === "chrome.scripting.unregisterContentScripts");
  assert.deepEqual(plain(swept.args[0]), { ids: ["detractless-rules"] }, "an archived script registration is removed");
});

test("context-menu messages open tabs and downloads", async () => {
  const w = await start();
  w.control.deliver({ atlas: { act: "opentab", url: "https://a.test/" } });
  w.control.deliver({ atlas: { act: "download", url: "https://a.test/f.zip" } });
  await new Promise((r) => setTimeout(r, 20));
  const created = w.calls.filter((c) => c.name === "chrome.tabs.create").map((c) => plain(c.args[0]).url);
  assert.ok(created.includes("https://a.test/"));
  const dl = w.calls.find((c) => c.name === "chrome.downloads.download");
  assert.equal(plain(dl.args[0]).url, "https://a.test/f.zip");
});

test("http://home opens the Atlas new tab", async () => {
  const w = await start();
  for (const fn of w.listeners["chrome.tabs.onUpdated"] || []) fn(7, { url: "http://home/" }, { id: 7 });
  const upd = w.calls.find((c) => c.name === "chrome.tabs.update" && c.args[0] === 7);
  assert.ok(upd, "tab 7 is redirected");
  assert.match(plain(upd.args[1]).url, /^chrome-extension:\/\/[a-p]{32}\/index\.html$/);
});

/* ── Right-click menus in the browser window (05-contextmenu.js) ── */

function rightClick(w, el) {
  el.dispatchEvent(new w.window.MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 50, clientY: 40 }));
}
const menuLabels = (w) => [...w.window.document.querySelectorAll(".atlas-profile-menu .apm-item > span:first-child")].map((s) => s.textContent);

function answer(w, name, value) {
  const call = [...w.calls].reverse().find((c) => c.name === name);
  assert.ok(call, `${name} was called`);
  call.args.find((a) => typeof a === "function")(w.window.JSON.parse(JSON.stringify(value)));
}

test("right-clicking a tab shows the tab menu", async () => {
  const w = await start();
  const doc = w.window.document;
  doc.getElementById("browser").insertAdjacentHTML("beforeend", '<div class="tab-position"><div class="tab" id="tab-12">Page</div></div>');
  let hoverCardDismissed = false;
  doc.querySelector(".tab-position").addEventListener("mouseleave", () => { hoverCardDismissed = true; });
  rightClick(w, doc.getElementById("tab-12"));
  assert.ok(hoverCardDismissed, "the tab's hover card is dismissed");
  answer(w, "chrome.tabs.get", { id: 12, pinned: false, url: "https://a.test/", mutedInfo: { muted: false } });
  assert.deepEqual(menuLabels(w), ["Reload", "Duplicate", "Pin", "Mute", "Copy address", "Close"]);
  assert.ok(doc.querySelector(".tab.atlas-tab-context-active"), "the tab is marked while its menu is open");
  doc.querySelector(".atlas-profile-menu .apm-item").dispatchEvent(new w.window.MouseEvent("click", { bubbles: true }));
  assert.ok(w.calls.some((c) => c.name === "chrome.tabs.reload" && c.args[0] === 12), "Reload reloads tab 12");
  assert.equal(doc.querySelector(".atlas-profile-menu"), null, "the menu closes");
});

test("right-clicking the address field shows the edit menu", async () => {
  const w = await start();
  const doc = w.window.document;
  doc.getElementById("browser").insertAdjacentHTML("beforeend", '<div class="UrlBar-AddressField"><input value=""></div>');
  rightClick(w, doc.querySelector(".UrlBar-AddressField input"));
  assert.deepEqual(menuLabels(w), ["Cut", "Copy", "Paste", "Paste and go", "Select all"]);
  assert.ok(doc.querySelector(".atlas-profile-menu .apm-item.dis"), "Cut and Copy are off with no selection");
});

test("a misspelled word in the address field gets suggestions first", async () => {
  const w = await start();
  const doc = w.window.document;
  doc.getElementById("browser").insertAdjacentHTML("beforeend", '<div class="UrlBar-AddressField"><input value="helo"></div>');
  const input = doc.querySelector(".UrlBar-AddressField input");
  input.setSelectionRange(4, 4);
  rightClick(w, input);
  const labels = menuLabels(w);
  assert.deepEqual(labels.slice(-5), ["Cut", "Copy", "Paste", "Paste and go", "Select all"]);
  assert.ok(labels.length > 5, `suggestions offered: ${labels.join(", ")}`);
  doc.querySelector(".atlas-profile-menu .apm-item").dispatchEvent(new w.window.MouseEvent("click", { bubbles: true }));
  assert.equal(input.value, labels[0], "picking a suggestion replaces the word");
});

test("right-clicking a web page shows back, forward and reload", async () => {
  const w = await start();
  const doc = w.window.document;
  doc.getElementById("browser").insertAdjacentHTML("beforeend", '<div class="webpageview"><div id="pg">page</div></div>');
  rightClick(w, doc.getElementById("pg"));
  answer(w, "chrome.tabs.query", [{ id: 3, url: "https://b.test/" }]);
  assert.deepEqual(menuLabels(w), ["Back", "Forward", "Reload", "Copy address"]);
});

/* ── Extensions popover (09-extensions-native.js, 10-extensions-popover.js) ── */

async function openPopover(w, exts) {
  const doc = w.window.document;
  doc.getElementById("browser").insertAdjacentHTML("beforeend",
    '<div class="toolbar-extensions"><button data-name="Extensions">puzzle</button></div>');
  doc.querySelector('[data-name="Extensions"]').dispatchEvent(new w.window.MouseEvent("mousedown", { bubbles: true, cancelable: true }));
  answer(w, "chrome.management.getAll", exts);
  return doc.querySelector(".atlas-ext-pop");
}

const EXTS = [
  { id: "b".repeat(32), name: "Bravo", type: "extension", enabled: true, mayDisable: true, optionsUrl: "chrome-extension://b/opt.html", icons: [] },
  { id: "a".repeat(32), name: "Alpha", type: "extension", enabled: true, mayDisable: false, icons: [] },
  { id: "c".repeat(32), name: "Off one", type: "extension", enabled: false, icons: [] },
];

test("the Extensions button opens the Atlas popover, enabled extensions sorted", async () => {
  const w = await start();
  const pop = await openPopover(w, EXTS);
  assert.ok(pop, "popover shown");
  assert.deepEqual([...pop.querySelectorAll(".aep-name")].map((n) => n.textContent), ["Alpha", "Bravo"]);
  assert.equal(pop.querySelector(".aep-foot").textContent, "Manage extensions");
  pop.querySelector(".aep-foot").dispatchEvent(new w.window.MouseEvent("click", { bubbles: true }));
  assert.ok(w.calls.some((c) => c.name === "chrome.tabs.create" && plain(c.args[0]).url === "vivaldi://extensions"));
  assert.equal(w.window.document.querySelector(".atlas-ext-pop"), null, "popover closes");
});

test("right-clicking an extension in the popover shows its menu", async () => {
  const w = await start();
  const pop = await openPopover(w, EXTS);
  const bravo = [...pop.querySelectorAll(".aep-row")].find((r) => r.textContent.includes("Bravo"));
  bravo.dispatchEvent(new w.window.MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }));
  assert.deepEqual(menuLabels(w), ["Options", "Details", "Disable", "Remove…"]);
});

test("more than eight extensions get a search field and pages", async () => {
  const w = await start();
  const many = Array.from({ length: 11 }, (_, i) => ({ id: String.fromCharCode(97 + i).repeat(32), name: `Ext ${String(i).padStart(2, "0")}`, type: "extension", enabled: true, icons: [] }));
  const pop = await openPopover(w, many);
  assert.ok(pop.querySelector(".aep-search"), "search field");
  assert.equal(pop.querySelectorAll(".aep-row").length, 8);
  assert.equal(pop.querySelector(".aep-pager span").textContent, "1 / 2");
});

/* KNOWN BUG (found 2026-10-08, left as is: fixing it changes behavior outside the
   cleanup plan). drawExtPop starts with closeExtPop(), which resets extPopQuery,
   so every keystroke redraws the full list and empties the search field. */
test("typing in the popover search filters the list", { todo: "search field resets on every keystroke" }, async () => {
  const w = await start();
  const many = Array.from({ length: 11 }, (_, i) => ({ id: String.fromCharCode(97 + i).repeat(32), name: `Ext ${String(i).padStart(2, "0")}`, type: "extension", enabled: true, icons: [] }));
  const pop = await openPopover(w, many);
  const search = pop.querySelector(".aep-search");
  search.value = "ext 1";
  search.dispatchEvent(new w.window.Event("input", { bubbles: true }));
  const again = w.window.document.querySelector(".atlas-ext-pop");
  assert.deepEqual([...again.querySelectorAll(".aep-name")].map((n) => n.textContent), ["Ext 10"]);
});

/* ── Corner avatar menu (07-profile-menu.js) and menus closing each other ── */

async function openProfileMenu(w) {
  const doc = w.window.document;
  doc.getElementById("browser").insertAdjacentHTML("beforeend",
    '<div class="toolbar-mainbar"><button data-name="AccountButton">P</button></div>');
  doc.querySelector('[data-name="AccountButton"]').dispatchEvent(new w.window.MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 }));
  return waitFor(() => doc.querySelector(".atlas-nosurf-menu .apm-strip") && doc.querySelector(".atlas-nosurf-menu"), "profile menu with profiles");
}

async function waitFor(fn, what, ms = 2000) {
  const start = Date.now();
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() - start > ms) throw new Error(`timed out: ${what}`);
    await new Promise((r) => setTimeout(r, 20));
  }
}

test("the avatar button opens the profile menu: profiles, then shortcuts", async () => {
  const w = await start();
  const menu = await openProfileMenu(w);
  const rows = [...menu.querySelectorAll(".apm-item .apm-row-label")].map((s) => s.textContent);
  assert.deepEqual(rows, ["Add page or bookmark", "History", "Downloads", "Extension settings", "Browser settings"]);
  assert.ok(menu.querySelectorAll(".apm-pick[data-pick]").length >= 2, "one avatar per profile");
  assert.ok(menu.querySelector(".apm-addbtn"), "+ to add or edit profiles");
  [...menu.querySelectorAll(".apm-item")].find((b) => b.textContent.includes("History"))
    .dispatchEvent(new w.window.MouseEvent("click", { bubbles: true }));
  assert.ok(w.calls.some((c) => c.name === "chrome.tabs.create" && plain(c.args[0]).url === "vivaldi://history"));
  assert.equal(w.window.document.querySelector(".atlas-nosurf-menu"), null, "the menu closes");
});

test("a web-page menu opening closes the browser's own menus", async () => {
  const w = await start();
  const doc = w.window.document;
  doc.getElementById("browser").insertAdjacentHTML("beforeend", '<div class="tab-position"><div class="tab" id="tab-5">T</div></div>');
  rightClick(w, doc.getElementById("tab-5"));
  answer(w, "chrome.tabs.get", { id: 5, url: "https://a.test/" });
  assert.ok(doc.querySelector(".atlas-profile-menu"), "tab menu open");
  w.control.deliver({ atlas: { act: "ctxmenu-open" } });
  assert.equal(doc.querySelector(".atlas-profile-menu"), null, "closed when the page menu opens");
});

test("opening a browser menu tells the page to close its menu", async () => {
  const w = await start();
  const doc = w.window.document;
  doc.getElementById("browser").insertAdjacentHTML("beforeend", '<div class="UrlBar-AddressField"><input value=""></div>');
  rightClick(w, doc.querySelector(".UrlBar-AddressField input"));
  answer(w, "chrome.tabs.query", [{ id: 9, url: "https://b.test/" }]);
  const sent = w.calls.find((c) => c.name === "chrome.tabs.sendMessage" && c.args[0] === 9);
  assert.ok(sent, "a message went to the active tab");
  assert.deepEqual(plain(sent.args[1]), { atlas: "closeContextMenu" });
});

test("the page menu script is registered together with the spelling engine", async () => {
  const w = await start();
  const reg = w.calls.find((c) => c.name === "chrome.scripting.registerContentScripts");
  const cs = plain(reg.args[0])[0];
  assert.deepEqual(cs.js, ["components/atlas/atlas-spelling.js", "components/atlas/atlas-ctxmenu.js"]);
  assert.equal(cs.runAt, "document_start");
});
