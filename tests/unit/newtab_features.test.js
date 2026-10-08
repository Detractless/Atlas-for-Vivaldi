// Feature tests for the new tab: search, the bookmarks page, and backup
// export/import. Same harness as the smoke test (real bundle in jsdom).
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { openNewTab, closeAll, waitFor, settle, click } = require("./helpers/newtabDom");

test.afterEach(closeAll);

const text = (el) => (el ? el.textContent.replace(/\s+/g, " ").trim() : "");
// Page objects come from the jsdom realm; copy them so deepStrictEqual compares values only.
const plain = (v) => JSON.parse(JSON.stringify(v));

function type(win, input, value) {
  input.value = value;
  input.dispatchEvent(new win.Event("input", { bubbles: true }));
}

function key(win, el, k, extra = {}) {
  el.dispatchEvent(new win.KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...extra }));
}

const pills = (doc) => [...doc.querySelectorAll("#bookmark-search-results .bookmark-search-item:not(.empty)")];

/** Switch to a bookmarks page and wait until it shows `expect`. */
async function openPage(win, doc, label, expect) {
  click(win, doc.querySelector(".switcher-btn"));
  const item = [...doc.querySelectorAll(".switcher-item")].find((li) => li.textContent.includes(label));
  click(win, item);
  const page = doc.getElementById("bookmarks-page");
  await waitFor(() => page.classList.contains("active") && text(page).includes(expect), 3000, `${label} page`);
}

test("typing ./ and a name shows matching bookmark pills", async () => {
  const t = await openNewTab();
  const { window: win, document: doc } = t;
  type(win, doc.getElementById("search-input"), "./not");
  await waitFor(() => pills(doc).length > 0, 2000, "pills");
  assert.ok(pills(doc).map(text).includes("Notion"), "Notion is offered");
  assert.ok(pills(doc).every((p) => /not/i.test(text(p))), "only matching pills");
  assert.deepEqual(t.errors, []);
  win.close();
});

test("Enter on an address opens it", async () => {
  const t = await openNewTab();
  const { window: win, document: doc } = t;
  const input = doc.getElementById("search-input");
  type(win, input, "example.com");
  key(win, input, "Enter");
  await settle(win, 100);
  assert.deepEqual(plain(win.__navigations), ["https://example.com/"]);
  assert.equal(input.value, "", "search box clears");
  win.close();
});

test("Enter on text searches with the browser's default engine", async () => {
  const t = await openNewTab();
  const { window: win, document: doc } = t;
  const input = doc.getElementById("search-input");
  type(win, input, "weather tomorrow");
  key(win, input, "Enter");
  await settle(win, 100);
  assert.deepEqual(plain(t.control.searches), [{ text: "weather tomorrow", disposition: "CURRENT_TAB" }]);
  assert.equal(win.__navigations, undefined, "no page navigation");
  win.close();
});

test("a chosen engine searches on that engine's site", async () => {
  const t = await openNewTab({ sync: { selectedSearchEngine: "duckduckgo" } });
  const { window: win, document: doc } = t;
  const input = doc.getElementById("search-input");
  type(win, input, "cats");
  key(win, input, "Enter");
  await settle(win, 100);
  assert.deepEqual(plain(win.__navigations), ["https://duckduckgo.com/?q=cats"]);
  win.close();
});

test("arrow down + Enter opens the selected bookmark; Shift+Enter searches instead", async () => {
  const t = await openNewTab();
  const { window: win, document: doc } = t;
  const input = doc.getElementById("search-input");
  type(win, input, "gmail");
  await waitFor(() => pills(doc).length === 1, 2000, "Gmail pill");
  key(win, input, "ArrowDown");
  key(win, input, "Enter", { shiftKey: true });
  await settle(win, 100);
  assert.deepEqual(plain(t.control.searches.map((s) => s.text)), ["gmail"]);
  type(win, input, "gmail");
  await waitFor(() => pills(doc).length === 1, 2000, "Gmail pill again");
  key(win, input, "ArrowDown");
  key(win, input, "Enter");
  await settle(win, 100);
  assert.deepEqual(plain(win.__navigations), ["https://mail.google.com/"]);
  win.close();
});

test("a local file path without file access shows the warning", async () => {
  const t = await openNewTab();
  const { window: win, document: doc } = t;
  const input = doc.getElementById("search-input");
  type(win, input, "/Users/me/notes.txt");
  key(win, input, "Enter");
  await waitFor(() => doc.querySelector(".file-access-warning"), 2000, "file access warning");
  assert.equal(win.__navigations, undefined);
  win.close();
});

test("a bookmarks page shows its groups and bookmarks", async () => {
  const t = await openNewTab();
  const { window: win, document: doc } = t;
  await openPage(win, doc, "Essentials", "Notion");
  const page = text(doc.getElementById("bookmarks-page"));
  for (const word of ["PRODUCTIVITY", "COMMUNICATION", "Notion", "Gmail", "Discord"]) {
    assert.ok(page.includes(word), `page shows ${word}`);
  }
  assert.deepEqual(t.errors, []);
  win.close();
});

/** Settings > Backup > Export, the way a user does it. */
async function exportArchive(t) {
  const { window: win, document: doc } = t;
  click(win, doc.getElementById("global-settings-btn"));
  const nav = await waitFor(() => doc.querySelector('#sp-nav [data-page="backup"]'), 2000, "Backup in the settings menu");
  click(win, nav);
  click(win, await waitFor(() => doc.querySelector('#sp-content [data-action="export"]'), 2000, "Export button"));
  const blob = await waitFor(() => win.__blobs[0], 4000, "export download");
  return new Uint8Array(await blob.arrayBuffer());
}

async function importArchive(t, bytes, name) {
  const { window: win, document: doc } = t;
  const input = doc.getElementById("import-file");
  const file = new win.File([bytes], name);
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  input.dispatchEvent(new win.Event("change", { bubbles: true }));
  return waitFor(
    () => [...doc.querySelectorAll('[role="status"]')].find((n) => /import/i.test(n.textContent)),
    6000, "import result toast"
  );
}

test("a backup exported from one new tab restores into a fresh one", async () => {
  const a = await openNewTab({ sync: { spotlightVisible: false, tabLimit: 4 } });
  const bytes = await exportArchive(a);
  assert.equal(bytes[0], 0x50, "archive is a ZIP");
  assert.equal(bytes[1], 0x4b);
  a.window.close();

  const b = await openNewTab({ local: { hasSeededDefaults: true }, sync: { activeTabs: [{ id: "search", label: "Home", type: "search" }] } });
  assert.deepEqual([...b.document.querySelectorAll(".switcher-item")].length, 1, "fresh tab has only Home");
  const toast = await importArchive(b, bytes, "backup.detractless");
  assert.match(toast.textContent, /^Import successful! Restored bookmarks and settings/);
  const stored = await b.chrome.storage.sync.get(["spotlightVisible", "tabLimit", "activeTabs"]);
  assert.equal(stored.spotlightVisible, false);
  assert.equal(stored.tabLimit, 4);
  assert.deepEqual(plain(stored.activeTabs.map((p) => p.label)), ["Home", "Essentials", "AI Tools"]);
  await openPage(b.window, b.document, "Essentials", "Notion");
  assert.ok(text(b.document.getElementById("bookmarks-page")).includes("Notion"));
  b.window.close();
});
