// Settings > Pages (src/settings/pagesSection.js): every page with its
// subtitle, in switcher order. Edit and Add page open the add popup in Page
// mode; pages move up and down and can be deleted; Home stays first.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { openNewTab, closeAll, waitFor, settle, click } = require("./helpers/newtabDom");

test.afterEach(closeAll);

const text = (el) => (el ? el.textContent.replace(/\s+/g, " ").trim() : "");
const plain = (v) => JSON.parse(JSON.stringify(v));

const PAGES = [
  { id: "search", label: "Home", type: "search", sub: "Everything at a glance" },
  { id: 1, label: "College", type: "bookmarks", sub: "Classes and due dates" },
  { id: 2, label: "Work", type: "bookmarks", sub: "Shifts and pay stubs" },
];

async function openPagesSettings() {
  const t = await openNewTab({ local: { hasSeededDefaults: true }, sync: { activeTabs: PAGES } });
  const { window: win, document: doc } = t;
  click(win, doc.getElementById("global-settings-btn"));
  click(win, await waitFor(() => doc.querySelector('#sp-nav [data-page="pages"]'), 2000, "Pages in the settings menu"));
  await waitFor(() => doc.querySelector("#sp-content .pg-row"), 2000, "page rows");
  return t;
}

const rows = (t) => [...t.document.querySelectorAll("#sp-content .pg-row")];
const rowText = (t) => rows(t).map((r) => [text(r.querySelector(".sp-row-title")), text(r.querySelector(".sp-row-desc"))]);
const button = (t, action, id) => t.document.querySelector(`#sp-content [data-action="${action}"][data-id="${id}"]`);
const stored = async (t) => plain((await t.chrome.storage.sync.get(["activeTabs"])).activeTabs);
const switcher = (t) => [...t.document.querySelectorAll("#tabs-container .switcher-item .label")].map((l) => l.firstChild.textContent);

/** Open a page's ⋮ menu and click one of its items. */
async function fromMenu(t, id, action) {
  click(t.window, button(t, "page-menu", id));
  const item = await waitFor(() => t.document.querySelector(`#sp-content .sp-popmenu [data-action="${action}"][data-id="${id}"]`), 2000, `${action} in the menu`);
  click(t.window, item);
}
function drag(t, fromId, toId) {
  const ev = (type, el) => el.dispatchEvent(new t.window.Event(type, { bubbles: true, cancelable: true }));
  const handle = button(t, "page-drag", fromId);
  const target = t.document.querySelector(`#sp-content .pg-row[data-page-id="${toId}"]`);
  ev("dragstart", handle); ev("dragover", target); ev("drop", target); ev("dragend", handle);
}

function setField(t, p, name, value) {
  const el = p.querySelector(`[data-field="${name}"]`);
  el.value = value;
  el.dispatchEvent(new t.window.Event("input", { bubbles: true }));
}

test("Settings > Pages lists every page in order with its subtitle", async () => {
  const t = await openPagesSettings();
  assert.deepEqual(rowText(t), [["Dashboard", "Everything at a glance"], ["College", "Classes and due dates"], ["Work", "Shifts and pay stubs"]]);
  assert.deepEqual(t.errors, []);
});

test("Edit opens the popup filled in; saving updates Settings, the switcher and storage", async () => {
  const t = await openPagesSettings();
  await fromMenu(t, "1", "page-edit");
  const p = await waitFor(() => t.document.querySelector(".add-popup"), 2000, "popup");
  assert.equal(text(p.querySelector(".picker-title")), "Edit page");
  assert.equal(p.querySelector('[data-field="pageName"]').value, "College");
  assert.equal(p.querySelector('[data-field="sub"]').value, "Classes and due dates");
  assert.equal(p.querySelector("[data-add-mode]"), null, "editing a page has no Bookmark | Page switch");
  setField(t, p, "pageName", "School");
  setField(t, p, "sub", "Classes, labs and exams");
  click(t.window, p.querySelector("[data-add-save]"));
  await waitFor(() => !t.document.querySelector(".add-popup"), 2000, "popup closes");
  await settle(t.window, 50);
  assert.deepEqual(rowText(t)[1], ["School", "Classes, labs and exams"]);
  assert.deepEqual((await stored(t)).map((p2) => p2.label), ["Home", "School", "Work"]);
  assert.equal((await stored(t))[1].sub, "Classes, labs and exams");
  assert.equal(switcher(t)[1], "School");
});

test("Add page opens the popup in Page mode, and the new page joins the list", async () => {
  const t = await openPagesSettings();
  click(t.window, t.document.querySelector('#sp-content [data-action="page-add"]'));
  const p = await waitFor(() => t.document.querySelector(".add-popup"), 2000, "popup");
  assert.equal(p.querySelector('[data-add-mode="page"]').getAttribute("aria-pressed"), "true");
  setField(t, p, "pageName", "Gym");
  setField(t, p, "sub", "Workouts and meal plans");
  click(t.window, p.querySelector("[data-add-save]"));
  await waitFor(() => rows(t).length === 4, 2000, "a fourth row");
  assert.deepEqual(rowText(t)[3], ["Gym", "Workouts and meal plans"]);
  assert.ok(!t.document.getElementById("sp-root").hidden, "Settings stays open");
});

test("pages reorder by dragging, the switcher follows, and Home stays first", async () => {
  const t = await openPagesSettings();
  assert.equal(t.document.querySelector('#sp-content [data-action="page-up"], #sp-content [data-action="page-down"]'), null, "no up and down buttons");
  assert.equal(button(t, "page-drag", "search"), null, "Home can't be dragged");
  drag(t, "1", "2");
  await settle(t.window, 50);
  assert.deepEqual(rowText(t).map((r) => r[0]), ["Dashboard", "Work", "College"]);
  assert.deepEqual((await stored(t)).map((p) => p.label), ["Home", "Work", "College"]);
  assert.deepEqual(switcher(t), ["Dashboard", "Work", "College"]);
  drag(t, "1", "search");
  await settle(t.window, 50);
  assert.deepEqual((await stored(t)).map((p) => p.label), ["Home", "College", "Work"], "dropped on Home: first after Home");
});

test("the drag handle also moves a page with the arrow keys", async () => {
  const t = await openPagesSettings();
  const key = (id, k) => button(t, "page-drag", id).dispatchEvent(new t.window.KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
  key("1", "ArrowDown");
  await settle(t.window, 50);
  assert.deepEqual((await stored(t)).map((p) => p.label), ["Home", "Work", "College"]);
  assert.equal(t.document.activeElement, button(t, "page-drag", "1"), "the handle keeps focus");
  key("1", "ArrowUp");
  key("1", "ArrowUp");
  await settle(t.window, 50);
  assert.deepEqual((await stored(t)).map((p) => p.label), ["Home", "College", "Work"], "never above Home");
});

test("each page has one ⋮ button; Home's menu has no Delete", async () => {
  const t = await openPagesSettings();
  for (const id of ["search", "1", "2"]) assert.ok(button(t, "page-menu", id), `⋮ on ${id}`);
  assert.equal(t.document.querySelector('#sp-content .pg-row > .sp-row-ctrl > [data-action="page-edit"]'), null, "no Edit button on the row itself");
  click(t.window, button(t, "page-menu", "search"));
  const menu = await waitFor(() => t.document.querySelector("#sp-content .sp-popmenu"), 2000, "Home's menu");
  assert.deepEqual([...menu.querySelectorAll("[data-action]")].map((b) => b.dataset.action), ["page-edit"]);
});

test("the ⋮ menu closes on Escape without closing Settings, and on a click elsewhere", async () => {
  const t = await openPagesSettings();
  click(t.window, button(t, "page-menu", "1"));
  await waitFor(() => t.document.querySelector("#sp-content .sp-popmenu"), 2000, "menu");
  t.document.body.dispatchEvent(new t.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
  await settle(t.window, 30);
  assert.equal(t.document.querySelector("#sp-content .sp-popmenu"), null, "menu closed");
  assert.ok(!t.document.getElementById("sp-root").hidden, "Settings stays open");
  click(t.window, button(t, "page-menu", "1"));
  await waitFor(() => t.document.querySelector("#sp-content .sp-popmenu"), 2000, "menu again");
  click(t.window, t.document.querySelector("#sp-content .sp-page-title"));
  await settle(t.window, 30);
  assert.equal(t.document.querySelector("#sp-content .sp-popmenu"), null, "a click elsewhere closes it");
});

test("Delete in the ⋮ menu asks first; Cancel keeps the page; confirming removes it", async () => {
  const t = await openPagesSettings();
  await fromMenu(t, "2", "page-delete");
  await settle(t.window, 50);
  assert.match(text(rows(t)[2]), /Delete Work and its bookmarks\?/);
  click(t.window, t.document.querySelector('#sp-content [data-action="page-delete-cancel"]'));
  await settle(t.window, 50);
  assert.equal(rows(t).length, 3);
  await fromMenu(t, "2", "page-delete");
  await settle(t.window, 50);
  click(t.window, button(t, "page-delete-go", "2"));
  await settle(t.window, 100);
  assert.deepEqual(rowText(t).map((r) => r[0]), ["Dashboard", "College"]);
  assert.deepEqual((await stored(t)).map((p) => p.label), ["Home", "College"]);
  assert.deepEqual(switcher(t), ["Dashboard", "College"]);
});

test("Settings lists Profiles, Search, Pages, Appearance, Focus, then the data pages, and opens on Profiles", async () => {
  const t = await openNewTab({ local: { hasSeededDefaults: true }, sync: { activeTabs: PAGES } });
  click(t.window, t.document.getElementById("global-settings-btn"));
  await waitFor(() => t.document.querySelector('#sp-nav [data-page="profiles"]'), 2000, "Profiles in the list");
  assert.deepEqual([...t.document.querySelectorAll("#sp-nav [data-page]")].map((b) => b.dataset.page),
    ["profiles", "search", "pages", "appearance", "focus", "backup", "reset", "review"]);
  await waitFor(() => text(t.document.querySelector("#sp-content .sp-page-title")) === "Profiles", 2000, "opens on Profiles");
});
