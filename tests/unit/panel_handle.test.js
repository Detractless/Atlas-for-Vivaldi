"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const source = fs.readFileSync(path.join(__dirname, "../../src/modules/35-panel-handle.js"), "utf8");
const windows = [];
test.after(() => windows.forEach((w) => w.close()));

const HTML = `<div id="browser"><div id="switch"><button data-name="EXT_PANEL_hehggadaopoacecdllhhajmbjkdcmajg"></button><button data-name="WEBPANEL_atlas_downloads"></button><button class="button-on" data-name="OTHER"></button></div>
<div id="panels-container"><webview src="chrome-extension://hehggadaopoacecdllhhajmbjkdcmajg/codex-work-sidepanel.html"></webview></div></div>`;

// A browser window whose sidebar is `open` (or closed), showing the page at `src`.
function open({ expanded = true, src, width = 358, noContainer = false } = {}) {
  const dom = new JSDOM(noContainer ? '<div id="browser"></div>' : HTML, { runScripts: "outside-only", pretendToBeVisual: true });
  const w = dom.window;
  windows.push(w);
  const box = w.document.getElementById("panels-container");
  const view = w.document.querySelector("webview");
  if (box) {
    if (expanded) box.classList.add("expanded");
    if (src) view.setAttribute("src", src);
    box.getBoundingClientRect = () => ({ left: 5, right: 5 + width, top: 76, bottom: 1064, width });
    view.getBoundingClientRect = () => ({ width: expanded ? width : 0 });
  }
  const created = [], clicks = [], copied = [];
  let reloaded = 0;
  w.chrome = { tabs: { create: (o) => created.push(o) } };
  w.atlasWarn = () => {};
  w.navigator.clipboard = { writeText: (t) => copied.push(t) };
  if (view) view.reload = () => { reloaded++; };
  w.document.querySelectorAll("#switch button").forEach((b) => ["click"].forEach((t) => b.addEventListener(t, () => clicks.push(b.dataset.name))));
  w.eval("var Atlas = {};\n" + source + "\nwindow.Atlas = Atlas;");
  const handle = () => w.document.querySelector(".atlas-panel-handle");
  const pop = () => w.document.querySelector(".atlas-panel-pop");
  const rows = () => Array.from(w.document.querySelectorAll(".atlas-panel-pop-item"));
  return { w, handle, pop, rows, created, clicks, copied, reloaded: () => reloaded, labels: () => rows().map((r) => r.textContent) };
}
const press = (p, type) => p.handle().dispatchEvent(new p.w.MouseEvent(type, { bubbles: true, cancelable: true }));
const run = (p, label) => p.rows().find((r) => r.textContent === label).click();

test("the tab sits in the open sidebar's top-right corner, flush", () => {
  const p = open();
  assert.equal(p.handle().hidden, false);
  assert.equal(p.handle().style.left, String(5 + 358 - 26) + "px");
  assert.equal(p.handle().style.top, "76px");
});

test("no square while the sidebar is closed or has no page showing", () => {
  assert.equal(open({ expanded: false }).handle().hidden, true);
  assert.equal(open({ width: 20 }).handle().hidden, true);
});

test("with no sidebar container yet, nothing is drawn and nothing breaks", () => {
  const p = open({ noContainer: true });
  assert.equal(p.handle(), null);
});

test("click opens the card, clicking the tab again closes it, right-click opens it too", () => {
  const p = open();
  press(p, "click");
  assert.ok(p.pop());
  assert.deepEqual(p.labels(), ["Close sidebar", "Reload sidebar", "Open in a new tab", "Copy address"]);
  press(p, "click");
  assert.equal(p.pop(), null);
  press(p, "contextmenu");
  assert.ok(p.pop());
});

test("the card names the page and drops down from the tab, arrow on the dots", () => {
  const p = open({ src: "https://www.chatgpt.com/" });
  press(p, "click");
  assert.equal(p.pop().querySelector("b").textContent, "chatgpt.com");
  assert.equal(p.pop().style.top, String(76 + 24 + 6) + "px");
  assert.equal(p.pop().style.left, String(5 + 358 - 250) + "px");
  assert.equal(p.pop().style.getPropertyValue("--atlas-pop-arrow"), String(5 + 358 - 13 - (5 + 358 - 250) - 7) + "px");
});

test("an extension panel is titled with its tab's title, and shows the website it holds", () => {
  const src = "chrome-extension://hehggadaopoacecdllhhajmbjkdcmajg/codex-work-sidepanel.html";
  const p = open({ src });
  p.w.chrome.tabs.query = (q, cb) => cb([{ url: "https://other.test/", title: "Nope" }, { url: src, title: "ChatGPT" }]);
  press(p, "click");
  assert.equal(p.pop().querySelector("b").textContent, "ChatGPT");
  assert.equal(p.pop().querySelector("span").textContent, "chatgpt.com");
});

test("with no matching tab, the card falls back to the page's own address", () => {
  const p = open({ src: "https://www.example.test/side" });
  p.w.chrome.tabs.query = (q, cb) => cb([]);
  press(p, "click");
  assert.equal(p.pop().querySelector("b").textContent, "example.test");
  assert.equal(p.pop().querySelector("span").textContent, "example.test");
});

test("the Downloads panel is titled Downloads", () => {
  const p = open({ src: "chrome-extension://mpognobbkildjkofajifpdfhcoklimli/components/atlas/downloads-panel.html" });
  press(p, "click");
  assert.equal(p.pop().querySelector("b").textContent, "Downloads");
});

test("Escape, a click elsewhere, and choosing a row all close the card", () => {
  const p = open();
  press(p, "click");
  p.w.document.dispatchEvent(new p.w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  assert.equal(p.pop(), null);
  press(p, "click");
  p.w.document.getElementById("browser").dispatchEvent(new p.w.MouseEvent("mousedown", { bubbles: true }));
  assert.equal(p.pop(), null);
  press(p, "click");
  run(p, "Reload sidebar");
  assert.equal(p.pop(), null);
});

test("Close sidebar presses the showing panel's own button", () => {
  const p = open();
  press(p, "click");
  run(p, "Close sidebar");
  assert.deepEqual(p.clicks, ["EXT_PANEL_hehggadaopoacecdllhhajmbjkdcmajg"]);
});

test("the Downloads panel is closed through its own button", () => {
  const p = open({ src: "chrome-extension://mpognobbkildjkofajifpdfhcoklimli/components/atlas/downloads-panel.html" });
  press(p, "click");
  run(p, "Close sidebar");
  assert.deepEqual(p.clicks, ["WEBPANEL_atlas_downloads"]);
});

test("an unknown panel falls back to the strip's selected button", () => {
  const p = open({ src: "https://example.test/panel" });
  press(p, "click");
  run(p, "Close sidebar");
  assert.deepEqual(p.clicks, ["OTHER"]);
});

test("reload, new tab and copy act on the page in the sidebar", () => {
  const p = open();
  const url = "chrome-extension://hehggadaopoacecdllhhajmbjkdcmajg/codex-work-sidepanel.html";
  press(p, "click"); run(p, "Reload sidebar");
  press(p, "click"); run(p, "Open in a new tab");
  press(p, "click"); run(p, "Copy address");
  assert.equal(p.reloaded(), 1);
  assert.deepEqual(JSON.parse(JSON.stringify(p.created)), [{ url }]);
  assert.deepEqual(p.copied, [url]);
});
