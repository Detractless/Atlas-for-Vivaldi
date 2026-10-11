// Clicking away from the address field after typing puts the page's address
// back (src/modules/21-addressbar-revert.js): Atlas runs Vivaldi's own reset
// for the tab the field was editing. Vivaldi's core is faked here: a module
// list with the reset among other modules, reached the way Atlas reaches the
// real one (chrome.extension.getViews, then Vivaldi's module loader).
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { openWindow } = require("./helpers/windowDom");

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let open = [];
test.afterEach(() => { for (const w of open) w.window.close(); open = []; });

const PAGE = "https://docs.google.com/document/d/1Xq7/edit";
const NEWTAB = "chrome-extension://mpognobbkildjkofajifpdfhcoklimli/index.html";
const TAB = 7;

/* Vivaldi's core document: its module loader, with the address field's actions
   (the reset) beside the store that also names URLFIELD_RESET, and others. */
function fakeCore(resets) {
  const field = { updateState() {}, reset: (id) => resets.push(id) };
  const exportsById = { 10: { Z: {} }, 67975: { Z: field }, 99: { Z: { getUrlfieldState() {} } } };
  const req = (id) => exportsById[id];
  req.m = {
    10: function (e, t, n) { n.d(t, { Z: () => ({}) }); },
    67975: function (e, t, n) {
      n.d(t, { Z: () => s });
      const s = new class {
        updateState(e, t) { d({ actionType: "URLFIELD_UPDATE_STATE", pageId: e, state: t }); }
        reset(e) { d({ actionType: "URLFIELD_RESET", pageId: e }); }
      }();
    },
    // The store: names URLFIELD_RESET too, but is one of Vivaldi's big modules.
    99: new Function("e", "t", "n", "/* case 'URLFIELD_RESET': */ var rest = '" + "x".repeat(3000) + "';"),
  };
  const chunks = [];
  chunks.push = (data) => { if (data[2]) data[2](req); return 0; };
  return { isPortal: true, webpackChunkgapp_browser_react: chunks };
}

async function start(value = PAGE, opts = {}) {
  const w = await openWindow();
  open.push(w);
  w.resets = [];
  if (opts.core !== false) {
    const core = fakeCore(w.resets);
    w.window.chrome.extension = { getViews: () => [w.window, core] };
  }
  const doc = w.window.document;
  doc.getElementById("browser").insertAdjacentHTML("beforeend",
    '<div class="toolbar-mainbar"><div class="UrlBar-AddressField">' +
    '<div class="toolbar toolbar-small toolbar-insideinput"><button class="button-addressfield SiteInfoButton web"></button></div>' +
    '<div class="UrlBar-UrlFieldWrapper"><input class="UrlBar-UrlField url vivaldi-addressfield"></div></div></div>' +
    '<button id="elsewhere">page</button>');
  w.input = doc.querySelector(".UrlBar-AddressField input.url");
  w.input.value = value;
  return w;
}
/* Into the field, with the active tab answered as Vivaldi would. */
async function focus(w, tabId = TAB) {
  const before = w.calls.length;
  w.input.focus();
  w.input.dispatchEvent(new w.window.FocusEvent("focusin", { bubbles: true }));
  for (const c of w.calls.slice(before)) {
    if (c.name === "chrome.tabs.query" && typeof c.args[1] === "function") c.args[1]([{ id: tabId, url: PAGE }]);
  }
  await wait(40);
}
function type(w, text) {
  w.input.value = text;
  w.input.dispatchEvent(new w.window.Event("input", { bubbles: true }));
}
/* Focus goes elsewhere in the window: the page, a tab. */
async function clickAway(w) {
  w.window.document.getElementById("elsewhere").focus();
  await wait(20);
}

test("clicking away after typing puts the tab's address back", async () => {
  const w = await start();
  await focus(w);
  type(w, "");
  await clickAway(w);
  assert.deepEqual(w.resets, [TAB], "Vivaldi's reset, for the tab the field was editing");
  await focus(w);
  type(w, "how to");
  await clickAway(w);
  assert.deepEqual(w.resets, [TAB, TAB]);
  assert.deepEqual(w.errors, []);
});

test("the tab noted on the way in is the one put back; coming straight back in keeps the typing", async () => {
  const w = await start();
  await focus(w, 3);
  type(w, "cats");
  await clickAway(w);
  assert.deepEqual(w.resets, [3]);
  await focus(w, 9);
  type(w, "dogs");
  w.window.document.getElementById("elsewhere").focus();
  await focus(w, 9);   // back in the field before its turn came
  await wait(20);
  assert.deepEqual(w.resets, [3], "the field is in use again: nothing put back");
});

test("a field you never typed in is left alone", async () => {
  const w = await start();
  await focus(w);
  w.input.dispatchEvent(new w.window.KeyboardEvent("keyup", { key: "ArrowRight", bubbles: true }));
  await clickAway(w);
  assert.deepEqual(w.resets, []);
});

test("Vivaldi losing focus to another app keeps the typing", async () => {
  const w = await start();
  await focus(w);
  type(w, "half a thou");
  // The window loses focus; the field stays the window's focused element.
  w.input.dispatchEvent(new w.window.FocusEvent("focusout", { bubbles: true }));
  await wait(20);
  assert.equal(w.window.document.activeElement, w.input);
  assert.deepEqual(w.resets, []);
});

test("Enter is left to Vivaldi; Cmd+Enter (another tab) still puts this one back", async () => {
  const w = await start();
  await focus(w);
  type(w, "notion.com");
  w.input.dispatchEvent(new w.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  await clickAway(w);
  assert.deepEqual(w.resets, [], "plain Enter: the page is loading");
  await focus(w);
  type(w, "notion.com");
  w.input.dispatchEvent(new w.window.KeyboardEvent("keydown", { key: "Enter", metaKey: true, bubbles: true }));
  await clickAway(w);
  assert.deepEqual(w.resets, [TAB]);
});

test("on the new tab, typing then clicking away empties the field again", async () => {
  const w = await start(NEWTAB);
  await focus(w);
  type(w, "cats");
  await clickAway(w);
  assert.deepEqual(w.resets, [TAB]);
  assert.deepEqual(w.errors, []);
});

test("without Vivaldi's reset, clicking away does nothing and breaks nothing", async () => {
  const w = await start(PAGE, { core: false });
  await focus(w);
  type(w, "cats");
  await clickAway(w);
  await focus(w);
  type(w, "dogs");
  await clickAway(w);
  assert.equal(w.input.value, "dogs");
  assert.deepEqual(w.errors, []);
});
