// The address bar card (src/modules/18-addressbar-pills.js): when the address
// field is in use, a card grows down from it over the page with the full
// address wrapped and, while you type, the bookmarks whose name matches, as
// pills, the same rule as the new tab's search.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { openWindow } = require("./helpers/windowDom");

const plain = (v) => JSON.parse(JSON.stringify(v === undefined ? null : v));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let open = [];
test.afterEach(() => { for (const w of open) w.window.close(); open = []; });

const BOOKMARKS = {
  1: { WORK: [{ name: "Notion", url: "https://notion.so" }, { name: "NotebookLM", url: "https://notebooklm.google.com" }, { name: "Gmail", url: "https://mail.google.com" }] },
  2: { COLLEGE: [{ name: "Notes — College", url: "https://notes.example.com" }, { name: "Canvas", url: "https://canvas.example.com" }] },
};

/** Put bookmarks (and how often each was opened) in the new tab's database, as the new tab does. */
function seedBookmarks(win, name, pages, uses = {}) {
  return new Promise((resolve, reject) => {
    const req = win.indexedDB.open(name, 7);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore("bookmarks", { keyPath: "page" });
      db.createObjectStore("usage", { keyPath: "url" });
    };
    req.onsuccess = () => {
      const db = req.result, tx = db.transaction(["bookmarks", "usage"], "readwrite");
      for (const [page, data] of Object.entries(pages)) tx.objectStore("bookmarks").put({ page: Number(page), data });
      for (const [url, n] of Object.entries(uses)) tx.objectStore("usage").put({ url, timestamps: Array(n).fill(Date.now()) });
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    };
    req.onerror = () => reject(req.error);
  });
}

async function start({ sync, seed = true, uses } = {}) {
  const w = await openWindow({ sync });
  open.push(w);
  if (seed) await seedBookmarks(w.window, "DetractlessBookmarks", BOOKMARKS, uses);
  const doc = w.window.document;
  doc.getElementById("browser").insertAdjacentHTML("beforeend",
    '<div class="toolbar-mainbar"><div class="UrlBar-AddressField"><div class="UrlBar-UrlFieldWrapper">' +
    '<input class="UrlBar-UrlField url vivaldi-addressfield" value="https://docs.google.com/document/d/1Xq7/edit"></div>' +
    '<div class="OmniDropdown">suggestions</div></div></div>');
  w.input = doc.querySelector(".UrlBar-AddressField input.url");
  return w;
}

async function focus(w) {
  w.input.focus();
  w.input.dispatchEvent(new w.window.FocusEvent("focusin", { bubbles: true }));
  await wait(60);
}
async function type(w, text) {
  w.input.value = text;
  w.input.dispatchEvent(new w.window.Event("input", { bubbles: true }));
  await wait(60);
}
function key(w, k, extra = {}) {
  const ev = new w.window.KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...extra });
  w.input.dispatchEvent(ev);
  return ev;
}
const card = (w) => w.window.document.querySelector(".atlas-urlcard");
const pills = (w) => (card(w) && !card(w).hidden ? [...card(w).querySelectorAll(".atlas-urlpill")] : []);
const names = (w) => pills(w).map((p) => p.textContent);
const selected = (w) => pills(w).filter((p) => p.getAttribute("aria-selected") === "true").map((p) => p.textContent);
const opened = (w) => w.calls.filter((c) => c.name === "chrome.tabs.update").map((c) => plain(c.args.find((a) => a && typeof a === "object")).url);

test("bookmarks show as pills only once you type, and only when their name matches", async () => {
  const w = await start();
  await focus(w);
  assert.deepEqual(names(w), [], "nothing on focus: the page's address isn't a search");
  await type(w, "no");
  assert.deepEqual(names(w).sort(), ["NotebookLM", "Notes — College", "Notion"]);
  await type(w, "noti");
  assert.deepEqual(names(w), ["Notion"], "fewer as you type more");
  await type(w, "notion zzz");
  assert.deepEqual(names(w), [], "no match: no pills");
  assert.deepEqual(w.errors, []);
});

test("the pills are ordered by how often you open them, and the first is picked", async () => {
  const w = await start({ uses: { "https://notebooklm.google.com": 5, "https://notion.so": 1 } });
  await focus(w);
  await type(w, "no");
  assert.deepEqual(names(w), ["NotebookLM", "Notion", "Notes — College"]);
  assert.deepEqual(selected(w), ["NotebookLM"]);
});

test("arrows move the pick, Enter opens it, and Vivaldi never sees those keys", async () => {
  const w = await start({ uses: { "https://notebooklm.google.com": 5, "https://notion.so": 1 } });
  let reached = 0;
  w.input.addEventListener("keydown", () => { reached++; });
  await focus(w);
  await type(w, "no");
  assert.ok(key(w, "ArrowDown").defaultPrevented);
  assert.deepEqual(selected(w), ["Notion"]);
  key(w, "ArrowUp");
  key(w, "ArrowUp");
  assert.deepEqual(selected(w), ["Notes — College"], "wraps around");
  key(w, "ArrowDown");
  const enter = key(w, "Enter");
  assert.ok(enter.defaultPrevented);
  assert.equal(reached, 0, "the keys stop before Vivaldi's address field");
  await wait(20);
  assert.deepEqual(opened(w), ["https://notebooklm.google.com"]);
  assert.ok(!card(w) || card(w).hidden, "the card closes");
});

test("Shift+Enter is left to Vivaldi, which searches the typed text", async () => {
  const w = await start();
  await focus(w);
  await type(w, "notion");
  const ev = key(w, "Enter", { shiftKey: true });
  assert.equal(ev.defaultPrevented, false);
  await wait(20);
  assert.deepEqual(opened(w), []);
});

test("a pill can be clicked", async () => {
  const w = await start();
  await focus(w);
  await type(w, "canv");
  const pill = pills(w)[0];
  const down = new w.window.MouseEvent("mousedown", { bubbles: true, cancelable: true });
  pill.dispatchEvent(down);
  assert.ok(down.defaultPrevented, "the field keeps focus");
  pill.dispatchEvent(new w.window.MouseEvent("click", { bubbles: true }));
  await wait(20);
  assert.deepEqual(opened(w), ["https://canvas.example.com"]);
});

test("Vivaldi's own suggestions step aside while pills show, and come back without them", async () => {
  const w = await start();
  const browser = w.window.document.getElementById("browser");
  await focus(w);
  await type(w, "gma");
  assert.ok(browser.classList.contains("atlas-pills-open"));
  await type(w, "gmaxyz");
  assert.ok(!browser.classList.contains("atlas-pills-open"));
});

test("with the pills setting on \"When typing ./\", only ./ shows them", async () => {
  const w = await start({ sync: { bookmarkPillBehavior: "prefix" } });
  await focus(w);
  await type(w, "no");
  assert.deepEqual(names(w), []);
  await type(w, "./no");
  assert.equal(names(w).length, 3);
});

test("a long address shows in full, wrapped, in the card", async () => {
  const w = await start();
  Object.defineProperty(w.input, "scrollWidth", { configurable: true, get: () => 900 });
  Object.defineProperty(w.input, "clientWidth", { configurable: true, get: () => 300 });
  await focus(w);
  const full = card(w) && card(w).querySelector(".atlas-urlcard-full");
  assert.ok(full && !card(w).hidden, "shown");
  assert.equal(full.textContent, "https://docs.google.com/document/d/1Xq7/edit");
});

test("leaving the field closes the card", async () => {
  const w = await start();
  await focus(w);
  await type(w, "no");
  assert.ok(names(w).length);
  w.input.blur();
  w.input.dispatchEvent(new w.window.FocusEvent("focusout", { bubbles: true }));
  await wait(30);
  assert.ok(!card(w) || card(w).hidden);
  assert.ok(!w.window.document.getElementById("browser").classList.contains("atlas-pills-open"));
  assert.ok(!w.window.document.getElementById("browser").classList.contains("atlas-urlcard-open"), "the field's corners come back");
});

test("the card joins the field: no gap, same left edge and width, and the field knows it's open", async () => {
  const w = await start();
  const doc = w.window.document;
  doc.querySelector(".UrlBar-AddressField").getBoundingClientRect = () => ({ left: 120, top: 8, bottom: 48, width: 640, height: 40, right: 760 });
  await focus(w);
  assert.ok(!doc.getElementById("browser").classList.contains("atlas-urlcard-open"), "nothing to show yet");
  await type(w, "no");
  const c = card(w);
  assert.deepEqual([c.style.left, c.style.top, c.style.width], ["120px", "48px", "640px"]);
  assert.ok(doc.getElementById("browser").classList.contains("atlas-urlcard-open"));
  await type(w, "zzz");
  assert.ok(!doc.getElementById("browser").classList.contains("atlas-urlcard-open"), "no card, no join");
});

test("with no bookmark database yet, nothing shows and none is created", async () => {
  const w = await start({ seed: false });
  await focus(w);
  await type(w, "no");
  assert.deepEqual(names(w), []);
  const dbs = await w.window.indexedDB.databases();
  assert.ok(!dbs.some((d) => d.name === "DetractlessBookmarks"), "the window never creates the new tab's database");
  assert.deepEqual(w.errors, []);
});
