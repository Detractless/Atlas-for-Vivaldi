// The address bar's engine button (src/modules/19-addressbar-engine-picker.js)
// and the engine the address bar searches with (15-addressbar-engine.js):
// while the field is in use its left icon is that engine, as on the new tab's
// engine button; click it for the engines as pills; a pick is the new tab's
// engine too. Also the new tab's side: ?engines and following a pick.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { openWindow } = require("./helpers/windowDom");
const { openNewTab, closeAll, waitFor, settle } = require("./helpers/newtabDom");

const plain = (v) => JSON.parse(JSON.stringify(v === undefined ? null : v));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let open = [];
test.afterEach(async () => { for (const w of open) w.window.close(); open = []; await closeAll(); });

const ENGINES = {
  default: { name: "Browser Default", url: null, icon: "src/assets/svg/default.api.svg" },
  google: { name: "Google", url: "https://www.google.com/search?q=", icon: "src/assets/svg/google.com.svg" },
  ddg: { name: "DuckDuckGo", url: "https://duckduckgo.com/?q=", icon: "src/assets/svg/duckduckgo.com.svg" },
  yt: { name: "YouTube", url: "https://www.youtube.com/results?search_query=", icon: "src/assets/svg/youtube.com.svg", isHidden: true },
};
const GOOGLE_T = { guid: "g-google", url: "https://www.google.com/search?q={searchTerms}", isActive: 1 };
const DDG_T = { guid: "g-ddg", url: "https://duckduckgo.com/?q={searchTerms}", isActive: 1 };

/* vivaldi.searchEngines with a list of engines; records the defaults set. */
function fakeEngines(defaultSearch) {
  const state = { templateUrls: [GOOGLE_T, DDG_T], defaultSearch, setDefault: [] };
  const api = {
    getTemplateUrls(cb) { cb({ templateUrls: state.templateUrls, defaultSearch: state.defaultSearch }); },
    setDefault(kind, guid) { state.setDefault.push([kind, guid]); state.defaultSearch = guid; },
    addTemplateUrl(t, cb) { cb({ guid: "new" }); },
    removeTemplateUrl() {},
  };
  return { state, api };
}

async function start({ sync = {}, engines = fakeEngines("g-google"), value = "" } = {}) {
  const w = await openWindow({ sync: { customSearchEngines: ENGINES, defaultEngineKey: "google", ...sync }, searchEngines: engines.api });
  open.push(w);
  const doc = w.window.document;
  doc.getElementById("browser").insertAdjacentHTML("beforeend",
    '<div class="toolbar-mainbar"><div class="UrlBar-AddressField">' +
    '<div class="toolbar toolbar-small toolbar-insideinput"><button class="button-addressfield SiteInfoButton web"></button></div>' +
    '<div class="UrlBar-UrlFieldWrapper"><input class="UrlBar-UrlField url vivaldi-addressfield"></div>' +
    '<div class="OmniDropdown">suggestions</div></div></div>');
  w.input = doc.querySelector(".UrlBar-AddressField input.url");
  w.input.value = value;
  w.engines = engines;
  return w;
}

async function focus(w) {
  w.input.focus();
  w.input.dispatchEvent(new w.window.FocusEvent("focusin", { bubbles: true }));
  await wait(40);
}
async function blur(w) {
  w.input.blur();
  w.input.dispatchEvent(new w.window.FocusEvent("focusout", { bubbles: true }));
  await wait(20);
}
function press(w, el, type) {
  const ev = new w.window.MouseEvent(type, { bubbles: true, cancelable: true });
  el.dispatchEvent(ev);
  return ev;
}
function key(w, k) {
  const ev = new w.window.KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true });
  w.input.dispatchEvent(ev);
  return ev;
}
const btn = (w) => w.window.document.querySelector(".atlas-enginebtn");
const btnIcon = (w) => btn(w).querySelector("img").getAttribute("src");
const card = (w) => w.window.document.querySelector(".atlas-enginecard");
const pills = (w) => (card(w) && !card(w).hidden ? [...card(w).querySelectorAll(".atlas-enginepill")] : []);
const names = (w) => pills(w).map((p) => p.textContent);
const picked = (w) => pills(w).filter((p) => p.getAttribute("aria-selected") === "true").map((p) => p.textContent);
const browserHas = (w, c) => w.window.document.getElementById("browser").classList.contains(c);
const stored = async (w, k) => plain((await w.chrome.storage.sync.get([k]))[k]);
const pill = (w, name) => pills(w).find((p) => p.textContent === name);

test("while the address bar is in use, its left icon is the engine a search will use", async () => {
  const w = await start({ sync: { selectedSearchEngine: "ddg" } });
  await focus(w);
  assert.ok(!btn(w).hidden, "shown");
  assert.equal(btnIcon(w), "src/assets/svg/duckduckgo.com.svg", "the last engine picked, as on the new tab");
  assert.match(btn(w).title, /DuckDuckGo/);
  assert.ok(browserHas(w, "atlas-enginebtn-on"), "Vivaldi's own icon steps aside");
  await blur(w);
  assert.ok(btn(w).hidden, "gone when the field is left");
  assert.ok(!browserHas(w, "atlas-enginebtn-on"), "Vivaldi's icon is back (the lock on a page)");
  assert.deepEqual(w.errors, []);
});

test("clicking it shows the engines as pills, the current one picked, then Engine lists", async () => {
  const w = await start({ sync: { selectedSearchEngine: "ddg" } });
  await focus(w);
  assert.ok(press(w, btn(w), "mousedown").defaultPrevented, "the field keeps focus");
  press(w, btn(w), "click");
  assert.deepEqual(names(w), ["Google", "DuckDuckGo", "Engine lists"], "no hidden engines, none without an address");
  assert.deepEqual(picked(w), ["DuckDuckGo"]);
  assert.ok(browserHas(w, "atlas-engines-open"), "the bookmark pills and Vivaldi's list step aside");
  assert.equal(pill(w, "Google").querySelector("img").getAttribute("src"), "src/assets/svg/google.com.svg");
  press(w, btn(w), "click");
  assert.deepEqual(names(w), [], "a second click closes it");
  assert.ok(!browserHas(w, "atlas-engines-open"));
});

test("picking an engine makes it the new tab's engine and the address bar's", async () => {
  const w = await start({ sync: { selectedSearchEngine: "ddg" }, engines: fakeEngines("g-ddg") });
  await focus(w);
  press(w, btn(w), "click");
  press(w, pill(w, "Google"), "mousedown");
  press(w, pill(w, "Google"), "click");
  await wait(40);
  assert.equal(await stored(w, "selectedSearchEngine"), "google");
  assert.equal(btnIcon(w), "src/assets/svg/google.com.svg");
  assert.deepEqual(w.engines.state.setDefault.at(-1), ["defaultSearch", "g-google"], "Vivaldi searches with it");
  assert.deepEqual(names(w), [], "the pills close");
});

test("arrows move, Enter picks, Esc goes back, and none of those keys reach the field", async () => {
  const w = await start({ sync: { selectedSearchEngine: "ddg" } });
  let reached = 0;
  w.input.addEventListener("keydown", () => { reached++; });
  await focus(w);
  press(w, btn(w), "click");
  assert.ok(key(w, "ArrowDown").defaultPrevented);
  assert.deepEqual(picked(w), ["Engine lists"]);
  key(w, "ArrowDown");
  assert.deepEqual(picked(w), ["Google"], "wraps around");
  key(w, "Escape");
  assert.deepEqual(names(w), [], "Esc closes the engine pills");
  assert.equal(w.window.document.activeElement, w.input, "and keeps you in the field");
  press(w, btn(w), "click");
  key(w, "ArrowUp");
  key(w, "Enter");
  await wait(40);
  assert.equal(await stored(w, "selectedSearchEngine"), "google");
  assert.equal(reached, 0);
});

test("typing closes the engine pills", async () => {
  const w = await start();
  await focus(w);
  press(w, btn(w), "click");
  w.input.value = "c";
  w.input.dispatchEvent(new w.window.Event("input", { bubbles: true }));
  assert.deepEqual(names(w), []);
  assert.ok(!browserHas(w, "atlas-engines-open"));
});

test("Engine lists opens the new tab's engine list", async () => {
  const w = await start();
  await focus(w);
  press(w, btn(w), "click");
  press(w, pill(w, "Engine lists"), "click");
  await wait(20);
  const urls = w.calls.filter((c) => c.name === "chrome.tabs.update").map((c) => plain(c.args.find((a) => a && typeof a === "object")).url);
  assert.equal(urls.length, 1);
  assert.match(urls[0], /\/index\.html\?engines$/);
});

test("after a pick with text typed, Vivaldi is asked to look again at the same text", async () => {
  const w = await start({ sync: { selectedSearchEngine: "ddg" } });
  await focus(w);
  w.input.value = "cats";
  let inputs = 0;
  w.input.addEventListener("input", () => { inputs++; });
  press(w, btn(w), "click");
  press(w, pill(w, "Google"), "click");
  await wait(300);
  assert.equal(inputs, 2, "typed anew");
  assert.equal(w.input.value, "cats", "the text is unchanged");
});

test("the address bar follows the new tab's last pick, or its default when engines always reset", async () => {
  const remember = fakeEngines("g-google");
  await start({ sync: { selectedSearchEngine: "ddg", searchEngineBehavior: "remember" }, engines: remember });
  assert.deepEqual(remember.state.setDefault, [["defaultSearch", "g-ddg"]]);
  const reset = fakeEngines("g-google");
  await start({ sync: { selectedSearchEngine: "ddg", searchEngineBehavior: "always-default" }, engines: reset });
  assert.deepEqual(reset.state.setDefault, [], "the default, Google, already is Vivaldi's");
  const browserDefault = fakeEngines("g-google");
  await start({ sync: { selectedSearchEngine: "default" }, engines: browserDefault });
  assert.deepEqual(browserDefault.state.setDefault, [], "an engine with no address leaves the default in charge");
});

test("when engines always reset, a pick lasts until you leave the field", async () => {
  const w = await start({ sync: { searchEngineBehavior: "always-default" } });
  await focus(w);
  assert.equal(btnIcon(w), "src/assets/svg/google.com.svg");
  press(w, btn(w), "click");
  press(w, pill(w, "DuckDuckGo"), "click");
  await wait(40);
  assert.deepEqual(w.engines.state.setDefault.at(-1), ["defaultSearch", "g-ddg"]);
  assert.equal(btnIcon(w), "src/assets/svg/duckduckgo.com.svg");
  await blur(w);
  await wait(1700);
  assert.deepEqual(w.engines.state.setDefault.at(-1), ["defaultSearch", "g-google"], "back to the default");
});

test("a custom engine logo comes from the new tab's database", async () => {
  const mine = { name: "Mine", url: "https://mine.example/?q=", isCustomIcon: true };
  const w = await start({ sync: { customSearchEngines: { ...ENGINES, mine }, selectedSearchEngine: "mine" } });
  await new Promise((resolve, reject) => {
    const req = w.window.indexedDB.open("DetractlessBookmarks", 7);
    req.onupgradeneeded = () => { req.result.createObjectStore("icons"); };
    req.onsuccess = () => {
      const tx = req.result.transaction(["icons"], "readwrite");
      tx.objectStore("icons").put("data:image/png;base64,TUlORQ==", "mine");
      tx.oncomplete = () => { req.result.close(); resolve(); };
    };
    req.onerror = () => reject(req.error);
  });
  await focus(w);
  await wait(80);
  assert.equal(btnIcon(w), "data:image/png;base64,TUlORQ==");
});

test("the new tab: ?engines opens the engine list, and a pick made elsewhere shows on its engine button", async () => {
  const t = await openNewTab({ query: "?engines", sync: { selectedSearchEngine: "google" } });
  await waitFor(() => t.document.getElementById("engine-modal").classList.contains("show"), 3000, "engine list open");
  const icon = () => t.document.querySelector("#current-engine-icon-display img").getAttribute("src");
  await waitFor(() => icon() && icon().includes("google"), 3000, "Google on the engine button");
  await t.chrome.storage.sync.set({ selectedSearchEngine: "bing" });
  await settle(t.window, 100);
  assert.match(icon(), /bing/);
});

// ── On the Atlas new tab (01-addressbar.js, 20-addressbar-newtab.js) ──

const NEWTAB = "chrome-extension://mpognobbkildjkofajifpdfhcoklimli/index.html";

/* A tab switch. Atlas asks for the active tab's address; `url` answers it,
   otherwise there is no answer and the field's text is used. */
async function switchTab(w, url) {
  const before = w.calls.length;
  for (const fn of w.listeners["chrome.tabs.onActivated"] || []) fn({ tabId: 1 });
  await wait(80);
  if (url === undefined) return;
  for (const c of w.calls.slice(before)) {
    const q = c.name === "chrome.tabs.query" && c.args[0];
    if (q && q.active && q.currentWindow && typeof c.args[1] === "function") c.args[1]([{ id: 1, url }]);
  }
  await wait(20);
}

test("the new tab is recognized by its address, index.html, even with the field cleared", async () => {
  const w = await start({ value: NEWTAB });
  await switchTab(w);
  assert.ok(browserHas(w, "atlas-newtab"), "by the field's text");
  w.input.value = "";
  await switchTab(w, NEWTAB + "?settings=search");
  assert.ok(browserHas(w, "atlas-newtab"), "by the tab's address");
  await switchTab(w, "https://example.com/");
  assert.ok(!browserHas(w, "atlas-newtab"), "a web page isn't the new tab");
});

test("on the new tab the engine logo is there without clicking into the field; elsewhere only in use", async () => {
  const w = await start({ value: NEWTAB, sync: { selectedSearchEngine: "ddg" } });
  await switchTab(w);
  assert.ok(btn(w) && !btn(w).hidden, "there at rest (drawn on hover, next test)");
  assert.equal(btnIcon(w), "src/assets/svg/duckduckgo.com.svg");
  assert.ok(browserHas(w, "atlas-enginebtn-on"), "Vivaldi's magnifier steps aside");
  await focus(w);
  await blur(w);
  assert.ok(!btn(w).hidden, "still there after leaving the field");
  await switchTab(w, "https://example.com/");
  assert.ok(btn(w).hidden, "not on a web page at rest");
  assert.ok(!browserHas(w, "atlas-enginebtn-on"));
});

test("on the new tab, clicking into the field empties the extension address, and Esc can't bring it back", async () => {
  const w = await start({ value: NEWTAB });
  await switchTab(w);
  await focus(w);
  assert.equal(w.input.value, "", "empty, so the field shows its hint");
  w.input.value = NEWTAB;   // what Vivaldi puts back on Esc
  w.input.dispatchEvent(new w.window.KeyboardEvent("keyup", { key: "Escape", bubbles: true }));
  await wait(20);
  assert.equal(w.input.value, "");
  const page = await start({ value: "https://example.com/a" });
  await switchTab(page, "https://example.com/a");
  await focus(page);
  assert.equal(page.input.value, "https://example.com/a", "a web page's address stays");
});

test("on the new tab, clicking the logo at rest goes into the field and shows the engines", async () => {
  const w = await start({ value: NEWTAB });
  await switchTab(w);
  press(w, btn(w), "click");
  assert.equal(w.window.document.activeElement, w.input, "into the field");
  assert.deepEqual(names(w), ["Google", "DuckDuckGo", "Engine lists"]);
  await wait(20);
  assert.equal(w.input.value, "", "emptied");
  assert.deepEqual(names(w), ["Google", "DuckDuckGo", "Engine lists"], "emptying it doesn't close the engines");
});

test("at rest the logo is drawn only while the pointer is over the bar or the logo, like the bar's own parts", async () => {
  const w = await start({ value: NEWTAB });
  await switchTab(w);
  const doc = w.window.document, field = doc.querySelector(".UrlBar-AddressField");
  const hover = (el, type, to) => el.dispatchEvent(new w.window.MouseEvent(type, { relatedTarget: to || null }));
  assert.ok(!browserHas(w, "atlas-urlbar-hover") && !browserHas(w, "atlas-enginebtn-inuse"), "faded out at rest");
  hover(field, "mouseenter");
  assert.ok(browserHas(w, "atlas-urlbar-hover"), "drawn while over the bar");
  hover(field, "mouseleave", btn(w));
  assert.ok(browserHas(w, "atlas-urlbar-hover"), "moving onto the logo isn't leaving the bar");
  hover(btn(w), "mouseleave", doc.body);
  assert.ok(!browserHas(w, "atlas-urlbar-hover"), "gone once the pointer leaves both");
  await focus(w);
  assert.ok(browserHas(w, "atlas-enginebtn-inuse"), "drawn at once while the field is in use");
  await blur(w);
  assert.ok(!browserHas(w, "atlas-enginebtn-inuse"));
  const css = fs.readFileSync(path.join(__dirname, "..", "..", "payload", "css-mods", "03-addressbar.css"), "utf8");
  assert.match(css, /#browser:not\(\.atlas-urlbar-hover\):not\(\.atlas-enginebtn-inuse\) \.atlas-enginebtn \{ opacity: 0; pointer-events: none; \}/,
    "the stylesheet fades it out otherwise");
});
