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
  click(t.window, button(t, "page-edit", "1"));
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

test("pages move up and down, the switcher follows, and Home stays first", async () => {
  const t = await openPagesSettings();
  assert.equal(button(t, "page-up", "search"), null, "Home has no Move up");
  assert.equal(button(t, "page-down", "search"), null, "Home has no Move down");
  assert.ok(button(t, "page-up", "1").disabled, "the first page after Home can't go above it");
  assert.ok(button(t, "page-down", "2").disabled, "the last page can't go lower");
  click(t.window, button(t, "page-down", "1"));
  await settle(t.window, 50);
  assert.deepEqual(rowText(t).map((r) => r[0]), ["Dashboard", "Work", "College"]);
  assert.deepEqual((await stored(t)).map((p) => p.label), ["Home", "Work", "College"]);
  assert.deepEqual(switcher(t), ["Dashboard", "Work", "College"]);
  click(t.window, button(t, "page-up", "1"));
  await settle(t.window, 50);
  assert.deepEqual((await stored(t)).map((p) => p.label), ["Home", "College", "Work"]);
});

test("Delete asks first; Cancel keeps the page; confirming removes it. Home has no Delete", async () => {
  const t = await openPagesSettings();
  assert.equal(button(t, "page-delete", "search"), null);
  click(t.window, button(t, "page-delete", "2"));
  await settle(t.window, 50);
  assert.match(text(rows(t)[2]), /Delete Work and its bookmarks\?/);
  click(t.window, t.document.querySelector('#sp-content [data-action="page-delete-cancel"]'));
  await settle(t.window, 50);
  assert.equal(rows(t).length, 3);
  click(t.window, button(t, "page-delete", "2"));
  await settle(t.window, 50);
  click(t.window, button(t, "page-delete-go", "2"));
  await settle(t.window, 100);
  assert.deepEqual(rowText(t).map((r) => r[0]), ["Dashboard", "College"]);
  assert.deepEqual((await stored(t)).map((p) => p.label), ["Home", "College"]);
  assert.deepEqual(switcher(t), ["Dashboard", "College"]);
});
