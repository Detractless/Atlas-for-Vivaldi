// Atlas's right-click menus in the browser window (src/modules/05-contextmenu.js draws the click
// handlers, 37-ui-menu.js the menu), in a stand-in window.html.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { openWindow } = require("./helpers/windowDom");
const { rightClick, uiMenuHost, uiMenuItems, menuLabels, answer } = require("./helpers/windowMenus");

const plain = (v) => JSON.parse(JSON.stringify(v === undefined ? null : v));
let open = [];
test.afterEach(() => { for (const w of open) w.window.close(); open = []; });

async function start(opts) {
  const w = await openWindow(opts);
  open.push(w);
  return w;
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
  uiMenuItems(w)[0].dispatchEvent(new w.window.MouseEvent("click", { bubbles: true }));
  assert.ok(w.calls.some((c) => c.name === "chrome.tabs.reload" && c.args[0] === 12), "Reload reloads tab 12");
  assert.equal(uiMenuHost(w), null, "the menu closes");
});


test("the tab menu carries its own style, so a profile without the CSS mods still shows it", async () => {
  const w = await start();
  const doc = w.window.document;
  doc.getElementById("browser").insertAdjacentHTML("beforeend", '<div class="tab-position"><div class="tab" id="tab-12">Page</div></div>');
  rightClick(w, doc.getElementById("tab-12"));
  answer(w, "chrome.tabs.get", { id: 12, pinned: false, url: "https://a.test/", mutedInfo: { muted: false } });
  const host = uiMenuHost(w);
  assert.match(host.getAttribute("style"), /position: fixed/, "the menu is placed by its own inline style, not by a CSS mod");
  const css = host.shadowRoot.querySelector("style").textContent;
  assert.doesNotMatch(css, /--atlas-/, "no colour or size comes from the CSS mods' variables");
  assert.match(css, /\.menu \{ position: fixed/, "the menu box is styled in the shadow root");
  assert.ok(host.shadowRoot.querySelector(".menu .apm-item"), "the rows are inside the shadow root");
  assert.ok(host.shadowRoot.querySelector("svg.atlas-ui-tail"), "the arrow belongs to the same menu");
  assert.ok(host.shadowRoot.querySelector(".menu").style.left.endsWith("px"), "the menu has a position next to the click");
});

test("the tab menu follows the window's dark theme", async () => {
  const w = await start();
  const doc = w.window.document;
  const browser = doc.getElementById("browser");
  browser.insertAdjacentHTML("beforeend", '<div class="tab-position"><div class="tab" id="tab-12">Page</div></div>');
  browser.classList.remove("theme-dark");
  browser.classList.add("theme-light");
  rightClick(w, doc.getElementById("tab-12"));
  answer(w, "chrome.tabs.get", { id: 12, pinned: false, url: "https://a.test/", mutedInfo: { muted: false } });
  assert.ok(!uiMenuHost(w).shadowRoot.querySelector(".wrap").classList.contains("dark"), "light with the light theme");
  w.window.__Atlas.closeUiMenu();
  browser.classList.remove("theme-light");
  browser.classList.add("theme-dark");
  rightClick(w, doc.getElementById("tab-12"));
  answer(w, "chrome.tabs.get", { id: 12, pinned: false, url: "https://a.test/", mutedInfo: { muted: false } });
  assert.ok(uiMenuHost(w).shadowRoot.querySelector(".wrap").classList.contains("dark"), "dark with the window");
});

test("right-clicking the address field shows the edit menu", async () => {
  const w = await start();
  const doc = w.window.document;
  doc.getElementById("browser").insertAdjacentHTML("beforeend", '<div class="UrlBar-AddressField"><input value=""></div>');
  rightClick(w, doc.querySelector(".UrlBar-AddressField input"));
  assert.deepEqual(menuLabels(w), ["Cut", "Copy", "Paste", "Paste and go", "Select all"]);
  assert.ok(uiMenuItems(w).some((b) => b.classList.contains("dis")), "Cut and Copy are off with no selection");
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
  uiMenuItems(w)[0].dispatchEvent(new w.window.MouseEvent("click", { bubbles: true }));
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

test("a web-page menu opening closes the browser's own menus", async () => {
  const w = await start();
  const doc = w.window.document;
  doc.getElementById("browser").insertAdjacentHTML("beforeend", '<div class="tab-position"><div class="tab" id="tab-5">T</div></div>');
  rightClick(w, doc.getElementById("tab-5"));
  answer(w, "chrome.tabs.get", { id: 5, url: "https://a.test/" });
  assert.ok(uiMenuHost(w), "tab menu open");
  w.control.deliver({ atlas: { act: "ctxmenu-open" } });
  assert.equal(uiMenuHost(w), null, "closed when the page menu opens");
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
