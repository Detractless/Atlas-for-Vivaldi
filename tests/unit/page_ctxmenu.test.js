// The Atlas right-click menu on web pages (components/atlas/atlas-ctxmenu.js,
// with atlas-spelling.js), loaded into a jsdom page the way the content script is.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");
const { makeFakeChrome } = require("./helpers/fakeChrome");

const ATLAS = path.join(__dirname, "..", "..", "payload", "install-files", "components", "atlas");
// atlas-menu.js draws the menu; atlas-ctxmenu.js decides what is in it.
const SCRIPTS = ["atlas-spelling.js", "atlas-menu.js", "atlas-ctxmenu.js"].map((f) => fs.readFileSync(path.join(ATLAS, f), "utf8"));
const plain = (v) => JSON.parse(JSON.stringify(v));
let open = [];
test.afterEach(() => { for (const p of open) p.window.close(); open = []; });

function openPage(body, platform = "MacIntel") {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", (e) => { if (e.type !== "not-implemented") errors.push(String(e.cause || e.message)); });
  let fake;
  const dom = new JSDOM(`<!DOCTYPE html><body>${body}</body>`, {
    url: "https://site.test/page", runScripts: "outside-only", pretendToBeVisual: true, virtualConsole,
    beforeParse(window) {
      Object.defineProperty(window.navigator, "platform", { value: platform });
      window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
      // The menu lives in a CLOSED shadow root; open it so the test can read it.
      const attach = window.Element.prototype.attachShadow;
      window.Element.prototype.attachShadow = function () { const r = attach.call(this, { mode: "open" }); this.__root = r; return r; };
      fake = makeFakeChrome(window, {});
      window.chrome = fake.chrome;
    },
  });
  for (const s of SCRIPTS) dom.window.eval(s);
  const page = { window: dom.window, document: dom.window.document, control: fake.control, errors };
  open.push(page);
  return page;
}

function rightClick(p, el, extra = {}) {
  const ev = new p.window.MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 30, clientY: 30, ...extra });
  el.dispatchEvent(ev);
  return ev;
}

const host = (p) => p.document.querySelector("atlas-ctx");
const labels = (p) => (host(p) ? [...host(p).__root.querySelectorAll(".mi > span:first-child")].map((s) => s.textContent) : []);

function pick(p, label) {
  const row = [...host(p).__root.querySelectorAll(".mi")].find((r) => r.firstChild.textContent === label);
  row.dispatchEvent(new p.window.MouseEvent("mouseup", { bubbles: true, button: 0 }));
}

test("a plain page gets back, forward, reload, copy, save and print", () => {
  const p = openPage("<p id='x'>Hello</p>");
  rightClick(p, p.document.getElementById("x"));
  assert.deepEqual(labels(p), ["Back", "Forward", "Reload", "Copy address", "Save page as…", "Print…"]);
  assert.deepEqual(plain(p.control.sentMessages[0]), { atlas: { act: "ctxmenu-open" } });
  assert.deepEqual(p.errors, []);
});

test("a link gets the link items, and they open tabs through Atlas", () => {
  const p = openPage("<a id='l' href='https://other.test/'>link</a>");
  rightClick(p, p.document.getElementById("l"));
  assert.deepEqual(labels(p), ["Open link in this tab", "Open link in new tab", "Open link in background tab", "Copy link"]);
  pick(p, "Open link in background tab");
  assert.deepEqual(plain(p.control.sentMessages.at(-1)), { atlas: { act: "opentab", url: "https://other.test/", active: false } });
  assert.equal(host(p), null, "the menu closes");
});

test("an image inside a link gets both groups", () => {
  const p = openPage("<a href='https://other.test/'><img id='i' src='https://img.test/a.png'></a>");
  rightClick(p, p.document.getElementById("i"));
  assert.deepEqual(labels(p), ["Open link in this tab", "Open link in new tab", "Open link in background tab", "Copy link",
    "Open image in new tab", "Copy image", "Save image…"]);
  pick(p, "Save image…");
  assert.deepEqual(plain(p.control.sentMessages.at(-1)), { atlas: { act: "download", url: "https://img.test/a.png" } });
});

test("selected text gets copy and search", () => {
  const p = openPage("<p id='t'>some words</p>");
  const range = p.document.createRange();
  range.selectNodeContents(p.document.getElementById("t"));
  p.window.getSelection().addRange(range);
  rightClick(p, p.document.getElementById("t"));
  assert.deepEqual(labels(p), ["Copy", "Search the web"]);
  pick(p, "Search the web");
  assert.equal(plain(p.control.sentMessages.at(-1)).atlas.url, "https://www.google.com/search?q=some%20words");
});

test("a text field gets the edit items, with spelling and Harper suggestions first", () => {
  const p = openPage("<input id='f' value='helo'>");
  const f = p.document.getElementById("f");
  f.setSelectionRange(4, 4);
  f.dataset.harperIssues = JSON.stringify([{ start: 0, end: 4, matchedText: "helo", suggestions: ["hello"] }]);
  rightClick(p, f);
  const got = labels(p);
  assert.deepEqual(got.slice(-4), ["Cut", "Copy", "Paste", "Select all"]);
  assert.equal(got.length, 7, `three suggestions: ${got.join(", ")}`);
  pick(p, got[0]);
  assert.equal(f.value, got[0], "a suggestion replaces the word");
});

test("Shift+right-click and pages that handle the click keep the native menu", () => {
  const p = openPage("<p id='x'>Hello</p><div id='own'>own</div>");
  rightClick(p, p.document.getElementById("x"), { shiftKey: true });
  assert.equal(host(p), null);
  p.document.getElementById("own").addEventListener("contextmenu", (e) => e.preventDefault());
  rightClick(p, p.document.getElementById("own"));
  assert.equal(host(p), null);
});

test("Open link in this tab navigates through Atlas", () => {
  const p = openPage("<a id='l' href='https://other.test/x'>link</a>");
  rightClick(p, p.document.getElementById("l"));
  pick(p, "Open link in this tab");
  assert.deepEqual(plain(p.control.sentMessages.at(-1)), { atlas: { act: "opentab-current", url: "https://other.test/x" } });
});

test("right-clicks on Harper's tooltip are left to Harper", () => {
  const p = openPage("<div class='harper-tooltip'><span id='h'>suggestion</span></div>");
  rightClick(p, p.document.getElementById("h"));
  assert.equal(host(p), null);
});

test("the browser can close the page menu", () => {
  const p = openPage("<p id='x'>Hello</p>");
  rightClick(p, p.document.getElementById("x"));
  assert.ok(host(p));
  p.control.deliver({ atlas: "closeContextMenu" });
  assert.equal(host(p), null);
});

function pressKey(p, key, code) {
  const ev = new p.window.KeyboardEvent("keydown", { key, code: code || key, bubbles: true, cancelable: true });
  p.window.dispatchEvent(ev);
  return ev;
}

test("page Command double taps leave focus to the native browser listener", () => {
  const p = openPage("<p>Hello</p>");
  pressKey(p, "Meta");
  pressKey(p, "Meta");
  assert.equal(p.control.sentMessages.length, 0);
});

test("Command -> Comma -> Comma navigates back and prevents default on comma", () => {
  const p = openPage("<p>Hello</p>");
  pressKey(p, "Meta");
  const comma1 = pressKey(p, ",", "Comma");
  assert.equal(comma1.defaultPrevented, true, "first comma is suppressed from reaching the website");
  const comma2 = pressKey(p, ",", "Comma");
  assert.equal(comma2.defaultPrevented, true, "second comma is suppressed from reaching the website");
  assert.deepEqual(plain(p.control.sentMessages.at(-1)), { atlas: { act: "navigate-back" } });
});

test("Command -> Period -> Period navigates forward and prevents default on period", () => {
  const p = openPage("<p>Hello</p>");
  pressKey(p, "Meta");
  const dot1 = pressKey(p, ".", "Period");
  assert.equal(dot1.defaultPrevented, true, "first period is suppressed from reaching the website");
  const dot2 = pressKey(p, ".", "Period");
  assert.equal(dot2.defaultPrevented, true, "second period is suppressed from reaching the website");
  assert.deepEqual(plain(p.control.sentMessages.at(-1)), { atlas: { act: "navigate-forward" } });
});

test("Command -> Comma -> switching to Period -> Period navigates forward", () => {
  const p = openPage("<p>Hello</p>");
  pressKey(p, "Meta");
  pressKey(p, ",", "Comma");
  pressKey(p, ".", "Period"); // switched direction
  pressKey(p, ".", "Period"); // confirm forward
  assert.deepEqual(plain(p.control.sentMessages.at(-1)), { atlas: { act: "navigate-forward" } });
});



test("normal comma typing without Command is not prevented", () => {
  const p = openPage("<p>Hello</p>");
  const ev = pressKey(p, ",", "Comma");
  assert.equal(ev.defaultPrevented, false);
});

function releaseKey(p, key, code) {
  const ev = new p.window.KeyboardEvent("keyup", { key, code: code || key, bubbles: true, cancelable: true });
  p.window.dispatchEvent(ev);
  return ev;
}

test("Command -> Space -> Space (double-tap) opens a new tab", async () => {
  const p = openPage("<p>Hello</p>");
  pressKey(p, "Meta");
  const s1 = pressKey(p, " ", "Space");
  assert.equal(s1.defaultPrevented, true, "first space is suppressed from scrolling");
  releaseKey(p, " ", "Space");
  const s2 = pressKey(p, " ", "Space");
  assert.equal(s2.defaultPrevented, true, "second space is suppressed");
  releaseKey(p, " ", "Space");
  assert.deepEqual(plain(p.control.sentMessages.at(-1)), { atlas: { act: "tab-new" } });
});

test("Command -> Delete -> Delete closes current tab and prevents default on delete", () => {
  const p = openPage("<p>Hello</p>");
  pressKey(p, "Meta");
  const d1 = pressKey(p, "Backspace", "Backspace");
  assert.equal(d1.defaultPrevented, true, "first delete is suppressed");
  releaseKey(p, "Backspace", "Backspace");
  const d2 = pressKey(p, "Backspace", "Backspace");
  assert.equal(d2.defaultPrevented, true, "second delete is suppressed");
  releaseKey(p, "Backspace", "Backspace");
  assert.deepEqual(plain(p.control.sentMessages.at(-1)), { atlas: { act: "tab-close" } });
});

test("Command -> ArrowLeft -> ArrowLeft moves to previous tab and prevents default", () => {
  const p = openPage("<p>Hello</p>");
  pressKey(p, "Meta");
  const a1 = pressKey(p, "ArrowLeft", "ArrowLeft");
  assert.equal(a1.defaultPrevented, true, "first arrow left is suppressed");
  releaseKey(p, "ArrowLeft", "ArrowLeft");
  const a2 = pressKey(p, "ArrowLeft", "ArrowLeft");
  assert.equal(a2.defaultPrevented, true, "second arrow left is suppressed");
  releaseKey(p, "ArrowLeft", "ArrowLeft");
  assert.deepEqual(plain(p.control.sentMessages.at(-1)), { atlas: { act: "tab-prev" } });
});

test("Command -> ArrowRight -> ArrowRight moves to next tab and prevents default", () => {
  const p = openPage("<p>Hello</p>");
  pressKey(p, "Meta");
  const a1 = pressKey(p, "ArrowRight", "ArrowRight");
  assert.equal(a1.defaultPrevented, true, "first arrow right is suppressed");
  releaseKey(p, "ArrowRight", "ArrowRight");
  const a2 = pressKey(p, "ArrowRight", "ArrowRight");
  assert.equal(a2.defaultPrevented, true, "second arrow right is suppressed");
  releaseKey(p, "ArrowRight", "ArrowRight");
  assert.deepEqual(plain(p.control.sentMessages.at(-1)), { atlas: { act: "tab-next" } });
});

test("normal space typing without Command is not prevented", () => {
  const p = openPage("<p>Hello</p>");
  const ev = pressKey(p, " ", "Space");
  assert.equal(ev.defaultPrevented, false);
});


test("Control+Space on macOS neither focuses the address bar nor opens a tab", () => {
  const p = openPage("<p>Hello</p>");
  pressKey(p, "Control"); pressKey(p, " ", "Space"); releaseKey(p, " ", "Space");
  pressKey(p, "Control"); pressKey(p, " ", "Space"); releaseKey(p, " ", "Space");
  assert.equal(p.control.sentMessages.length, 0);
});

test("Windows retains the legacy Control double tap", () => {
  const p = openPage("<p>Hello</p>", "Win32");
  pressKey(p, "Control"); pressKey(p, "Control");
  assert.deepEqual(plain(p.control.sentMessages.at(-1)), { atlas: { act: "focus-addressbar" } });
});


test("leaving the page clears a navigation leader after native address focus", () => {
  const p = openPage("<p>Hello</p>");
  pressKey(p, "Meta"); pressKey(p, "Meta");
  p.window.dispatchEvent(new p.window.Event("blur"));
  assert.equal(pressKey(p, " ", "Space").defaultPrevented, false);
  pressKey(p, " ", "Space");
  assert.equal(p.control.sentMessages.length, 0);
});
