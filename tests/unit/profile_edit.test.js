// Settings > Profiles and each profile's edit page (profilesPage.js,
// profileEditPage.js). The list is read-only with an Edit button per profile;
// the edit page holds the image, name, label and Delete.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { openNewTab, closeAll, waitFor, settle, click } = require("./helpers/newtabDom");

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

/** A profile's ⋮ menu, then one of its items. */
async function fromMenu(t, id, item) {
  click(t.window, content(t).querySelector(`[data-pf-menu="${id}"]`));
  click(t.window, await waitFor(() => content(t).querySelector(`.sp-popmenu [${item}="${id}"]`), 2000, `${item} in the menu`));
}

async function edit(t, id) {
  await fromMenu(t, id, "data-pf-edit");
  await waitFor(() => content(t).querySelector("[data-pfe-name]"), 2000, "edit page");
}

function change(t, el, value) {
  el.value = value;
  el.dispatchEvent(new t.window.Event("change", { bubbles: true }));
}

test("the profile list is read-only: one ⋮ per profile, no Switch button or Current badge", async () => {
  const t = await openProfiles();
  assert.equal(content(t).querySelectorAll(".pf-input").length, 0, "no text boxes in the list");
  const rows = [...content(t).querySelectorAll(".pf-row")];
  assert.deepEqual(rows.map((r) => text(r.querySelector(".pf-name"))), ["Pat", "Pat (School)"]);
  assert.deepEqual(rows.map((r) => text(r.querySelector(".pf-label"))), ["Personal", "School"]);
  for (const id of ["personal", "school"]) assert.ok(content(t).querySelector(`[data-pf-menu="${id}"]`), `⋮ on ${id}`);
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

test("a profile's ⋮ menu has Edit and Delete; Delete asks first, right in the list", async () => {
  const t = await openProfiles();
  await fromMenu(t, "school", "data-pf-delete");
  await settle(t.window, 50);
  assert.match(text(content(t)), /Delete Pat \(School\)\?/);
  click(t.window, content(t).querySelector("[data-pf-cancel]"));
  await settle(t.window, 50);
  assert.ok(await storedProfile(t, "school"), "Cancel keeps it");
  await fromMenu(t, "school", "data-pf-delete");
  await settle(t.window, 50);
  click(t.window, content(t).querySelector('[data-pf-delete-go="school"]'));
  await settle(t.window, 200);
  assert.equal(await storedProfile(t, "school"), undefined, "deleted");
  assert.equal(content(t).querySelectorAll(".pf-row").length, 1);
});

test("the ⋮ menu closes on Escape without closing Settings", async () => {
  const t = await openProfiles();
  click(t.window, content(t).querySelector('[data-pf-menu="school"]'));
  await waitFor(() => content(t).querySelector(".sp-popmenu"), 2000, "menu");
  t.document.body.dispatchEvent(new t.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
  await settle(t.window, 30);
  assert.equal(content(t).querySelector(".sp-popmenu"), null);
  assert.ok(!t.document.getElementById("sp-root").hidden);
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
  click(t.window, await waitFor(() => content(t).querySelector('[data-pf-menu="personal"]'), 2000, "⋮"));
  const menu = await waitFor(() => content(t).querySelector(".sp-popmenu"), 2000, "menu");
  assert.equal(menu.querySelector("[data-pf-delete]"), null, "the last profile's menu has no Delete");
  click(t.window, menu.querySelector('[data-pf-edit="personal"]'));
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
