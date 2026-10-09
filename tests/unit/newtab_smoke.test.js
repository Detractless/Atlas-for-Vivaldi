// Behavior smoke test for the new tab: the real index.html and bundle in jsdom.
// Every cleanup phase must keep these green.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { openNewTab, closeAll, waitFor, settle, click } = require("./helpers/newtabDom");

test.afterEach(closeAll);

const text = (el) => (el ? el.textContent.replace(/\s+/g, " ").trim() : "");
const switcherLabels = (doc) =>
  [...doc.querySelectorAll("#tabs-container .switcher-item .label")].map((li) => li.firstChild.textContent);

test("search bar renders on a fresh new tab", async () => {
  const t = await openNewTab();
  const doc = t.document;
  assert.ok(doc.getElementById("search-input"), "search input exists");
  const page = doc.getElementById("search-page");
  assert.ok(page.classList.contains("active"), "search page is showing");
  assert.ok(!page.classList.contains("hide-spotlight"), "search bar is not hidden");
  assert.deepEqual(t.errors, []);
  t.window.close();
});

test("a stored 'search bar off' hides the search bar", async () => {
  const t = await openNewTab({ sync: { spotlightVisible: false } });
  assert.ok(t.document.getElementById("search-page").classList.contains("hide-spotlight"));
  assert.deepEqual(t.errors, []);
  t.window.close();
});

test("page tabs render, starter pages included", async () => {
  const t = await openNewTab();
  const labels = switcherLabels(t.document);
  assert.deepEqual(labels, ["Dashboard", "Essentials", "Ai tools"]);
  const stored = await t.chrome.storage.sync.get(["activeTabs"]);
  assert.equal(stored.activeTabs.length, 3, "pages are saved to chrome.storage.sync");
  assert.deepEqual(t.errors, []);
  t.window.close();
});

test("a bookmark can be added through the + popup", async () => {
  const t = await openNewTab();
  const { window: win, document: doc } = t;
  click(win, doc.getElementById("global-add-btn"));
  const p = await waitFor(() => doc.querySelector(".add-popup"), 2000, "add popup");
  const set = (name, value) => {
    const el = p.querySelector(`[data-field="${name}"]`);
    el.value = value;
    el.dispatchEvent(new win.Event("change", { bubbles: true }));
  };
  set("name", "Smoke Test Site");
  set("url", "https://smoke.example.com");
  const essentials = [...p.querySelector('[data-field="page"]').options].find((o) => o.textContent === "Essentials");
  set("page", essentials.value);
  await waitFor(() => [...p.querySelector('[data-field="group"]').options].some((o) => o.textContent === "PRODUCTIVITY"), 2000, "groups");
  set("group", "PRODUCTIVITY");
  click(win, p.querySelector("[data-add-save]"));
  await settle(win, 300);

  // Open the Essentials page and look for the new bookmark.
  click(win, doc.querySelector(".switcher-btn"));
  const item = [...doc.querySelectorAll(".switcher-item")].find((li) => li.textContent.includes("Essentials"));
  click(win, item);
  await waitFor(
    () => doc.getElementById("bookmarks-page").textContent.includes("Smoke Test Site"),
    3000, "new bookmark on the Essentials page"
  );
  assert.ok(doc.getElementById("bookmarks-page").classList.contains("active"));
  assert.deepEqual(t.errors, []);
  win.close();
});

test("Settings opens from the settings button", async () => {
  const t = await openNewTab();
  const { window: win, document: doc } = t;
  click(win, doc.getElementById("global-settings-btn"));
  const root = await waitFor(() => {
    const r = doc.getElementById("sp-root");
    return r && !r.hidden ? r : null;
  }, 3000, "settings page");
  // Settings opens on its first page, Profiles.
  await waitFor(() => text(doc.getElementById("sp-content")).includes("Your profiles"), 3000, "settings content");
  assert.ok(text(root.querySelector("#sp-nav")).includes("Appearance"));
  await settle(win, 800);
  assert.deepEqual(t.errors, []);
  win.close();
});
