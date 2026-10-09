// Reading and using Atlas's right-click menu (components/atlas/atlas-menu.js) in
// tests. The harness opens its shadow root and keeps it as host.__root.
"use strict";

/** The open menu's shadow root, or null. */
function menuRoot(doc) {
  const host = doc.querySelector("atlas-ctx");
  return host ? host.__root : null;
}

/** The labels of the open menu's items, in order ([] when closed). */
function menuLabels(doc) {
  const root = menuRoot(doc);
  return root ? [...root.querySelectorAll(".mi > span:first-child")].map((s) => s.textContent) : [];
}

/** Choose an item the way a mouse does (the menu acts on mouseup). */
function pickMenu(win, doc, label) {
  const root = menuRoot(doc);
  const row = root && [...root.querySelectorAll(".mi")].find((r) => r.firstChild.textContent === label);
  if (!row) throw new Error(`"${label}" is not in the menu (${menuLabels(doc).join(", ")})`);
  row.dispatchEvent(new win.MouseEvent("mouseup", { bubbles: true, button: 0 }));
}

module.exports = { menuRoot, menuLabels, pickMenu };
