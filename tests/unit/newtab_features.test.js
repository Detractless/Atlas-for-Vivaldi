// Feature tests for the new tab: the bookmarks page and backup export/import.
// Search moved to the address bar (addressbar_*.test.js); the page has no search box.
// Same harness as the smoke test (real bundle in jsdom).
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { openNewTab, closeAll, waitFor, click } = require("./helpers/newtabDom");

test.afterEach(closeAll);

const text = (el) => (el ? el.textContent.replace(/\s+/g, " ").trim() : "");
// Page objects come from the jsdom realm; copy them so deepStrictEqual compares values only.
const plain = (v) => JSON.parse(JSON.stringify(v));

/** Switch to a bookmarks page and wait until it shows `expect`. */
async function openPage(win, doc, label, expect) {
  click(win, doc.querySelector(".switcher-btn"));
  const item = [...doc.querySelectorAll(".switcher-item")].find((li) => li.textContent.includes(label));
  click(win, item);
  const page = doc.getElementById("bookmarks-page");
  await waitFor(() => page.classList.contains("active") && text(page).includes(expect), 3000, `${label} page`);
}

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

test("page subtitles travel in a backup", async () => {
  const pages = [
    { id: "search", label: "Home", type: "search", sub: "Start every day here" },
    { id: 7, label: "College", type: "bookmarks", sub: "Classes and due dates" },
  ];
  const a = await openNewTab({ local: { hasSeededDefaults: true }, sync: { activeTabs: pages } });
  const bytes = await exportArchive(a);
  a.window.close();

  const b = await openNewTab({ local: { hasSeededDefaults: true }, sync: { activeTabs: [{ id: "search", label: "Home", type: "search" }] } });
  await importArchive(b, bytes, "backup.detractless");
  const stored = await b.chrome.storage.sync.get(["activeTabs"]);
  assert.deepEqual(plain(stored.activeTabs.map((p) => [p.label, p.sub])), [["Home", "Start every day here"], ["College", "Classes and due dates"]]);
  b.window.close();
});

/* Snippets (from the archived PasteKit) live in their own IndexedDB database.
   Backups must keep carrying them, so an export + reset + import loses nothing. */
function idb(win, fn) {
  return new Promise((resolve, reject) => {
    const req = win.indexedDB.open("pastekit", 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("snippets")) db.createObjectStore("snippets", { keyPath: "id", autoIncrement: true });
      if (!db.objectStoreNames.contains("folders")) {
        const f = db.createObjectStore("folders", { keyPath: "id", autoIncrement: true });
        f.createIndex("name", "name"); f.createIndex("parentId", "parentId");
      }
      if (!db.objectStoreNames.contains("settings")) db.createObjectStore("settings", { keyPath: "key" });
    };
    req.onsuccess = () => {
      const db = req.result;
      Promise.resolve(fn(db)).then((v) => { db.close(); resolve(v); }, reject);
    };
    req.onerror = () => reject(req.error);
  });
}

test("snippets travel in a backup from one new tab to a fresh one", async () => {
  const a = await openNewTab();
  await idb(a.window, (db) => new Promise((res) => {
    const tx = db.transaction(["folders", "snippets"], "readwrite");
    tx.objectStore("folders").add({ name: "Work", parentId: 0, createdAt: 1 }).onsuccess = (e) => {
      tx.objectStore("snippets").add({ name: "@sig", description: "", contentText: "Best, Pat", contentHtml: "", folderId: e.target.result, tags: ["mail"], createdAt: 1, updatedAt: 1 });
    };
    tx.oncomplete = res;
  }));
  const bytes = await exportArchive(a);
  a.window.close();

  const b = await openNewTab({ local: { hasSeededDefaults: true } });
  const toast = await importArchive(b, bytes, "backup.detractless");
  assert.match(toast.textContent, /snippets/);
  const rows = await idb(b.window, (db) => new Promise((res) => {
    db.transaction("snippets").objectStore("snippets").getAll().onsuccess = (e) => res(e.target.result);
  }));
  assert.deepEqual(plain(rows.map((r) => [r.name, r.contentText, r.tags])), [["@sig", "Best, Pat", ["mail"]]]);
  b.window.close();
});
