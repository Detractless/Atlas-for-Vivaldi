// The add popup (components/addPopup): one popup, opened by the + button, that
// adds a bookmark or a page. It replaced the + menu and its four step-by-step
// dialogs (name, URL, page, group).
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { openNewTab, closeAll, waitFor, settle, click } = require("./helpers/newtabDom");

test.afterEach(closeAll);

const text = (el) => (el ? el.textContent.replace(/\s+/g, " ").trim() : "");
const plain = (v) => JSON.parse(JSON.stringify(v));

async function openPopup(t) {
  click(t.window, t.document.getElementById("global-add-btn"));
  return waitFor(() => t.document.querySelector(".add-popup"), 2000, "add popup");
}
const field = (p, name) => p.querySelector(`[data-field="${name}"]`);
const errorFor = (p, name) => text(p.querySelector(`[data-error-for="${name}"]`));

function fill(win, el, value) {
  el.value = value;
  el.dispatchEvent(new win.Event("input", { bubbles: true }));
  el.dispatchEvent(new win.Event("change", { bubbles: true }));
}

async function chooseGroup(t, p, label) {
  const sel = field(p, "group");
  await waitFor(() => [...sel.options].some((o) => o.textContent === label), 2000, `group "${label}" offered`);
  fill(t.window, sel, [...sel.options].find((o) => o.textContent === label).value);
}

async function pageId(t, label) {
  const pages = plain((await t.chrome.storage.sync.get(["activeTabs"])).activeTabs);
  return String(pages.find((p) => p.label === label).id);
}

/** Switch to a bookmarks page and return its text once `expect` shows. */
async function openPage(t, label, expect) {
  const { window: win, document: doc } = t;
  click(win, doc.querySelector(".switcher-btn"));
  click(win, [...doc.querySelectorAll(".switcher-item")].find((li) => li.textContent.includes(label)));
  const page = doc.getElementById("bookmarks-page");
  await waitFor(() => page.classList.contains("active") && text(page).includes(expect), 3000, `${label} page`);
  return page;
}

test("+ opens one popup in Bookmark mode, on the first page when Home is showing", async () => {
  const t = await openNewTab();
  const p = await openPopup(t);
  for (const f of ["name", "url", "page", "group"]) assert.ok(field(p, f), `${f} field`);
  assert.equal(p.querySelector('[data-add-mode="bookmark"]').getAttribute("aria-pressed"), "true");
  assert.equal(field(p, "page").value, await pageId(t, "Essentials"));
  assert.equal(t.document.querySelector(".bookmark-dialog"), null, "no step-by-step dialog");
  assert.equal(t.document.getElementById("add-menu-panel"), null, "the old + menu is gone");
  assert.deepEqual(t.errors, []);
});

test("a bookmark is added with its name, URL, page and group, and shows on its page", async () => {
  const t = await openNewTab();
  const p = await openPopup(t);
  fill(t.window, field(p, "name"), "Smoke Test Site");
  fill(t.window, field(p, "url"), "smoke.example.com");
  await chooseGroup(t, p, "PRODUCTIVITY");
  click(t.window, p.querySelector("[data-add-save]"));
  await waitFor(() => !t.document.querySelector(".add-popup"), 2000, "popup closes");
  const page = await openPage(t, "Essentials", "Smoke Test Site");
  const link = [...page.querySelectorAll("a")].find((a) => text(a).includes("Smoke Test Site"));
  assert.equal(link.getAttribute("href"), "https://smoke.example.com", "https:// is added");
  assert.deepEqual(t.errors, []);
});

test("a new group can be made in the popup; a name already on the page is refused", async () => {
  const t = await openNewTab();
  const p = await openPopup(t);
  fill(t.window, field(p, "name"), "Payroll");
  fill(t.window, field(p, "url"), "https://pay.example.com");
  await chooseGroup(t, p, "New group…");
  assert.ok(!field(p, "newGroup").closest("[hidden]"), "the group name field shows");
  fill(t.window, field(p, "newGroup"), "productivity");
  click(t.window, p.querySelector("[data-add-save]"));
  await settle(t.window, 100);
  assert.match(errorFor(p, "newGroup"), /already exists/);
  assert.ok(t.document.querySelector(".add-popup"), "still open");

  fill(t.window, field(p, "newGroup"), "work");
  click(t.window, p.querySelector("[data-add-save]"));
  await waitFor(() => !t.document.querySelector(".add-popup"), 2000, "popup closes");
  const page = await openPage(t, "Essentials", "Payroll");
  assert.ok(text(page).includes("WORK"), "the new group, in capitals");
});

test("a missing name or URL says why and saves nothing", async () => {
  const t = await openNewTab();
  const p = await openPopup(t);
  click(t.window, p.querySelector("[data-add-save]"));
  await settle(t.window, 100);
  assert.match(errorFor(p, "name"), /name/i);
  assert.match(errorFor(p, "url"), /URL/);
  assert.ok(t.document.querySelector(".add-popup"), "still open");
  fill(t.window, field(p, "name"), "x");
  assert.equal(errorFor(p, "name"), "", "typing clears the message");
});

test("Page mode makes a page with its subtitle and opens it; a bad subtitle is refused", async () => {
  const t = await openNewTab();
  const p = await openPopup(t);
  click(t.window, p.querySelector('[data-add-mode="page"]'));
  assert.ok(field(p, "pageName") && field(p, "sub"), "page fields");
  assert.ok(field(p, "url").closest("[hidden]"), "bookmark fields hidden");
  fill(t.window, field(p, "pageName"), "Gym");
  fill(t.window, field(p, "sub"), "Lifting");
  assert.match(text(p.querySelector(".add-popup-count")), /1 of 3-5 words/);
  click(t.window, p.querySelector("[data-add-save]"));
  await settle(t.window, 100);
  assert.match(errorFor(p, "sub"), /at least 3 words/);
  assert.equal(plain((await t.chrome.storage.sync.get(["activeTabs"])).activeTabs).length, 3, "no page yet");

  fill(t.window, field(p, "sub"), "Workouts and meal plans");
  click(t.window, p.querySelector("[data-add-save]"));
  await waitFor(() => !t.document.querySelector(".add-popup"), 2000, "popup closes");
  const pages = plain((await t.chrome.storage.sync.get(["activeTabs"])).activeTabs);
  assert.deepEqual([pages.length, pages[3].label, pages[3].sub], [4, "Gym", "Workouts and meal plans"]);
  assert.equal(text(t.document.querySelector(".switcher-label")), "Gym", "the new page opens");
  assert.deepEqual(t.errors, []);
});

test("Cancel, Escape and the backdrop all close it without saving", async () => {
  const t = await openNewTab();
  const before = JSON.stringify(plain(await t.chrome.storage.sync.get(["activeTabs"])));
  for (const how of ["cancel", "escape", "backdrop"]) {
    const p = await openPopup(t);
    fill(t.window, field(p, "name"), "Not saved");
    if (how === "cancel") click(t.window, p.querySelector("[data-add-cancel]"));
    if (how === "escape") t.document.dispatchEvent(new t.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    if (how === "backdrop") p.dispatchEvent(new t.window.MouseEvent("click", { bubbles: true }));
    await waitFor(() => !t.document.querySelector(".add-popup"), 2000, `${how} closes`);
  }
  assert.equal(JSON.stringify(plain(await t.chrome.storage.sync.get(["activeTabs"]))), before);
});
