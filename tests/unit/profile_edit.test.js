// Settings > Profiles and each profile's edit page (profilesPage.js,
// profileEditPage.js). The list is read-only with an Edit button per profile;
// the edit page holds the image, name, label and Delete.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { openNewTab, closeAll, waitFor, settle, click } = require("./helpers/newtabDom");
const { menuRoot, menuLabels, pickMenu } = require("./helpers/atlasMenu");

test.afterEach(closeAll);

const text = (el) => (el ? el.textContent.replace(/\s+/g, " ").trim() : "");
const plain = (v) => JSON.parse(JSON.stringify(v));
const ICON = "data:image/png;base64,iVBORw0KGgo=";

function profiles(active = "personal") {
  return {
    v: 2, active, owner: active,
    share: { bookmarks: true, theme: true, appearance: true, search: true, focus: true },
    list: [
      { id: "personal", name: "Pat", label: "Personal", color: 0, icon: ICON, db: "", settings: {} },
      { id: "school", name: "Pat (School)", label: "School", color: 1, icon: "", db: "", settings: {} },
    ],
  };
}

async function openProfiles(state = profiles()) {
  const t = await openNewTab({ local: { atlasProfilesV2: state } });
  const { window: win, document: doc } = t;
  click(win, doc.getElementById("global-settings-btn"));
  click(win, await waitFor(() => doc.querySelector('#sp-nav [data-page="profiles"]'), 2000, "Profiles in the menu"));
  await waitFor(() => doc.querySelector('#sp-content [data-pf-switch="school"]'), 2000, "profile rows");
  return t;
}

const content = (t) => t.document.getElementById("sp-content");
const title = (t) => text(t.document.querySelector("#sp-content .sp-page-title"));
const storedProfile = async (t, id) => plain((await t.chrome.storage.local.get(["atlasProfilesV2"])).atlasProfilesV2).list.find((p) => p.id === id);

/** Right-click a profile to open its menu. */
function rightClick(t, id) {
  content(t).querySelector(`[data-pf-switch="${id}"]`).dispatchEvent(new t.window.MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 40, clientY: 20 }));
}

/** A profile's right-click menu, then one of its items. */
async function fromMenu(t, id, label) {
  rightClick(t, id);
  await waitFor(() => menuLabels(t.document).includes(label), 2000, `${label} in the menu`);
  pickMenu(t.window, t.document, label);
}

async function edit(t, id) {
  await fromMenu(t, id, "Edit");
  await waitFor(() => content(t).querySelector("[data-pfe-name]"), 2000, "edit page");
}

function change(t, el, value) {
  el.value = value;
  el.dispatchEvent(new t.window.Event("change", { bubbles: true }));
}

test("the profile list is read-only: no ⋮, Switch or Edit buttons, no Current badge", async () => {
  const t = await openProfiles();
  assert.equal(content(t).querySelectorAll(".pf-input").length, 0, "no text boxes in the list");
  const rows = [...content(t).querySelectorAll(".pf-row")];
  assert.deepEqual(rows.map((r) => text(r.querySelector(".pf-name"))), ["Pat", "Pat (School)"]);
  assert.deepEqual(rows.map((r) => text(r.querySelector(".pf-label"))), ["Personal", "School"]);
  assert.equal(content(t).querySelector("[data-pf-menu], .pf-row .sp-kebab"), null, "no ⋮ buttons");
  assert.equal(content(t).querySelector(".pf-badge"), null, "no Current badge");
  assert.ok(![...content(t).querySelectorAll(".pf-row button")].some((b) => /^(Switch|Edit)$/.test(text(b))), "no Switch or Edit buttons");
  assert.deepEqual(t.errors, []);
});

test("clicking a profile switches to it; the active one is highlighted and nothing moves", async () => {
  const t = await openProfiles();
  const pick = (id) => content(t).querySelector(`[data-pf-switch="${id}"]`);
  assert.equal(pick("personal").getAttribute("aria-pressed"), "true", "the active profile is marked");
  assert.equal(pick("school").getAttribute("aria-pressed"), "false");
  click(t.window, pick("school"));
  await settle(t.window, 300);
  const state = plain((await t.chrome.storage.local.get(["atlasProfilesV2"])).atlasProfilesV2);
  assert.equal(state.active, "school");
  assert.equal(pick("school").getAttribute("aria-pressed"), "true", "the mark moves");
  assert.equal(pick("personal").getAttribute("aria-pressed"), "false");
  assert.deepEqual([...content(t).querySelectorAll(".pf-row .pf-name")].map(text), ["Pat", "Pat (School)"], "same order");
});

test("right-clicking a profile opens a menu with Edit and Delete; the menu key does too", async () => {
  const t = await openProfiles();
  rightClick(t, "school");
  await waitFor(() => menuLabels(t.document).length, 2000, "menu");
  assert.deepEqual(menuLabels(t.document), ["Edit", "Delete"]);
  t.document.body.dispatchEvent(new t.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
  await settle(t.window, 30);
  const pick = content(t).querySelector('[data-pf-switch="personal"]');
  pick.focus();
  pick.dispatchEvent(new t.window.KeyboardEvent("keydown", { key: "ContextMenu", bubbles: true, cancelable: true }));
  await waitFor(() => menuLabels(t.document).length, 2000, "menu from the keyboard");
  const root = menuRoot(t.document);
  assert.equal(root.activeElement, root.querySelector(".mi"), "the keyboard is in the menu");
  // A real key press crosses out of the menu's shadow root (composed), as here.
  root.activeElement.dispatchEvent(new t.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true, composed: true }));
  await waitFor(() => content(t).querySelector("[data-pfe-name]"), 2000, "Enter on Edit opens the edit page");
});

test("the profile menu is Atlas's own right-click menu: pointer, sizes, no colored items", async () => {
  const t = await openProfiles();
  rightClick(t, "school");
  await waitFor(() => menuLabels(t.document).length, 2000, "menu");
  const host = t.document.querySelector("atlas-ctx");
  assert.equal(host.parentNode, t.document.body, "drawn over the page, not inside Settings");
  assert.ok(menuRoot(t.document).querySelector("svg.tail"), "with its pointer");
  assert.equal(content(t).querySelector(".sp-popmenu"), null, "not the old Settings popup");
  assert.ok(![...menuRoot(t.document).querySelectorAll(".mi")].some((r) => r.className.includes("danger")), "no colored Delete");
});

test("Delete in the right-click menu asks first, right in the list", async () => {
  const t = await openProfiles();
  await fromMenu(t, "school", "Delete");
  await settle(t.window, 50);
  assert.match(text(content(t)), /Delete Pat \(School\)\?/);
  click(t.window, content(t).querySelector("[data-pf-cancel]"));
  await settle(t.window, 50);
  assert.ok(await storedProfile(t, "school"), "Cancel keeps it");
  await fromMenu(t, "school", "Delete");
  await settle(t.window, 50);
  click(t.window, content(t).querySelector('[data-pf-delete-go="school"]'));
  await settle(t.window, 200);
  assert.equal(await storedProfile(t, "school"), undefined, "deleted");
  assert.equal(content(t).querySelectorAll(".pf-row").length, 1);
});

test("the right-click menu closes on Escape without closing Settings, and on a click elsewhere", async () => {
  const t = await openProfiles();
  rightClick(t, "school");
  await waitFor(() => menuLabels(t.document).length, 2000, "menu");
  t.document.body.dispatchEvent(new t.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
  await settle(t.window, 30);
  assert.deepEqual(menuLabels(t.document), []);
  assert.ok(!t.document.getElementById("sp-root").hidden);
  rightClick(t, "school");
  await waitFor(() => menuLabels(t.document).length, 2000, "menu again");
  content(t).querySelector(".sp-page-title").dispatchEvent(new t.window.MouseEvent("mousedown", { bubbles: true }));
  await settle(t.window, 30);
  assert.deepEqual(menuLabels(t.document), [], "a click elsewhere closes it");
  assert.equal((await t.chrome.storage.local.get(["atlasProfilesV2"])).atlasProfilesV2.active, "personal", "right-clicking didn't switch");
});

test("Edit opens a page of its own: titled with the name, not in the side list, Back returns", async () => {
  const t = await openProfiles();
  await edit(t, "school");
  assert.equal(title(t), "Pat (School)");
  assert.equal(t.document.querySelector('#sp-nav [data-page="profile"]'), null, "hidden from the side list");
  assert.ok(t.document.querySelector('#sp-nav [data-page="profiles"][aria-current="page"]'), "Profiles stays marked");
  click(t.window, content(t).querySelector("[data-back]"));
  await waitFor(() => title(t) === "Profiles", 2000, "back on Profiles");
});

test("name and label save at once, and the list follows", async () => {
  const t = await openProfiles();
  await edit(t, "school");
  change(t, content(t).querySelector("[data-pfe-name]"), "Pat at KSU");
  change(t, content(t).querySelector("[data-pfe-label]"), "College");
  await settle(t.window, 100);
  const p = await storedProfile(t, "school");
  assert.deepEqual([p.name, p.label], ["Pat at KSU", "College"]);
  assert.equal(title(t), "Pat at KSU", "the page title follows");
  click(t.window, content(t).querySelector("[data-back]"));
  await waitFor(() => title(t) === "Profiles", 2000, "back on Profiles");
  assert.ok(text(content(t)).includes("Pat at KSU"));
});

test("the image can be changed or removed on the edit page", async () => {
  const t = await openProfiles();
  await edit(t, "personal");
  assert.ok(content(t).querySelector('[data-pfe-icon="personal"]'), "Choose image");
  click(t.window, content(t).querySelector('[data-pfe-clear-icon="personal"]'));
  await settle(t.window, 100);
  assert.equal((await storedProfile(t, "personal")).icon, "");
  assert.equal(content(t).querySelector('[data-pfe-clear-icon="personal"]'), null, "nothing left to remove");
});

test("Delete asks first; deleting the active profile switches to the other and returns to the list", async () => {
  const t = await openProfiles();
  await edit(t, "personal");
  click(t.window, content(t).querySelector('[data-pfe-delete="personal"]'));
  await settle(t.window, 50);
  assert.match(text(content(t)), /Delete Pat\?/);
  click(t.window, content(t).querySelector("[data-pfe-delete-cancel]"));
  await settle(t.window, 50);
  assert.ok(await storedProfile(t, "personal"), "Cancel keeps it");

  click(t.window, content(t).querySelector('[data-pfe-delete="personal"]'));
  await settle(t.window, 50);
  click(t.window, content(t).querySelector('[data-pfe-delete-go="personal"]'));
  await waitFor(() => title(t) === "Profiles", 3000, "back on Profiles");
  const state = plain((await t.chrome.storage.local.get(["atlasProfilesV2"])).atlasProfilesV2);
  assert.deepEqual(state.list.map((p) => p.id), ["school"]);
  assert.equal(state.active, "school");
});

test("the last profile can't be deleted", async () => {
  const one = profiles();
  one.list = one.list.slice(0, 1);
  const t = await openNewTab({ local: { atlasProfilesV2: one } });
  click(t.window, t.document.getElementById("global-settings-btn"));
  click(t.window, await waitFor(() => t.document.querySelector('#sp-nav [data-page="profiles"]'), 2000, "Profiles"));
  (await waitFor(() => content(t).querySelector('[data-pf-switch="personal"]'), 2000, "the profile")).dispatchEvent(new t.window.MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
  await waitFor(() => menuLabels(t.document).length, 2000, "menu");
  assert.deepEqual(menuLabels(t.document), ["Edit"], "the last profile's menu has no Delete");
  pickMenu(t.window, t.document, "Edit");
  const del = await waitFor(() => content(t).querySelector('[data-pfe-delete="personal"]'), 2000, "Delete");
  assert.ok(del.disabled, "disabled");
  assert.match(text(content(t)), /at least one profile/);
});

test("Add profile opens the new profile's edit page", async () => {
  const t = await openProfiles();
  click(t.window, content(t).querySelector("[data-pf-add]"));
  await waitFor(() => content(t).querySelector("[data-pfe-name]"), 2000, "edit page");
  assert.equal(content(t).querySelector("[data-pfe-name]").value, "New profile");
  const state = plain((await t.chrome.storage.local.get(["atlasProfilesV2"])).atlasProfilesV2);
  assert.equal(state.list.length, 3);
});
