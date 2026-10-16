// Driving the add popup (components/addPopup) in tests: one question per screen.
"use strict";

const { waitFor, settle, click } = require("./newtabDom");

const text = (el) => (el ? el.textContent.replace(/\s+/g, " ").trim() : "");
const field = (p, name) => p.querySelector(`[data-field="${name}"]`);
const titleOf = (p) => text(p.querySelector("[data-title]"));

/** The + button on the new tab opens the bookmark flow. Pages are added in the address bar (the profile menu's
    Add > Add page; addbarHarness.js drives that), so the popup's Page mode has no button any more. */
async function openAdd(t) {
  click(t.window, t.document.getElementById("global-add-btn"));
  return waitFor(() => t.document.querySelector(".add-popup"), 2000, "add popup");
}

function setField(t, p, name, value) {
  const el = field(p, name);
  el.value = value;
  el.dispatchEvent(new t.window.Event("input", { bubbles: true }));
}

async function next(t, p) {
  click(t.window, p.querySelector("[data-add-next]"));
  await settle(t.window, 40);
}

/** Open a drop-down pill (page or group) and click the row that starts with `label`. */
async function pick(t, p, key, label) {
  await waitFor(() => [...p.querySelectorAll(`[data-dd-item="${key}"]`)].some((i) => text(i).startsWith(label)), 2000, `${key} "${label}" offered`);
  click(t.window, p.querySelector(`[data-dd="${key}"]`));
  click(t.window, [...p.querySelectorAll(`[data-dd-item="${key}"]`)].find((i) => text(i).startsWith(label)));
  await settle(t.window, 40);
}

async function save(t, p, { waitClosed = true } = {}) {
  click(t.window, p.querySelector("[data-add-save]"));
  if (waitClosed) await waitFor(() => !t.document.querySelector(".add-popup"), 2000, "popup closes");
}

/** The whole bookmark flow: the address, then the name and the place, then Add. */
async function addBookmarkFlow(t, { url, name, page, group, newGroup }) {
  const p = await openAdd(t);
  setField(t, p, "url", url);
  await next(t, p);
  if (name !== undefined) setField(t, p, "name", name);
  if (page) await pick(t, p, "page", page);
  if (group) await pick(t, p, "group", group);
  if (newGroup) setField(t, p, "newGroup", newGroup);
  await save(t, p);
}

module.exports = { text, field, titleOf, openAdd, setField, next, pick, save, addBookmarkFlow };
