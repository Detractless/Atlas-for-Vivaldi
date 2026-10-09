// Spec 001 end to end (phase 5): page subtitles, the add popup, Settings >
// Pages, the profile edit page and the Google account working together, plus
// the checks that span them (privacy of the linked email, the subtitle
// migration running once, profile edits reaching the browser's menu).
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const esbuild = require("esbuild");
const { openNewTab, closeAll, waitFor, settle, click } = require("./helpers/newtabDom");
const { openWindow } = require("./helpers/windowDom");

test.afterEach(closeAll);

const text = (el) => (el ? el.textContent.replace(/\s+/g, " ").trim() : "");
const plain = (v) => JSON.parse(JSON.stringify(v));
const account = (url) => new URL(url).searchParams.get("authuser");
const A = "pat@gmail.com", B = "pat@students.ksu.edu";

function profiles(active) {
  const p = (id, name, email) => ({ id, name, label: "", color: 0, icon: "", db: "", settings: {}, google: { email } });
  return {
    v: 2, active, owner: active,
    share: { bookmarks: true, theme: true, appearance: true, search: true, focus: true },
    list: [p("personal", "Pat", A), p("school", "Pat (School)", B)],
  };
}

async function popup(t, mode) {
  click(t.window, t.document.getElementById("global-add-btn"));
  const p = await waitFor(() => t.document.querySelector(".add-popup"), 2000, "add popup");
  if (mode === "page") click(t.window, p.querySelector('[data-add-mode="page"]'));
  return p;
}
function set(t, p, name, value) {
  const el = p.querySelector(`[data-field="${name}"]`);
  el.value = value;
  el.dispatchEvent(new t.window.Event("input", { bubbles: true }));
  el.dispatchEvent(new t.window.Event("change", { bubbles: true }));
}
async function save(t, p) {
  click(t.window, p.querySelector("[data-add-save]"));
  await waitFor(() => !t.document.querySelector(".add-popup"), 2000, "popup closes");
}

test("a page with a subtitle, a bookmark on it, opened as one Google account, then the other", async () => {
  const t = await openNewTab({
    local: { hasSeededDefaults: true, atlasProfilesV2: profiles("school") },
    sync: { activeTabs: [{ id: "search", label: "Home", type: "search" }] },
  });
  const { window: win, document: doc } = t;

  let p = await popup(t, "page");
  set(t, p, "pageName", "Classes");
  set(t, p, "sub", "Courses and due dates");
  await save(t, p);
  assert.equal(text(doc.querySelector(".switcher-label")), "Classes", "the new page opens");

  p = await popup(t);
  assert.equal(p.querySelector('[data-field="page"] option:checked').textContent, "Classes", "the open page is chosen");
  set(t, p, "name", "Drive");
  set(t, p, "url", "drive.google.com/drive/u/0/my-drive");
  set(t, p, "group", "new-group ");
  set(t, p, "newGroup", "school");
  await save(t, p);

  const page = doc.getElementById("bookmarks-page");
  const drive = await waitFor(() => [...page.querySelectorAll("a")].find((a) => text(a) === "Drive"), 3000, "the Drive bookmark");
  assert.equal(account(drive.href), B);
  assert.ok(drive.href.includes(`/drive/u/${encodeURIComponent(B)}/my-drive`), drive.href);

  await win.AtlasProfiles.switchTo("personal");
  await waitFor(() => {
    const d = [...page.querySelectorAll("a")].find((a) => text(a) === "Drive");
    return d && account(d.href) === A;
  }, 3000, "the personal account");
  assert.equal(win.__navigations, undefined, "no reload on the way");

  click(win, doc.querySelector(".switcher-btn"));
  const classes = [...doc.querySelectorAll(".switcher-item")].find((li) => li.textContent.includes("Classes"));
  assert.equal(text(classes.querySelector(".sub")), "Courses and due dates");
  assert.deepEqual(t.errors, []);
});

test("a page added from the + popup shows up in Settings > Pages", async () => {
  const t = await openNewTab();
  const p = await popup(t, "page");
  set(t, p, "pageName", "Reading");
  set(t, p, "sub", "Books to read next");
  await save(t, p);
  click(t.window, t.document.getElementById("global-settings-btn"));
  click(t.window, await waitFor(() => t.document.querySelector('#sp-nav [data-page="pages"]'), 2000, "Pages"));
  const rows = await waitFor(() => {
    const r = [...t.document.querySelectorAll("#sp-content .pg-row")];
    return r.length ? r : null;
  }, 2000, "page rows");
  assert.deepEqual([text(rows.at(-1).querySelector(".sp-row-title")), text(rows.at(-1).querySelector(".sp-row-desc"))], ["Reading", "Books to read next"]);
});

test("the linked email goes only into Google links and the profile's own storage", async () => {
  const t = await openNewTab({ local: { atlasProfilesV2: profiles("school") } });
  const { window: win, document: doc } = t;
  const input = doc.getElementById("search-input");
  input.value = "example.com";
  input.dispatchEvent(new win.Event("input", { bubbles: true }));
  input.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
  await settle(win, 100);
  assert.deepEqual(plain(win.__navigations), ["https://example.com/"], "a non-Google address gets nothing added");

  click(win, doc.querySelector(".switcher-btn"));
  click(win, [...doc.querySelectorAll(".switcher-item")].find((li) => li.textContent.includes("Essentials")));
  const page = doc.getElementById("bookmarks-page");
  await waitFor(() => text(page).includes("Notion"), 3000, "Essentials");
  for (const a of page.querySelectorAll("a")) {
    const google = /(^|\.)google\.com$/.test(new URL(a.href).hostname);
    assert.equal(a.href.includes(encodeURIComponent(B)), google, a.href);
  }
  for (const area of ["sync", "local", "session"]) {
    const data = plain(await t.chrome.storage[area].get(null));
    for (const [k, v] of Object.entries(data)) {
      if (k === "atlasProfilesV2") continue;
      assert.ok(!JSON.stringify(v).includes(B), `${area}.${k} doesn't hold the email`);
    }
  }
});

test("the subtitle migration only writes when a page is missing one", () => {
  const file = path.join(__dirname, "..", "..", "payload", "detractless", "src", "services", "pageSubtitle.js");
  const out = esbuild.buildSync({ entryPoints: [file], bundle: true, format: "cjs", platform: "node", write: false });
  const mod = { exports: {} };
  new Function("module", "exports", out.outputFiles[0].text)(mod, mod.exports);
  const pages = [{ id: "search", type: "search" }, { id: 1, type: "bookmarks", sub: "Mine, kept as is" }];
  assert.equal(mod.exports.fillMissingSubtitles(pages), true, "Home had none: one save");
  assert.equal(mod.exports.fillMissingSubtitles(pages), false, "every page has one now: no more saves");
  assert.equal(pages[1].sub, "Mine, kept as is");
});

test("a profile renamed in the new tab shows renamed in the browser's profile menu", async () => {
  const w = await openWindow({ local: { atlasProfilesV2: profiles("school") } });
  try {
    const doc = w.window.document;
    const state = plain((await w.chrome.storage.local.get(["atlasProfilesV2"])).atlasProfilesV2);
    state.list.find((p) => p.id === "school").name = "Pat at KSU";
    await w.chrome.storage.local.set({ atlasProfilesV2: state });
    await new Promise((r) => setTimeout(r, 100));
    doc.getElementById("browser").insertAdjacentHTML("beforeend",
      '<div class="toolbar-mainbar"><button data-name="AccountButton">P</button></div>');
    doc.querySelector('[data-name="AccountButton"]').dispatchEvent(new w.window.MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 }));
    const name = await waitFor(() => doc.querySelector(".atlas-nosurf-menu .apm-name"), 2000, "profile menu");
    assert.equal(name.textContent, "Pat at KSU");
  } finally {
    w.window.close();
  }
});
