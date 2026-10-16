// The add popup (components/addPopup): one question per screen. A bookmark is two screens (which website,
// then the name and where it goes); a page is two screens (its name, then a subtitle). The profile menu's
// "Add bookmark" and "Add page" and the + button open it.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { openNewTab, closeAll, waitFor, settle, click } = require("./helpers/newtabDom");
const { text, field, titleOf, openAdd, setField, next, pick, save, addBookmarkFlow } = require("./helpers/addFlow");

test.afterEach(closeAll);

const plain = (v) => JSON.parse(JSON.stringify(v));
const errorFor = (p, name) => text(p.querySelector(`[data-error-for="${name}"]`));
const keydown = (t, el, key) => el.dispatchEvent(new t.window.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));

/** What chrome.history would hand over: visits to pages, many of them deep inside a site. */
const HISTORY = [
  { url: "https://www.netflix.com/browse", visitCount: 40, lastVisitTime: 5 },
  { url: "https://www.netflix.com/title/8123", visitCount: 3, lastVisitTime: 6 },
  { url: "https://netlify.com/", visitCount: 5, lastVisitTime: 4 },
  { url: "https://docs.google.com/document/d/1Xq7/edit", visitCount: 9, lastVisitTime: 7 },
  { url: "https://mail.google.com/mail/u/0/", visitCount: 12, lastVisitTime: 8 },
  { url: "https://www.bbc.co.uk/news", visitCount: 2, lastVisitTime: 3 },
  { url: "chrome://settings/", visitCount: 50, lastVisitTime: 9 },
];
async function withHistory(t) {
  t.window.chrome.history = { search: (q, cb) => Promise.resolve().then(() => cb(HISTORY.map((h) => ({ ...h })))) };
}
const pills = (p) => [...p.querySelectorAll("[data-site]")].map((b) => b.dataset.site);

async function pageId(t, label) {
  const pages = plain((await t.chrome.storage.sync.get(["activeTabs"])).activeTabs);
  return String(pages.find((p) => p.label === label).id);
}

/** Switch to a bookmarks page and return its text once `expect` shows. */
async function openPage(t, label, expect) {
  const { window: win, document: doc } = t;
  click(win, doc.querySelector(".switcher-btn"));
  click(win, [...doc.querySelectorAll(".switcher-item")].find((li) => li.textContent.includes(label)));
  const page = doc.getElementById("bookmarks-page");
  await waitFor(() => page.classList.contains("active") && text(page).includes(expect), 3000, `${label} page`);
  return page;
}

test("+ opens the bookmark flow: the question is the title, Step 1 of 2, no Bookmark | Page switch", async () => {
  const t = await openNewTab();
  const p = await openAdd(t);
  assert.equal(titleOf(p), "Which website?");
  assert.match(text(p.querySelector(".add-popup-step")), /Step 1 of 2/);
  assert.ok(field(p, "url"), "the address field");
  assert.equal(field(p, "name"), null, "the name is on the next screen");
  assert.equal(p.querySelector("[data-add-mode]"), null, "no Bookmark | Page switch");
  assert.ok(p.querySelector("[data-add-next]").disabled, "Next waits for an address");
  assert.equal(t.document.querySelector(".bookmark-dialog"), null, "no step-by-step dialog");
  assert.deepEqual(t.errors, []);
});

test("a bookmark is added with its name, URL, page and group, and shows on its page", async () => {
  const t = await openNewTab();
  await addBookmarkFlow(t, { url: "smoke.example.com", name: "Smoke Test Site", group: "PRODUCTIVITY" });
  const page = await openPage(t, "Essentials", "Smoke Test Site");
  const link = [...page.querySelectorAll("a")].find((a) => text(a).includes("Smoke Test Site"));
  assert.equal(link.getAttribute("href"), "https://smoke.example.com", "https:// is added");
  assert.deepEqual(t.errors, []);
});

test("screen 2 starts on the first page when Home is showing, filled in with the site's name", async () => {
  const t = await openNewTab();
  const p = await openAdd(t);
  setField(t, p, "url", "https://www.netflix.com/browse");
  await next(t, p);
  assert.equal(titleOf(p), "Name and place");
  assert.match(text(p.querySelector(".add-popup-step")), /Step 2 of 2/);
  assert.equal(field(p, "name").value, "Netflix");
  assert.deepEqual([...p.querySelectorAll("[data-name-pill]")].map(text), ["Netflix", "Netflix.com"]);
  assert.equal(text(p.querySelector('[data-dd-label="page"]')), "Essentials");
  await waitFor(() => text(p.querySelector('[data-dd-label="group"]')) !== "Choose", 2000, "a group chosen");
  assert.equal(field(p, "url"), null, "the address is on screen 1");
});

test("Back keeps what you typed, and a name you changed is not overwritten", async () => {
  const t = await openNewTab();
  const p = await openAdd(t);
  setField(t, p, "url", "netflix.com");
  await next(t, p);
  setField(t, p, "name", "Movie night");
  click(t.window, p.querySelector("[data-add-back]"));
  assert.equal(titleOf(p), "Which website?");
  assert.equal(field(p, "url").value, "netflix.com");
  await next(t, p);
  assert.equal(field(p, "name").value, "Movie night");
  click(t.window, p.querySelector("[data-name-pill]"));
  assert.equal(field(p, "name").value, "Netflix", "a name pill fills the name");
});

test("a new group can be made in the popup; a name already on the page is refused", async () => {
  const t = await openNewTab();
  const p = await openAdd(t);
  setField(t, p, "url", "https://pay.example.com");
  await next(t, p);
  setField(t, p, "name", "Payroll");
  await pick(t, p, "group", "+ New group");
  assert.ok(!p.querySelector("[data-newgroup]").hidden, "the group name field shows");
  setField(t, p, "newGroup", "productivity");
  await save(t, p, { waitClosed: false });
  await settle(t.window, 100);
  assert.match(errorFor(p, "newGroup"), /already exists/);
  assert.ok(t.document.querySelector(".add-popup"), "still open");
  setField(t, p, "newGroup", "work");
  await save(t, p);
  const page = await openPage(t, "Essentials", "Payroll");
  assert.ok(text(page).includes("WORK"), "the new group, in capitals");
});

test("a missing address or name says why and saves nothing", async () => {
  const t = await openNewTab();
  const p = await openAdd(t);
  keydown(t, field(p, "url"), "Enter");
  await settle(t.window, 60);
  assert.match(errorFor(p, "url"), /URL/);
  assert.equal(titleOf(p), "Which website?", "stays on the first screen");
  setField(t, p, "url", "x.example.com");
  assert.equal(errorFor(p, "url"), "", "typing clears the message");
  await next(t, p);
  setField(t, p, "name", "");
  await save(t, p, { waitClosed: false });
  await settle(t.window, 100);
  assert.match(errorFor(p, "name"), /name/i);
  assert.ok(t.document.querySelector(".add-popup"), "still open");
});

test("typing offers the main address of sites you visit, most-visited first, and a pick goes to screen 2", async () => {
  const t = await openNewTab();
  await withHistory(t);
  const p = await openAdd(t);
  await waitFor(() => pills(p).length > 0, 2000, "pills for the empty field");
  assert.deepEqual(pills(p), ["netflix.com", "netlify.com", "bbc.co.uk"], "empty field: most-visited; main addresses only; no browser pages; google.com is already saved in the starter pages");
  setField(t, p, "url", "net");
  assert.deepEqual(pills(p), ["netflix.com", "netlify.com"]);
  assert.match(text(p.querySelector("[data-hint]")), /Enter picks netflix\.com/);
  keydown(t, field(p, "url"), "ArrowDown");
  assert.equal(p.querySelector('[data-site][aria-selected="true"]').dataset.site, "netlify.com", "arrows move the pick");
  assert.match(text(p.querySelector("[data-hint]")), /Enter picks netlify\.com/);
  click(t.window, p.querySelector('[data-site="netflix.com"]'));
  await settle(t.window, 40);
  assert.equal(titleOf(p), "Name and place");
  assert.equal(field(p, "name").value, "Netflix");
  await save(t, p);
  const page = await openPage(t, "Essentials", "Netflix");
  assert.equal([...page.querySelectorAll("a")].find((a) => text(a) === "Netflix").getAttribute("href"), "https://netflix.com");
});

test("Enter picks the highlighted site; sites already saved are not offered again", async () => {
  const t = await openNewTab();
  await withHistory(t);
  const p0 = await openAdd(t);
  setField(t, p0, "url", "net");
  keydown(t, field(p0, "url"), "Enter");
  await settle(t.window, 40);
  assert.equal(titleOf(p0), "Name and place", "Enter picked netflix.com");
  await save(t, p0);
  const p = await openAdd(t);
  await waitFor(() => pills(p).length > 0, 2000, "pills");
  assert.ok(!pills(p).includes("netflix.com"), "saved already");
  assert.ok(pills(p).includes("netlify.com"));
});

test("without history the popup still works: typing is all there is", async () => {
  const t = await openNewTab();
  const p = await openAdd(t);
  await settle(t.window, 60);
  assert.deepEqual(pills(p), []);
  assert.ok(p.querySelector('[data-drop="url"]').hidden, "no empty card under the field");
  setField(t, p, "url", "plain.example.com");
  assert.ok(!p.querySelector("[data-add-next]").disabled);
});

test("Page and Group are drop-downs; a page with many groups shows five and scrolls", async () => {
  const t = await openNewTab();
  const p = await openAdd(t);
  setField(t, p, "url", "drops.example.com");
  await next(t, p);
  await waitFor(() => p.querySelectorAll('[data-dd-item="group"]').length > 1, 2000, "groups");
  assert.ok(p.querySelector('[data-dd-menu="page"]').hidden, "closed at first");
  click(t.window, p.querySelector('[data-dd="page"]'));
  assert.ok(!p.querySelector('[data-dd-menu="page"]').hidden, "opens");
  const rows = [...p.querySelectorAll('[data-dd-item="page"]')].map(text);
  assert.ok(rows.includes("Essentials"));
  keydown(t, p.querySelector('[data-dd="page"]'), "Escape");
  assert.ok(p.querySelector('[data-dd-menu="page"]').hidden, "Escape closes the list only");
  assert.ok(t.document.querySelector(".add-popup"), "the popup stays");
  // Choosing another page lists that page's groups, and the first is chosen.
  const other = [...t.window.document.querySelectorAll("[data-dd-item=page]")].map(text).find((x) => x !== "Essentials");
  if (other) {
    await pick(t, p, "page", other);
    assert.equal(text(p.querySelector('[data-dd-label="page"]')), other);
  }
});

test("Cancel, Escape and the backdrop all close it without saving", async () => {
  const t = await openNewTab();
  const before = JSON.stringify(plain(await t.chrome.storage.sync.get(["activeTabs"])));
  for (const how of ["cancel", "escape", "backdrop"]) {
    const p = await openAdd(t);
    setField(t, p, "url", "not-saved.example.com");
    if (how === "cancel") click(t.window, p.querySelector("[data-add-cancel]"));
    if (how === "escape") keydown(t, field(p, "url"), "Escape");
    if (how === "backdrop") p.dispatchEvent(new t.window.MouseEvent("click", { bubbles: true }));
    await waitFor(() => !t.document.querySelector(".add-popup"), 2000, `${how} closes`);
  }
  assert.equal(JSON.stringify(plain(await t.chrome.storage.sync.get(["activeTabs"]))), before);
});
