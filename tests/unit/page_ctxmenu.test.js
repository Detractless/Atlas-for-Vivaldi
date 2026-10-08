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
const SCRIPTS = ["atlas-spelling.js", "atlas-ctxmenu.js"].map((f) => fs.readFileSync(path.join(ATLAS, f), "utf8"));
const plain = (v) => JSON.parse(JSON.stringify(v));
let open = [];
test.afterEach(() => { for (const p of open) p.window.close(); open = []; });

function openPage(body) {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", (e) => { if (e.type !== "not-implemented") errors.push(String(e.cause || e.message)); });
  let fake;
  const dom = new JSDOM(`<!DOCTYPE html><body>${body}</body>`, {
    url: "https://site.test/page", runScripts: "outside-only", pretendToBeVisual: true, virtualConsole,
    beforeParse(window) {
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
