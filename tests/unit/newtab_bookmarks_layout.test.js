// The new tab's bookmark pages: groups are plain centred columns (no card, no well, no tile rows),
// each with its name on a thin line, and a list is always a whole number of rows tall.
// Looks: payload/detractless/src/components/bookmarks/bookmarks.css. Behaviour: bookmarks.js.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { openNewTab, closeAll, waitFor, settle, click, ROOT } = require("./helpers/newtabDom");

test.afterEach(closeAll);

const CSS_FILE = path.join(ROOT, "payload", "detractless", "src", "components", "bookmarks", "bookmarks.css");
const text = (el) => (el ? el.textContent.replace(/\s+/g, " ").trim() : "");

/** The css rules of bookmarks.css as { selector, body }, comments removed. */
function rules() {
  const css = fs.readFileSync(CSS_FILE, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selector: m[1].trim().replace(/\s+/g, " "), body: m[2] }));
}
const rule = (selector) => rules().find((r) => r.selector.split(",").map((s) => s.trim()).includes(selector));
const token = (name) => parseFloat((rule(".bookmarks-content").body.match(new RegExp(`${name}:\\s*([\\d.]+)px`)) || [])[1]);

async function openEssentials(t, { height } = {}) {
  const { window: win, document: doc } = t;
  if (height) Object.defineProperty(win, "innerHeight", { value: height, configurable: true });
  click(win, doc.querySelector(".switcher-btn"));
  click(win, [...doc.querySelectorAll(".switcher-item")].find((li) => li.textContent.includes("Essentials")));
  const page = doc.getElementById("bookmarks-page");
  await waitFor(() => page.classList.contains("active") && text(page).includes("Gmail"), 3000, "Essentials");
  await settle(win, 50);
  return page;
}
const contextMenu = (win, el) => el.dispatchEvent(new win.MouseEvent("contextmenu", { bubbles: true, cancelable: true }));

test("each group is a column: its name, then its links in order", async () => {
  const t = await openNewTab();
  const page = await openEssentials(t);
  const columns = [...page.querySelectorAll(".bookmark-column")];
  assert.equal(columns.length, 2, "two groups, two columns");
  assert.deepEqual(columns.map((c) => text(c.querySelector(".group-title"))), ["PRODUCTIVITY", "COMMUNICATION"]);
  assert.deepEqual([...columns[0].querySelectorAll(".bookmark-link a")].map(text), ["Notion", "Google Calendar", "Todoist"]);
  assert.deepEqual([...columns[1].querySelectorAll(".bookmark-link a")].map(text), ["Gmail", "Slack", "Discord"]);
  assert.deepEqual(t.errors, []);
});

test("nothing is drawn around a group: no card, well or tile behind it", () => {
  for (const sel of [".bookmark-group", ".bookmark-well", ".bookmark-list", ".bookmark-link", ".bookmark-list a"]) {
    const r = rule(sel);
    assert.ok(r, `${sel} is still styled`);
    assert.doesNotMatch(r.body, /(^|[;\s])background(-color)?\s*:/, `${sel} has no background`);
    assert.doesNotMatch(r.body, /(^|[;\s])border(-(top|right|bottom|left|width|style|color))?\s*:/, `${sel} has no border`);
  }
  assert.doesNotMatch(fs.readFileSync(CSS_FILE, "utf8").replace(/\/\*[\s\S]*?\*\//g, ""), /\.bookmark-list li:(first|last|only)-child/, "no grouped tile corners");
  assert.match(rule(".bookmark-link:hover").body, /background:\s*var\(--hover-on-canvas\)/, "the hover is a tint of the page");
});

test("the name is centred on a thin line, and the links are centred and hug their names", () => {
  assert.match(rule(".group-title").body, /display:\s*flex/);
  for (const sel of [".group-title::before", ".group-title::after"]) {
    assert.match(rule(sel).body, /flex:\s*1/, `${sel} runs out to the side`);
    assert.match(rule(sel).body, /height:\s*1px/, `${sel} is one pixel thick`);
    assert.match(rule(sel).body, /var\(--line-hairline\)/, `${sel} uses the hairline colour`);
  }
  assert.match(rule(".bookmark-list").body, /align-items:\s*center/);
  assert.doesNotMatch(rule(".bookmark-link").body, /(^|[;\s])width:\s*100%/, "a row is only as wide as its name");
});

test("the row measurements are one set of tokens, and bookmarks.js reads the same ones", () => {
  assert.equal(token("--bm-row-pitch"), token("--bm-row-height") + token("--bm-row-gap"), "pitch = height + gap");
  assert.equal(token("--bm-row-pitch"), 36);
  const js = fs.readFileSync(path.join(ROOT, "payload", "detractless", "src", "components", "bookmarks", "bookmarks.js"), "utf8");
  for (const name of ["--bm-row-pitch", "--bm-row-gap", "--bm-well-padding", "--bm-title-height", "--bm-title-gap", "--bm-group-gap"]) {
    assert.ok(js.includes(name), `bookmarks.js reads ${name}`);
    assert.ok(rule(".bookmarks-content").body.includes(name + ":"), `bookmarks.css defines ${name}`);
  }
});

test("right-click with no window to answer: a link opens its bookmark pop-up, the name line the group's, the list between nothing", async () => {
  const t = await openNewTab();
  const page = await openEssentials(t);
  const { window: win, document: doc } = t;
  const dialogTitle = () => text(doc.querySelector(".bookmark-dialog .picker-title"));
  // Nothing answers the message to the window here, so the pop-up opens (editInBar.js); the answered case is in newtab_edit_in_bar.test.js.
  contextMenu(win, page.querySelector(".bookmark-link"));
  await settle(win, 80);
  assert.equal(dialogTitle(), "Notion", "the bookmark's own dialog");
  contextMenu(win, page.querySelector(".group-title"));
  await settle(win, 80);
  assert.equal(dialogTitle(), "PRODUCTIVITY", "the group's dialog (it replaces the first one)");
  doc.querySelectorAll(".bookmark-dialog").forEach((d) => d.remove());
  contextMenu(win, page.querySelector(".bookmark-list"));
  await settle(win, 80);
  assert.equal(doc.querySelector(".bookmark-dialog"), null, "empty space in the list opens nothing");
  assert.deepEqual(t.errors, []);
});

test("a group with nothing in it (made with Add group) shows its name and a quiet line, and still opens its dialog", async () => {
  const t = await openNewTab();
  const { window: win, document: doc } = t;
  const { activeTabs } = await t.chrome.storage.sync.get(["activeTabs"]);
  const essentials = activeTabs.find((p) => p.label === "Essentials").id;
  const open = () => new Promise((resolve, reject) => { const r = win.indexedDB.open("DetractlessBookmarks"); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
  const db = await open();
  const record = await waitFor(() => new Promise((resolve) => { const g = db.transaction(["bookmarks"]).objectStore("bookmarks").get(essentials); g.onsuccess = () => resolve(g.result); g.onerror = () => resolve(null); }), 3000, "the starter bookmarks");
  const data = Object.assign({}, record.data, { MOVIES: [] });
  await new Promise((resolve, reject) => { const tx = db.transaction(["bookmarks"], "readwrite"); tx.objectStore("bookmarks").put({ page: essentials, data }); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
  db.close();
  const page = await openEssentials(t);
  const groups = [...page.querySelectorAll(".bookmark-group")];
  assert.deepEqual(groups.map((g) => text(g.querySelector(".group-title"))), ["PRODUCTIVITY", "COMMUNICATION", "MOVIES"]);
  const empty = groups[2];
  assert.equal(text(empty.querySelector(".group-empty")), "No bookmarks yet");
  assert.equal(empty.querySelector(".bookmark-list"), null, "no list, so no scroll chrome");
  assert.equal(empty.querySelectorAll(".bookmark-link").length, 0);
  contextMenu(win, empty.querySelector(".group-title"));
  await settle(win, 80);
  assert.equal(text(doc.querySelector(".bookmark-dialog .picker-title")), "MOVIES", "right-click on the name still opens the group dialog");
  assert.equal(text(doc.querySelector(".bookmark-dialog .picker-subtitle")), "0 bookmarks");
  assert.deepEqual(t.errors, []);
});

test("a list is a whole number of rows tall, whatever room there is", async () => {
  const roomy = await openNewTab();
  const page = await openEssentials(roomy);
  assert.deepEqual([...page.querySelectorAll(".bookmark-list")].map((l) => l.style.maxHeight), ["108px", "108px"], "three rows of 36px: all of them show");
  roomy.window.close();

  const tight = await openNewTab();
  const small = await openEssentials(tight, { height: 260 });
  const heights = [...small.querySelectorAll(".bookmark-list")].map((l) => parseFloat(l.style.maxHeight));
  assert.deepEqual(heights.map((h) => h % 36), [0, 0], `each is a multiple of the 36px row: ${heights}`);
  assert.ok(heights.every((h) => h < 108), "the lists were cut short, so they scroll");
  assert.deepEqual(tight.errors, []);
});
