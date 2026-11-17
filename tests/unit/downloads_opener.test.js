"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const source = fs.readFileSync(path.join(__dirname, "../../src/modules/downloads/34-downloads-panel.js"), "utf8");
const HTML = `<div id="switch">
  <div class="panel-clickoutside-ignore active" data-wrap="chat"><button data-name="EXT_PANEL_chatgpt"></button></div>
  <div class="panel-clickoutside-ignore" data-wrap="downloads"><button data-name="WEBPANEL_atlas_downloads"></button></div>
</div><div id="panels-container" class="expanded"><webview src="chrome-extension://x/chatgpt.html"></webview></div>`;
const windows = [];
test.after(() => windows.forEach((w) => w.close()));

function open({ showing = false, button = true, overlap = false, mode = "accept", transitionMs = 0 } = {}) {
  const dom = new JSDOM("<body>" + HTML + "</body>", { runScripts: "outside-only", pretendToBeVisual: true });
  const w = dom.window;
  windows.push(w);
  let created;
  w.chrome = { downloads: { onCreated: { addListener: (f) => { created = f; } } } };

  const box = w.document.getElementById("panels-container");
  const chatWrap = w.document.querySelector('[data-wrap="chat"]');
  const dlWrap = w.document.querySelector('[data-wrap="downloads"]');
  const sw = w.document.querySelector('[data-name="WEBPANEL_atlas_downloads"]');
  let chatView = w.document.querySelector("webview");
  chatView.getBoundingClientRect = () => ({ width: 420 });
  let downloadView = null;
  if (!button) sw.remove();
  if (showing) {
    chatWrap.classList.remove("active");
    dlWrap.classList.add("active");
    chatView.setAttribute("src", "chrome-extension://x/components/atlas/atlas-downloads-panel.html");
  }
  if (overlap) {
    downloadView = w.document.createElement("webview");
    downloadView.setAttribute("src", "chrome-extension://x/components/atlas/atlas-downloads-panel.html");
    downloadView.getBoundingClientRect = () => ({ width: 180 });
    box.appendChild(downloadView);
  }

  const transitionEndsAt = Date.now() + transitionMs;
  box.getAnimations = () => Date.now() < transitionEndsAt ? [{ playState: "running" }] : [];
  const presses = [];
  let clicks = 0;
  if (sw) {
    ["pointerdown", "mousedown", "pointerup", "mouseup", "click"].forEach((type) => {
      sw.addEventListener(type, () => presses.push(type));
    });
    sw.addEventListener("click", () => {
      clicks++;
      if (!button || Date.now() < transitionEndsAt || (mode === "ignore-first" && clicks === 1)) return;

      chatWrap.classList.remove("active");
      dlWrap.classList.add("active");
      box.classList.add("expanded");
      if (mode === "delayed-view") {
        if (!downloadView) {
          downloadView = w.document.createElement("webview");
          downloadView.setAttribute("src", "chrome-extension://x/components/atlas/atlas-downloads-panel.html");
          downloadView.getBoundingClientRect = () => ({ width: 180 });
          box.appendChild(downloadView);
        }
      } else {
        chatView.setAttribute("src", "chrome-extension://x/components/atlas/atlas-downloads-panel.html");
        chatView.getBoundingClientRect = () => ({ width: 358 });
      }
    });
  }

  w.eval("var Atlas = {};\n" + source + "\nwindow.Atlas = Atlas;");
  return {
    w, presses, clickCount: () => clicks,
    showing: () => box.classList.contains("expanded") && dlWrap.classList.contains("active"),
    start: (item) => created(item),
  };
}

test("a download opens the Downloads switch once", async () => {
  const b = open();
  const sw = b.w.document.querySelector('[data-name="WEBPANEL_atlas_downloads"]');
  b.start({ id: 1 });
  assert.deepEqual(b.presses, ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]);
  await new Promise((resolve) => setTimeout(resolve, 350));
  assert.equal(b.clickCount(), 1);
  assert.equal(b.showing(), true);
  assert.equal(sw.classList.contains("active"), false, "Vivaldi puts active on the toolbar wrapper");
  assert.equal(b.w.document.querySelector('[data-wrap="downloads"]').classList.contains("active"), true);
  assert.equal(sw.classList.contains("button-on"), false, "panel switches never get button-on");
});

test("a selected Downloads panel does not retry while its webview is still transitioning", async () => {
  const b = open({ mode: "delayed-view", overlap: true });
  b.start({ id: 1 });
  await new Promise((resolve) => setTimeout(resolve, 350));
  assert.equal(b.clickCount(), 1, "the old ChatGPT webview can remain wider during the transition");
  assert.equal(b.showing(), true);
});

test("a press ignored during an existing panel transition retries after it settles", async () => {
  const b = open({ transitionMs: 350 });
  b.start({ id: 1 });
  await new Promise((resolve) => setTimeout(resolve, 420));
  assert.equal(b.clickCount(), 2, "one initial press plus one retry after the transition");
  assert.equal(b.showing(), true);
});

test("nothing happens when Downloads is already showing", () => {
  const b = open({ showing: true });
  b.start({ id: 1 });
  assert.deepEqual(b.presses, []);
});

test("a download an extension started stays quiet", () => {
  const b = open();
  b.start({ id: 1, byExtensionId: "abc" });
  assert.deepEqual(b.presses, []);
});

test("two downloads at once do not start overlapping opens", () => {
  const b = open();
  b.start({ id: 1 });
  b.start({ id: 2 });
  assert.equal(b.clickCount(), 1);
});

test("with no panel registered, a download is left alone", () => {
  const b = open({ button: false });
  assert.doesNotThrow(() => b.start({ id: 1 }));
});

test("a download resets a navigated webview back to the downloads page", async () => {
  const b = open();
  const view = b.w.document.querySelector("webview");
  view.setAttribute("src", "https://chatgpt.com/c/6af5e10a-f1cc-83ea-ba7f-b0862cb193cf");
  b.start({ id: 1 });
  await new Promise((resolve) => setTimeout(resolve, 350));
  assert.equal(view.getAttribute("src").includes("components/atlas/atlas-downloads-panel.html"), true);
});
