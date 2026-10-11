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
  assert.deepEqual([...new Set(registered)], ["atlas-ctxmenu", "atlas-google-account"], "the page menu, and the Google account check (spec 002)");
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
  assert.ok(pop.querySelector(".aep-sep + .aep-foot"), "a divider, then the last row");
  assert.ok(pop.querySelector(".aep-manage svg"), "with the profile menu's gear");
  assert.equal(pop.querySelector(".aep-pager"), null, "one page: no page arrows");
  pop.querySelector(".aep-manage").dispatchEvent(new w.window.MouseEvent("click", { bubbles: true }));
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
  assert.ok(pop.querySelector(".aep-foot > .aep-manage + .aep-pager"), "the page arrows sit in the Manage extensions row");
  assert.equal(pop.querySelector(":scope > .aep-pager"), null, "no row of their own");
});

test("extension icons are the ones sharp at the rows' 20px", async () => {
  const w = await start();
  const icons = (...sizes) => sizes.map((size) => ({ size, url: `icon${size}.png` }));
  const pop = await openPopoverWith(w, [
    { id: "a".repeat(32), name: "Alpha", type: "extension", enabled: true, icons: icons(128, 16, 48, 32) },
    { id: "b".repeat(32), name: "Bravo", type: "extension", enabled: true, icons: icons(16, 32) },
  ]);
  assert.deepEqual([...pop.querySelectorAll(".aep-icon")].map((i) => i.getAttribute("src")), ["icon48.png", "icon32.png"]);
});

const ELEVEN = Array.from({ length: 11 }, (_, i) => ({ id: String.fromCharCode(97 + i).repeat(32), name: `Ext ${String(i).padStart(2, "0")}`, type: "extension", enabled: true, icons: [] }));
const popNames = (w) => [...w.window.document.querySelector(".atlas-ext-pop").querySelectorAll(".aep-name")].map((n) => n.textContent);

/* The stand-in chrome answers getAll by itself a moment later (with nothing),
   which redraws an empty popover; answer again after it so the page shows these. */
async function openPopoverWith(w, exts) {
  await openPopover(w, exts);
  await new Promise((r) => setTimeout(r, 0));
  answer(w, "chrome.management.getAll", exts);
  return w.window.document.querySelector(".atlas-ext-pop");
}

test("typing in the popover search keeps the text and filters the list", async () => {
  // Fixed 2026-10-09: every keystroke used to empty the field and show the whole list.
  const w = await start();
  const pop = await openPopoverWith(w, ELEVEN);
  const type = (value) => {
    const box = w.window.document.querySelector(".atlas-ext-pop .aep-search");
    box.value = value;
    box.dispatchEvent(new w.window.Event("input", { bubbles: true }));
  };
  type("ext 1");
  assert.deepEqual(popNames(w), ["Ext 10"]);
  const box = w.window.document.querySelector(".atlas-ext-pop .aep-search");
  assert.equal(box.value, "ext 1", "the text stays");
  assert.equal(w.window.document.activeElement, box, "and the field keeps focus");
  type("ext 0");
  assert.deepEqual(popNames(w), ["Ext 00", "Ext 01", "Ext 02", "Ext 03", "Ext 04", "Ext 05", "Ext 06", "Ext 07"]);
  assert.equal(w.window.document.querySelector(".atlas-ext-pop .aep-pager span").textContent, "1 / 2", "ten matches: two pages");
  type("nothing like it");
  assert.equal(w.window.document.querySelector(".atlas-ext-pop .aep-empty").textContent, "No matches");
  assert.ok(pop, "opened");
});

test("the popover's page buttons move between pages", async () => {
  const w = await start();
  await openPopoverWith(w, ELEVEN);
  const pager = () => w.window.document.querySelector(".atlas-ext-pop .aep-pager");
  pager().lastElementChild.dispatchEvent(new w.window.MouseEvent("click", { bubbles: true }));
  assert.equal(pager().querySelector("span").textContent, "2 / 2");
  assert.deepEqual(popNames(w), ["Ext 08", "Ext 09", "Ext 10"]);
  pager().firstElementChild.dispatchEvent(new w.window.MouseEvent("click", { bubbles: true }));
  assert.equal(pager().querySelector("span").textContent, "1 / 2");
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
  assert.deepEqual(cs.js, ["components/atlas/atlas-spelling.js", "components/atlas/atlas-menu.js", "components/atlas/atlas-ctxmenu.js"]);
  assert.equal(cs.runAt, "document_start");
});

/* vivaldi.searchEngines with a list of engines; records what Atlas changes. */
function fakeEngines(templateUrls, defaultSearch) {
  const state = { templateUrls, defaultSearch, added: [], setDefault: [], removed: [] };
  const api = {
    getTemplateUrls(cb) { cb({ templateUrls: state.templateUrls, defaultSearch: state.defaultSearch, ...state.extra }); },
    setDefault(kind, guid) { state.setDefault.push([kind, guid]); state.defaultSearch = guid; },
    addTemplateUrl(t, cb) {
      const guid = "new-" + state.added.length;
      state.added.push(plain(t));
      state.templateUrls = state.templateUrls.concat([{ ...t, guid }]);
      cb({ guid });
    },
    removeTemplateUrl(guid) {
      state.removed.push(guid);
      state.templateUrls = state.templateUrls.filter((t) => t.guid !== guid);
    },
  };
  return { state, api };
}
const GOOGLE_T = { guid: "g-google", url: "https://www.google.com/search?q={searchTerms}", isActive: 1 };
const DDG_T = { guid: "g-ddg", url: "https://duckduckgo.com/?q={searchTerms}", isActive: 1 };
const ENGINES = {
  google: { name: "Google", url: "https://www.google.com/search?q=" },
  ddg: { name: "DuckDuckGo", url: "https://duckduckgo.com/?q=" },
};

test("the address bar searches with the new tab's default engine", async () => {
  const e = fakeEngines([GOOGLE_T, DDG_T], "g-google");
  await start({ sync: { defaultEngineKey: "ddg", customSearchEngines: ENGINES }, searchEngines: e.api });
  assert.deepEqual(e.state.setDefault, [["defaultSearch", "g-ddg"]]);
  assert.deepEqual(e.state.added, []);
});

test("an engine Vivaldi doesn't have is added, then made the default", async () => {
  const e = fakeEngines([GOOGLE_T], "g-google");
  await start({ sync: { defaultEngineKey: "ddg", customSearchEngines: ENGINES }, searchEngines: e.api });
  assert.equal(e.state.added.length, 1);
  assert.equal(e.state.added[0].url, "https://duckduckgo.com/?q={searchTerms}");
  assert.equal(e.state.added[0].name, "DuckDuckGo");
  assert.deepEqual(e.state.setDefault, [["defaultSearch", "new-0"]]);
});

test("changing the new tab's engine changes the address bar's", async () => {
  const e = fakeEngines([GOOGLE_T, DDG_T], "g-ddg");
  const w = await start({ sync: { defaultEngineKey: "ddg", customSearchEngines: ENGINES }, searchEngines: e.api });
  assert.deepEqual(e.state.setDefault, [], "already the default: nothing to change");
  await w.chrome.storage.sync.set({ defaultEngineKey: "google" });
  await new Promise((r) => setTimeout(r, 50));
  assert.deepEqual(e.state.setDefault, [["defaultSearch", "g-google"]]);
});

test("Vivaldi listing the address with %s still counts as the same engine", async () => {
  // Vivaldi shows {searchTerms} as %s. An exact compare missed it and added a
  // new copy of the engine at every start.
  const e = fakeEngines([GOOGLE_T, { guid: "g-ddg", url: "https://duckduckgo.com/?q=%s", isActive: 1 }], "g-google");
  await start({ sync: { defaultEngineKey: "ddg", customSearchEngines: ENGINES }, searchEngines: e.api });
  assert.deepEqual(e.state.added, [], "no new copy");
  assert.deepEqual(e.state.setDefault, [["defaultSearch", "g-ddg"]]);
});

test("extra copies of an engine Atlas added are removed, keeping the one in use", async () => {
  const copy = (guid) => ({ guid, keyword: "atlas-google", url: "https://www.google.com/search?q=%s", isActive: 1 });
  const mine = { guid: "user-google", keyword: "g", url: "https://www.google.com/search?q=%s", isActive: 1 };
  const e = fakeEngines([copy("a1"), copy("a2"), copy("a3"), copy("a4"), mine], "a3");
  e.state.extra = { defaultPrivate: "a4" };
  await start({ sync: { defaultEngineKey: "google", customSearchEngines: ENGINES }, searchEngines: e.api });
  assert.deepEqual(e.state.removed.sort(), ["a1", "a2"], "a3 is the default search and a4 the private one");
  assert.deepEqual(e.state.added, []);
  assert.deepEqual(e.state.setDefault, [], "a3 already is the default");
  assert.ok(e.state.templateUrls.some((t) => t.guid === "user-google"), "the user's own engine stays");
});
