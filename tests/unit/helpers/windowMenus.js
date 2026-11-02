// Helpers for tests that right-click in the stand-in browser window and read the menu Atlas draws there.
"use strict";

const assert = require("node:assert/strict");

function rightClick(w, el) {
  el.dispatchEvent(new w.window.MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 50, clientY: 40 }));
}

/* The window menu lives in a shadow root of its own (37-ui-menu.js), so reach its rows through the host. */
const uiMenuHost = (w) => w.window.document.querySelector(".atlas-ui-menu");
const uiMenuItems = (w) => { const host = uiMenuHost(w); return host ? [...host.shadowRoot.querySelectorAll(".apm-item")] : []; };
const menuLabels = (w) => uiMenuItems(w).map((b) => b.querySelector("span").textContent);

/* Answer the most recent call to a stand-in chrome.* function with `value`. */
function answer(w, name, value) {
  const call = [...w.calls].reverse().find((c) => c.name === name);
  assert.ok(call, `${name} was called`);
  call.args.find((a) => typeof a === "function")(w.window.JSON.parse(JSON.stringify(value)));
}

module.exports = { rightClick, uiMenuHost, uiMenuItems, menuLabels, answer };
