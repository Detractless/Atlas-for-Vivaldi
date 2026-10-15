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
  click(t.window, content.querySelector('[data-toggle="showQuery"]'));
  await settle(t.window, 50);
  assert.equal(await stored(t, "showQueryOnDelay"), false, "saved without leaving Settings");
  assert.equal(t.document.getElementById("save-settings"), null, "no Save button any more");
  click(t.window, t.document.getElementById("sp-back"));
  assert.ok(t.document.getElementById("sp-root").hidden, "Back to dashboard closes");
  assert.equal(await stored(t, "showQueryOnDelay"), false, "still saved after closing");
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
  const content = await openSettingsAt(t, "focus");
  const slider = content.querySelector('[data-slider="saturation"]');
  await t.chrome.storage.sync.set({ saturation: 40 });
  await settle(t.window, 50);
  assert.equal(slider.value, "40", "the slider follows, and is the same slider");
  assert.equal(text(content.querySelector(".sp-slider-val")), "40%");
  await t.chrome.storage.sync.remove("saturation");
  await settle(t.window, 50);
  assert.equal(slider.value, "100", "removed key = default (full color)");
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
  click(t.window, t.document.querySelector('#sp-content [data-select="pills"]'));
  assert.deepEqual([...t.document.querySelectorAll("#sp-menu .sp-menu-item")].map(text), ["When typing ./", "Always", "Never"], "Never comes after Always");
  click(t.window, [...t.document.querySelectorAll("#sp-menu .sp-menu-item")].find((li) => text(li) === "Never"));
  await settle(t.window, 50);
  assert.equal(await stored(t, "bookmarkPillBehavior"), "never");

  const appearance = await openSettingsAt(t, "appearance");
  click(t.window, appearance.querySelector('[data-mode="light"]'));
  await settle(t.window, 50);
  assert.equal((await stored(t, "Theme")).Theme, "light");
  assert.equal(t.document.documentElement.dataset.theme, "light");

  const focus = await openSettingsAt(t, "focus");
  await pick(t, "method", "Close a random tab");
  assert.equal(await stored(t, "managementMethod"), "random");
  click(t.window, focus.querySelector('[data-toggle="showQuery"]'));
  await settle(t.window, 50);
  assert.equal(await stored(t, "showQueryOnDelay"), false);
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
      { id: "school", name: "Pat (School)", label: "School", color: 1, icon: "", db: "", settings: { saturation: 20 } },
    ],
  };
  const t = await openNewTab({ local: { atlasProfilesV2: profiles } });
  const content = await openSettingsAt(t, "profiles");
  assert.notEqual(t.chrome.storage.sync._data.saturation, 20);
  click(t.window, await waitFor(() => content.querySelector('[data-pf-switch="school"]'), 2000, "Switch button"));
  await waitFor(() => t.chrome.storage.sync._data.saturation === 20, 3000, "school's color level");
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

test("dragging a slider keeps the same slider under the cursor", async () => {
  const t = await openNewTab();
  const content = await openSettingsAt(t, "focus");
  const slider = content.querySelector('[data-slider="saturation"]');
  assert.ok(slider, "the saturation slider is on the Focus page");
  slider.focus();
  for (const v of ["80", "60", "40"]) {
    slider.value = v;
    slider.dispatchEvent(new t.window.Event("input", { bubbles: true }));
    await settle(t.window, 50);
    assert.ok(content.contains(slider), `still the same slider after moving to ${v}`);
  }
  assert.equal(t.document.activeElement, slider, "the slider keeps focus mid-drag");
  assert.equal(text(slider.closest(".sp-slider-wrap").querySelector(".sp-slider-val")), "40%");
  slider.dispatchEvent(new t.window.Event("change", { bubbles: true }));   // let go: saved at once
  await settle(t.window, 80);
  assert.equal(await stored(t, "saturation"), 40, "saved");
  assert.ok(content.contains(slider), "still the same slider after the save and the lock came back");
  assert.deepEqual(t.errors, []);
});

const drag = async (t, slider, v) => {
  slider.value = String(v);
  slider.dispatchEvent(new t.window.Event("input", { bubbles: true }));
  slider.dispatchEvent(new t.window.Event("change", { bubbles: true }));
  await settle(t.window, 80);
};

test("nothing locks by itself; pressing the lock holds the level so it can go grayer but not back", async () => {
  const t = await openNewTab();
  const content = await openSettingsAt(t, "focus");
  const slider = content.querySelector('[data-slider="saturation"]');
  const btn = content.querySelector("[data-lockbtn]");
  assert.equal(content.querySelector("[data-lockzone], .sp-lockzone"), null, "no stripes or lock drawn on the slider");
  assert.match(text(content), /Lock it to stop going back to color for 30 minutes\./);
  await drag(t, slider, 40);
  assert.equal(await stored(t, "saturation"), 40);
  assert.ok(!(await stored(t, "saturationLock")), "dragging does not lock anything");
  await drag(t, slider, 70);
  assert.equal(await stored(t, "saturation"), 70, "it moves freely both ways");
  await drag(t, slider, 40);

  click(t.window, btn);
  await settle(t.window, 80);
  const lock = await stored(t, "saturationLock");
  assert.deepEqual([lock.ceiling, lock.manual], [40, true]);
  assert.ok(Math.abs(lock.until - Date.now() - 30 * 60 * 1000) < 5000, "30 minutes from the press");
  assert.ok(btn.classList.contains("on") && btn.disabled, "the lock is closed, and cannot be pressed off");
  assert.match(text(content.querySelector("[data-lockcount]")), /^(30:00|29:5\d)$/);
  assert.match(text(content), /Locked\. You can go grayer, but not back above 40% until /);

  await drag(t, slider, 70);                       // back up: the thumb stops at the lock
  assert.equal(slider.value, "40");
  assert.equal(await stored(t, "saturation"), 40);
  await drag(t, slider, 25);                       // grayer: allowed, and the ceiling follows
  assert.equal(await stored(t, "saturation"), 25);
  const lower = await stored(t, "saturationLock");
  assert.equal(lower.ceiling, 25);
  assert.equal(lower.until, lock.until, "the 30 minutes were not restarted");
  assert.ok(content.contains(slider) && content.contains(btn), "nothing was replaced");

  await t.chrome.storage.sync.set({ saturationLock: { ceiling: 25, until: Date.now() - 1000, manual: true } });   // the time is up
  await settle(t.window, 1100);
  assert.ok(!btn.classList.contains("on") && !btn.disabled, "the lock is open again");
  assert.match(text(content), /Lock it to stop going back to color/);
  await drag(t, slider, 100);
  assert.equal(await stored(t, "saturation"), 100, "full color again once the lock is over");
  assert.deepEqual(t.errors, []);
});

test("an automatic lock saved by the earlier version does not hold, and is cleared", async () => {
  const t = await openNewTab({ sync: { saturation: 40, saturationLock: { ceiling: 40, until: Date.now() + 20 * 60 * 1000 } } });
  const content = await openSettingsAt(t, "focus");
  const slider = content.querySelector('[data-slider="saturation"]');
  assert.ok(!content.querySelector("[data-lockbtn]").disabled);
  await drag(t, slider, 80);
  assert.equal(await stored(t, "saturation"), 80);
  assert.equal(await stored(t, "saturationLock"), null, "the old lock is gone");
});

test("the Grayscale switch is gone from Focus", async () => {
  const t = await openNewTab();
  const content = await openSettingsAt(t, "focus");
  assert.equal(content.querySelector('[data-toggle="grayscale"]'), null);
  assert.ok(!/Grayscale/.test(text(content)));
  assert.equal(content.querySelector('[data-slider="saturation"]').value, "100", "the slider starts at full color");
});

test("the side menu heading above Profile, Search and Pages says General", async () => {
  const t = await openNewTab();
  await openSettingsAt(t, "focus");
  const labels = [...t.document.querySelectorAll("#sp-nav .sp-group-label")].map(text);
  assert.equal(labels[0], "General");
  assert.ok(!labels.includes("Settings"));
});

test("the lock button's rules beat '#sp-root button { color: inherit }', or a locked button's icon matches its fill", () => {
  const css = require("fs").readFileSync(require("path").join(__dirname, "..", "..", "payload", "detractless", "src", "pages", "newtab", "settingsPage.css"), "utf8");
  const rule = (needle) => (css.split("\n").find((l) => l.includes(needle)) || "").trim();
  assert.match(rule(".sp-lockbtn.on"), /^#sp-root \.sp-lockbtn\.on/, "the locked look is under #sp-root");
  assert.match(rule(".sp-lockbtn.on"), /color: var\(--sp-accent-text\)/, "with the icon in the text-on-accent color");
  assert.match(rule(".sp-lockbtn {"), /^#sp-root \.sp-lockbtn/);
  assert.match(rule(".sp-seg-btn {"), /^#sp-root \.sp-seg-btn/, "and so are the Usage time-span buttons");
});
