// The Settings page: every control saves at once, changes from other tabs show
// up live, UI scale works, and switching profile does not reload the page.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { openNewTab, closeAll, waitFor, settle, click } = require("./helpers/newtabDom");

test.afterEach(closeAll);

const text = (el) => (el ? el.textContent.replace(/\s+/g, " ").trim() : "");
const plain = (v) => JSON.parse(JSON.stringify(v));

async function openSettingsAt(t, pageId) {
  const { window: win, document: doc } = t;
  click(win, doc.getElementById("global-settings-btn"));
  const nav = await waitFor(() => doc.querySelector(`#sp-nav [data-page="${pageId}"]`), 2000, `${pageId} in the menu`);
  click(win, nav);
  await waitFor(() => doc.querySelector("#sp-content .sp-page-title"), 2000, "page title");
  return doc.getElementById("sp-content");
}

async function pick(t, key, label) {
  const { window: win, document: doc } = t;
  click(win, doc.querySelector(`#sp-content [data-select="${key}"]`));
  const item = [...doc.querySelectorAll("#sp-menu .sp-menu-item")].find((li) => text(li) === label);
  assert.ok(item, `"${label}" is offered for ${key}`);
  click(win, item);
  await settle(win, 50);
}

async function stored(t, key) {
  return plain(await t.chrome.storage.sync.get([key]))[key];
}

test("a toggle saves at once, with no Save button", async () => {
  const t = await openNewTab();
  const content = await openSettingsAt(t, "focus");
  click(t.window, content.querySelector('[data-toggle="grayscale"]'));
  await settle(t.window, 50);
  assert.equal(await stored(t, "grayscale"), true, "saved without leaving Settings");
  assert.ok(t.document.documentElement.classList.contains("grayscale"));
  assert.equal(t.document.getElementById("save-settings"), null, "no Save button any more");
  click(t.window, t.document.getElementById("sp-back"));
  assert.ok(t.document.getElementById("sp-root").hidden, "Back to dashboard closes");
  assert.ok(t.document.documentElement.classList.contains("grayscale"), "still on after closing");
  assert.deepEqual(t.errors, []);
});

test("Search has no search bar setting any more: the address bar searches", async () => {
  const t = await openNewTab();
  const content = await openSettingsAt(t, "search");
  assert.equal(content.querySelector('[data-toggle="spotlight"]'), null);
  assert.ok(!/Search bar/.test(text(content)), "no Search bar row");
  assert.match(text(content), /Which engine the address bar starts with/);
});

test("a change saved in another tab shows up live", async () => {
  const t = await openNewTab();
  await t.chrome.storage.sync.set({ grayscale: true });
  await settle(t.window, 50);
  assert.ok(t.document.documentElement.classList.contains("grayscale"));
  await t.chrome.storage.sync.remove("grayscale");
  await settle(t.window, 50);
  assert.ok(!t.document.documentElement.classList.contains("grayscale"), "removed key = default (off)");
});

test("UI scale applies, saves, and the first-paint cache matches storage", async () => {
  const t = await openNewTab();
  const content = await openSettingsAt(t, "appearance");
  assert.ok(content.querySelector(".sp-scale-sample"), "Settings shows a size sample");
  await pick(t, "scale", "125%");
  assert.equal(await stored(t, "uiScale"), 1.25);
  assert.equal(t.document.body.style.zoom, "1.25", "the new tab is zoomed");
  assert.equal(t.window.localStorage.getItem("_scaleCache"), "1.25");
  assert.equal(t.document.getElementById("sp-root").style.zoom, "0.8", "Settings itself stays at 100%");
  await waitFor(() => t.document.querySelector('.sp-scale-sample[style*="zoom:1.25"], .sp-scale-sample[style*="zoom: 1.25"]'), 2000, "sample at 125%");
});

test("a stored UI scale is applied when a new tab opens", async () => {
  const t = await openNewTab({ sync: { uiScale: 0.9 } });
  assert.equal(t.document.body.style.zoom, "0.9");
  assert.equal(t.window.localStorage.getItem("_scaleCache"), "0.9");
});

test("search, theme and focus choices each save at once", async () => {
  const t = await openNewTab();
  await openSettingsAt(t, "search");
  await pick(t, "engine", "Always reset to default");
  await pick(t, "pills", "When typing ./");
  assert.equal(await stored(t, "searchEngineBehavior"), "always-default");
  assert.equal(await stored(t, "bookmarkPillBehavior"), "prefix");

  const appearance = await openSettingsAt(t, "appearance");
  click(t.window, appearance.querySelector('[data-mode="light"]'));
  await settle(t.window, 50);
  assert.equal((await stored(t, "Theme")).Theme, "light");
  assert.equal(t.document.documentElement.dataset.theme, "light");

  const focus = await openSettingsAt(t, "focus");
  await pick(t, "method", "Close a random tab");
  assert.equal(await stored(t, "managementMethod"), "random");
  click(t.window, focus.querySelector('[data-toggle="showQuery"]'));
  click(t.window, t.document.querySelector('#sp-content [data-toggle="grayscale"]'));
  await settle(t.window, 50);
  assert.equal(await stored(t, "showQueryOnDelay"), false);
  assert.equal(await stored(t, "grayscale"), true);
  assert.ok(t.document.documentElement.classList.contains("grayscale"));
  assert.deepEqual(t.errors, []);
});

test("a lower tab limit applies now; a higher one waits 30 minutes", async () => {
  const t = await openNewTab({ sync: { tabLimit: 6 } });
  await openSettingsAt(t, "focus");
  await pick(t, "limit", "3");
  assert.equal(await stored(t, "tabLimit"), 3, "decrease is immediate");
  await pick(t, "limit", "8");
  assert.equal(await stored(t, "tabLimit"), 3, "increase does not apply yet");
  assert.equal((await stored(t, "pendingIncrease")).targetLimit, 8);
  await waitFor(() => /Queued: 8 in 30m|Queued: 8 in 29m/.test(text(t.document.getElementById("sp-content"))), 2000, "queued note");
});

test("a longer search delay applies now; a shorter one waits", async () => {
  const t = await openNewTab();
  await openSettingsAt(t, "focus");
  await pick(t, "delay", "30 seconds");
  assert.equal(await stored(t, "searchDelaySeconds"), 30);
  await pick(t, "delay", "15 seconds");
  assert.equal(await stored(t, "searchDelaySeconds"), 30, "decrease does not apply yet");
  assert.equal((await stored(t, "pendingDelayDecrease")).targetDelay, 15);
  await waitFor(() => /Queued: 15s in/.test(text(t.document.getElementById("sp-content"))), 2000, "queued note");
});

test("Escape closes Settings, and ?settings=focus opens it on Focus", async () => {
  const t = await openNewTab();
  click(t.window, t.document.getElementById("global-settings-btn"));
  await settle(t.window, 20);
  t.document.dispatchEvent(new t.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  assert.ok(t.document.getElementById("sp-root").hidden);

  const u = await openNewTab({ query: "?settings=focus" });
  await waitFor(() => !u.document.getElementById("sp-root").hidden, 2000, "settings open from the URL");
  assert.equal(text(u.document.querySelector("#sp-content .sp-page-title")), "Focus");
  u.window.dispatchEvent(new u.window.Event("pageshow"));
  await settle(u.window, 50);
  assert.deepEqual(u.errors, [], "pageshow with ?settings no longer throws");
});

test("switching profile swaps settings in place, without reloading", async () => {
  const profiles = {
    v: 2, active: "personal", owner: "personal",
    share: { bookmarks: true, theme: true, appearance: true, search: true, focus: false },
    list: [
      { id: "personal", name: "Pat", label: "Personal", color: 0, icon: "", db: "", settings: {} },
      { id: "school", name: "Pat (School)", label: "School", color: 1, icon: "", db: "", settings: { grayscale: true } },
    ],
  };
  const t = await openNewTab({ local: { atlasProfilesV2: profiles } });
  const content = await openSettingsAt(t, "profiles");
  assert.ok(!t.document.documentElement.classList.contains("grayscale"));
  click(t.window, await waitFor(() => content.querySelector('[data-pf-switch="school"]'), 2000, "Switch button"));
  await waitFor(() => t.document.documentElement.classList.contains("grayscale"), 3000, "school's grayscale setting");
  await settle(t.window, 200);
  assert.equal(t.window.__navigations, undefined, "no reload");
  assert.ok(!t.document.getElementById("sp-root").hidden, "Settings stays open");
  assert.equal(text(t.document.querySelector("#sp-content .sp-page-title")), "Profiles");
  assert.equal((await t.chrome.storage.local.get(["atlasProfilesV2"])).atlasProfilesV2.active, "school");
  assert.deepEqual(t.errors, []);
});

test("switching to a profile with its own bookmarks swaps the database in place", async () => {
  const profiles = {
    v: 2, active: "personal", owner: "personal",
    share: { bookmarks: false, theme: true, appearance: true, search: true, focus: true },
    list: [
      { id: "personal", name: "Pat", label: "", color: 0, icon: "", db: "DetractlessBookmarks", settings: {} },
      { id: "school", name: "Pat (School)", label: "", color: 1, icon: "", db: "DetractlessBookmarks-school",
        settings: { activeTabs: [{ id: "search", label: "Home", type: "search" }, { id: 77, label: "Classes", type: "bookmarks" }] } },
    ],
  };
  const t = await openNewTab({ local: { atlasProfilesV2: profiles } });
  const labels = () => [...t.document.querySelectorAll("#tabs-container .switcher-item .label")].map((li) => li.firstChild.textContent);
  assert.deepEqual(labels(), ["Dashboard", "Essentials", "Ai tools"]);
  const content = await openSettingsAt(t, "profiles");
  click(t.window, await waitFor(() => content.querySelector('[data-pf-switch="school"]'), 2000, "Switch button"));
  await waitFor(() => labels().join() === "Dashboard,Classes", 3000, "school's pages");
  await settle(t.window, 200);
  assert.equal(t.window.__navigations, undefined, "no reload");

  const back = await waitFor(() => t.document.querySelector('#sp-content [data-pf-switch="personal"]'), 2000, "Switch back");
  click(t.window, back);
  await waitFor(() => labels().join() === "Dashboard,Essentials,Ai tools", 3000, "personal pages again");
  click(t.window, t.document.getElementById("sp-back"));
  click(t.window, t.document.querySelector(".switcher-btn"));
  click(t.window, [...t.document.querySelectorAll(".switcher-item")].find((li) => li.textContent.includes("Essentials")));
  await waitFor(() => text(t.document.getElementById("bookmarks-page")).includes("Notion"), 3000, "personal bookmarks");
  assert.deepEqual(t.errors, []);
});
