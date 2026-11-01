"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { openWindow } = require("./helpers/windowDom");
const open = [];
test.afterEach(() => { for (const w of open) w.window.close(); open.length = 0; });

async function start(platform = "MacIntel") {
  const w = await openWindow({ platform, windowId: 7, settleMs: 60 });
  open.push(w);
  w.window.document.getElementById("browser").insertAdjacentHTML("beforeend",
    '<div class="toolbar-mainbar"><input id="urlFieldInput" value="https://example.test/"></div>');
  return w;
}
function emit(w, name, ...args) { for (const fn of w.listeners[name] || []) fn(...args); }
function key(w, down, code = 91, modifiers = down ? 8 : 0, id = 7) {
  emit(w, "vivaldi.tabsPrivate.onKeyboardChanged", id, down, modifiers, code, false, false);
}
function tap(w, code = 91, id = 7) { key(w, true, code, 8, id); key(w, false, code, 0, id); }
function domKey(w, keyName) {
  w.window.dispatchEvent(new w.window.KeyboardEvent("keydown", { key: keyName, bubbles: true }));
}

test("generated Atlas bundle focuses once for either native Command key without page injection", async () => {
  const w = await start();
  const doc = w.window.document, field = doc.getElementById("urlFieldInput");
  assert.equal(w.window.__Atlas.nativeCommandTapsEnabled, true);
  for (const code of [91, 92, 93]) {
    field.blur();
    domKey(w, "Meta"); tap(w, code); domKey(w, "Meta");
    assert.notEqual(doc.activeElement, field, "DOM keydowns and one native tap cannot focus");
    tap(w, code);
    assert.equal(doc.activeElement, field);
    assert.equal(field.selectionStart, 0);
    assert.equal(field.selectionEnd, field.value.length);
    // A stale page script must not toggle or duplicate the native focus action.
    let legacyCalls = 0;
    w.window.__Atlas.focusAddressBar = () => legacyCalls++;
    w.control.deliver({ atlas: { act: "focus-addressbar" } }, { tab: { windowId: 7 } });
    assert.equal(legacyCalls, 0);
    await new Promise(r => setTimeout(r, 65));
    assert.equal(doc.activeElement, field);
  }
  assert.deepEqual(w.errors, []);
});

test("Control+Space and Command chords cannot activate native address focus", async () => {
  const w = await start(), doc = w.window.document;
  for (let i = 0; i < 3; i++) {
    domKey(w, "Control"); key(w, true, 17, 2); key(w, true, 32, 2);
    key(w, false, 32, 2); key(w, false, 17, 0);
  }
  tap(w); key(w, true); key(w, true, 65, 8); key(w, false, 65, 8); key(w, false); tap(w);
  assert.notEqual(doc.activeElement, doc.getElementById("urlFieldInput"));
});

test("pointer, tab and window changes cancel native tap pairs; other windows cannot focus this one", async () => {
  const w = await start(), doc = w.window.document;
  const cancelers = [
    () => emit(w, "vivaldi.tabsPrivate.onMouseChanged", false),
    () => emit(w, "chrome.windows.onFocusChanged", 8),
    () => emit(w, "chrome.tabs.onActivated", { windowId: 7, tabId: 2 }),
    () => w.window.dispatchEvent(new w.window.Event("pointerdown"))
  ];
  for (const cancel of cancelers) {
    cancel(); tap(w); cancel(); tap(w);
    assert.notEqual(doc.activeElement, doc.getElementById("urlFieldInput"));
  }
  tap(w, 93, 8); tap(w, 93, 8);
  assert.notEqual(doc.activeElement, doc.getElementById("urlFieldInput"));
});

test("native focus retries stop when the user types", async () => {
  const w = await start(), field = w.window.document.getElementById("urlFieldInput");
  let attempts = 0;
  field.focus = () => attempts++;
  tap(w); tap(w);
  assert.equal(attempts, 1);
  key(w, true, 65, 0);
  await new Promise(r => setTimeout(r, 180));
  assert.equal(attempts, 1);
});

test("UI navigation leader still works while native Command owns double taps", async () => {
  const w = await start();
  domKey(w, "Meta"); domKey(w, ","); domKey(w, ",");
  const queries = w.calls.filter(c => c.name === "chrome.tabs.query");
  const cb = queries.at(-1).args.find(a => typeof a === "function");
  cb([{ id: 9 }]);
  assert.ok(w.calls.some(c => c.name === "chrome.tabs.goBack" && c.args[0] === 9));
});

test("Windows keeps Control double-tap focus without installing the macOS native listener", async () => {
  const w = await start("Win32"), doc = w.window.document;
  assert.notEqual(w.window.__Atlas.nativeCommandTapsEnabled, true);
  domKey(w, "Control"); domKey(w, "Control");
  assert.equal(doc.activeElement, doc.getElementById("urlFieldInput"));
});


test("a completed native double tap clears the UI navigation leader", async () => {
  const w = await start();
  domKey(w, "Meta"); tap(w); domKey(w, "Meta"); tap(w);
  domKey(w, " "); domKey(w, " ");
  assert.equal(w.calls.filter(c => c.name === "chrome.tabs.create").length, 0);
});

test("native Command double taps toggle focus back to the page for both Command keys", async () => {
  const w = await start(), doc = w.window.document;
  const field = doc.getElementById("urlFieldInput");
  doc.getElementById("browser").insertAdjacentHTML("beforeend",
    '<div class="webpageview active"><webview tabindex="0"></webview></div>');
  const page = doc.querySelector("webview");
  for (const code of [91, 92, 93]) {
    page.focus();
    tap(w, code); tap(w, code);
    assert.equal(doc.activeElement, field, "first double tap focuses the address bar");
    // Toggle before the first handoff's 50ms check has run.
    tap(w, code); tap(w, code);
    assert.equal(doc.activeElement, page, "next double tap returns focus to the page");
    await new Promise(r => setTimeout(r, 170));
    assert.equal(doc.activeElement, page, "a delayed focus retry cannot undo the toggle");
    tap(w, code); tap(w, code);
    assert.equal(doc.activeElement, field, "another double tap focuses it again");
    emit(w, "vivaldi.tabsPrivate.onMouseChanged", false);
  }
  assert.deepEqual(w.errors, []);
});

test("native double tap releases an address field focused by clicking", async () => {
  const w = await start(), doc = w.window.document;
  const field = doc.getElementById("urlFieldInput");
  field.focus();
  tap(w, 93); tap(w, 91);
  assert.notEqual(doc.activeElement, field);
  await new Promise(r => setTimeout(r, 170));
  assert.notEqual(doc.activeElement, field);
});

test("a stale address-field activeElement in an inactive UI document must still focus, not blur", async () => {
  const w = await start(), doc = w.window.document;
  const field = doc.getElementById("urlFieldInput");
  field.focus();
  Object.defineProperty(doc, "hasFocus", { configurable: true, value: () => false });
  let blurCalls = 0;
  field.blur = () => blurCalls++;
  tap(w); tap(w);
  assert.equal(blurCalls, 0);
  assert.equal(doc.activeElement, field);
});
