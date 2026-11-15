"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const source = fs.readFileSync(path.join(__dirname, "../../src/modules/downloads/34-downloads-panel.js"), "utf8");
const BUTTON = '<div id="panels-container"><button data-name="WEBPANEL_atlas_downloads"></button></div>';

// A browser window with the panel's switch button; `showing` puts the panel's page on screen.
function open({ showing, button = true, otherPanelOverlap = false } = {}) {
  const dom = new JSDOM("<body>" + (button ? BUTTON : "") + "</body>", { runScripts: "outside-only", pretendToBeVisual: true });
  const w = dom.window;
  let created;
  w.chrome = { downloads: { onCreated: { addListener: (f) => { created = f; } } } };
  const presses = [];
  const sw = w.document.querySelector("button");
  if (sw) ["pointerdown", "mousedown", "pointerup", "mouseup", "click"].forEach((t) => sw.addEventListener(t, () => presses.push(t)));
  if (showing) {
    const view = w.document.createElement("webview");
    view.setAttribute("src", "chrome-extension://x/components/atlas/atlas-downloads-panel.html");
    view.getBoundingClientRect = () => ({ width: 358 });
    w.document.getElementById("panels-container").appendChild(view);
  }
  if (otherPanelOverlap) {
    const view = w.document.createElement("webview");
    view.setAttribute("src", "chrome-extension://x/other-panel.html");
    view.getBoundingClientRect = () => ({ width: 420 });
    w.document.getElementById("panels-container").appendChild(view);
  }
  w.eval("var Atlas = {};\n" + source + "\nwindow.Atlas = Atlas;");
  return { w, presses, start: (item) => created(item) };
}

test("a download that starts presses the panel's switch like a click", () => {
  const b = open();
  b.start({ id: 1 });
  assert.deepEqual(b.presses, ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]);
});

test("nothing happens when the panel is already showing", () => {
  const b = open({ showing: true });
  b.start({ id: 1 });
  assert.deepEqual(b.presses, []);
});

test("a hidden Downloads panel during another panel's slide does not block opening it", () => {
  const b = open({ showing: true, otherPanelOverlap: true });
  b.start({ id: 1 });
  assert.deepEqual(b.presses, ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]);
});

test("a download an extension started stays quiet", () => {
  const b = open();
  b.start({ id: 1, byExtensionId: "abc" });
  assert.deepEqual(b.presses, []);
});

test("two downloads at once press it only once", () => {
  const b = open();
  b.start({ id: 1 });
  b.start({ id: 2 });
  assert.equal(b.presses.filter((t) => t === "click").length, 1);
});

test("an open press the switch ignores is repeated once after the slide", async () => {
  const b = open();
  b.start({ id: 1 });
  await new Promise((r) => setTimeout(r, 350));
  assert.equal(b.presses.filter((t) => t === "click").length, 2);
});

test("with no panel registered, a download is left alone", () => {
  const b = open({ button: false });
  assert.doesNotThrow(() => b.start({ id: 1 }));
});
