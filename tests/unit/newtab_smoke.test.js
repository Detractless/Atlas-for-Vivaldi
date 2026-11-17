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

test("the new tab has no search bar: the address bar searches", async () => {
  const t = await openNewTab();
  assert.equal(t.document.getElementById("search-page"), null, "no search page in the DOM");
  assert.equal(t.document.getElementById("search-input"), null, "no search box in the DOM");
  assert.ok(t.document.getElementById("home-page").classList.contains("active"), "empty Home is showing");
  assert.ok(!t.document.getElementById("bookmarks-page").classList.contains("active"), "and no bookmarks page is");
  await settle(t.window, 200);
  assert.equal(t.document.activeElement.tagName, "BODY", "nothing takes typing on load");
  assert.deepEqual(t.errors, []);
  t.window.close();
});

test("a saved 'search bar on' shows nothing and stays saved as it was", async () => {
  const t = await openNewTab({ sync: { spotlightVisible: true } });
  assert.equal(t.document.getElementById("search-page"), null);
  assert.ok(t.document.getElementById("home-page").classList.contains("active"));
  assert.ok(!t.document.getElementById("bookmarks-page").classList.contains("active"));
  assert.equal((await t.chrome.storage.sync.get(["spotlightVisible"])).spotlightVisible, true, "user data untouched");
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
    el.dispatchEvent(new win.Event("input", { bubbles: true }));
  };
  set("url", "https://smoke.example.com");
  click(win, p.querySelector("[data-add-next]"));
  await settle(win, 40);
  set("name", "Smoke Test Site");
  await waitFor(() => [...p.querySelectorAll('[data-dd-item="group"]')].some((i) => i.textContent.startsWith("PRODUCTIVITY")), 2000, "groups");
  click(win, p.querySelector('[data-dd="group"]'));
  click(win, [...p.querySelectorAll('[data-dd-item="group"]')].find((i) => i.textContent.startsWith("PRODUCTIVITY")));
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
