// Right-click on the new tab asks the browser window to open the address bar for what was clicked
// (components/edit-in-bar/edit-in-bar.js). If the window answers, no pop-up opens; if nothing answers, the pop-up does.
// The window's side is in addbar_edit_flow.test.js. Deleting the page on screen from the bar is handled here too.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { openNewTab, openEssentials: openSharedEssentials, closeAll, waitFor, settle, click } = require("./helpers/newtabDom");

test.afterEach(closeAll);

const text = (el) => (el ? el.textContent.replace(/\s+/g, " ").trim() : "");
const contextMenu = (win, el) => el.dispatchEvent(new win.MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
const plain = (v) => JSON.parse(JSON.stringify(v));

/** A new tab whose window answers { ok: true } to the right-click message, recording what it was sent. */
async function openAnswered() {
  const t = await openNewTab();
  const sent = [];
  t.chrome.runtime.sendMessage = (msg, cb) => { sent.push(plain(msg)); if (cb) cb({ ok: true }); };
  t.sent = sent;
  return t;
}
const openEssentials = (tab) => openSharedEssentials(tab, { rememberPage: true });

test("right-click on a bookmark asks the window to open the bar for it, and no pop-up opens", async () => {
  const t = await openAnswered();
  const page = await openEssentials(t);
  contextMenu(t.window, page.querySelector(".bookmark-link"));
  await settle(t.window, 80);
  assert.deepEqual(t.sent, [{ atlas: { act: "edit-open", edit: { kind: "bookmark", page: t.essentials.id, group: "PRODUCTIVITY", name: "Notion", url: "https://notion.so" } } }]);
  assert.equal(t.document.querySelector(".bookmark-dialog"), null, "no pop-up over the blurred page");
  assert.deepEqual(t.errors, []);
});

test("right-click on a group's name asks for the group, with how many bookmarks it holds", async () => {
  const t = await openAnswered();
  const page = await openEssentials(t);
  contextMenu(t.window, page.querySelector(".group-title"));
  await settle(t.window, 80);
  assert.deepEqual(t.sent.map((m) => m.atlas.edit), [{ kind: "group", page: t.essentials.id, group: "PRODUCTIVITY", count: 3 }]);
  assert.equal(t.document.querySelector(".bookmark-dialog"), null);
});

test("right-click on empty space in a list asks for nothing", async () => {
  const t = await openAnswered();
  const page = await openEssentials(t);
  contextMenu(t.window, page.querySelector(".bookmark-list"));
  await settle(t.window, 80);
  assert.deepEqual(t.sent, []);
});

test("right-click on a page in the switcher asks for the page; Home is asked for as Home", async () => {
  const t = await openAnswered();
  const { window: win, document: doc } = t;
  click(win, doc.querySelector(".switcher-btn"));
  const item = (label) => [...doc.querySelectorAll(".switcher-item")].find((li) => li.textContent.includes(label));
  contextMenu(win, item("Essentials"));
  await settle(win, 80);
  const { activeTabs } = await t.chrome.storage.sync.get(["activeTabs"]);
  const essentials = activeTabs.find((p) => p.label === "Essentials");
  const edit = t.sent.at(-1).atlas.edit;
  assert.deepEqual([edit.kind, edit.id, edit.label, edit.type], ["page", essentials.id, "Essentials", "bookmarks"]);
  assert.ok(edit.sub && edit.name, "with the subtitle and the name the switcher shows");
  click(win, doc.querySelector(".switcher-btn"));
  contextMenu(win, item("Dashboard"));
  await settle(win, 80);
  assert.equal(t.sent.at(-1).atlas.edit.type, "search", "so the bar leaves out Delete");
  assert.equal(doc.querySelector(".bookmark-dialog"), null);
});

test("an unanswered or refused message falls back to the pop-up, so a right-click never does nothing", async () => {
  for (const reply of [undefined, {}, { ok: false }]) {
    const t = await openNewTab();
    t.chrome.runtime.sendMessage = (msg, cb) => { if (cb) cb(reply); };
    const page = await openEssentials(t);
    contextMenu(t.window, page.querySelector(".bookmark-link"));
    await settle(t.window, 80);
    assert.equal(text(t.document.querySelector(".bookmark-dialog .picker-title")), "Notion", `reply ${JSON.stringify(reply)}`);
    t.window.close();
  }
  const t = await openNewTab();
  t.chrome.runtime.sendMessage = () => { throw new Error("no extension runtime"); };
  const page = await openEssentials(t);
  contextMenu(t.window, page.querySelector(".group-title"));
  await settle(t.window, 80);
  assert.equal(text(t.document.querySelector(".bookmark-dialog .picker-title")), "PRODUCTIVITY", "even when sending throws");
});

test("when the page on screen is deleted from the bar, the new tab goes back to empty Home", async () => {
  const t = await openAnswered();
  await openEssentials(t);
  const { activeTabs } = await t.chrome.storage.sync.get(["activeTabs"]);
  await t.chrome.storage.sync.set({ activeTabs: activeTabs.filter((p) => p.id !== t.essentials.id) });   // what the worker does
  t.control.deliver({ atlas: { act: "data-changed" } });
  await waitFor(() => text(t.document.querySelector(".switcher-label")) === "Dashboard", 3000, "Home is selected");
  assert.ok(t.document.getElementById("home-page").classList.contains("active"), "and the empty Home page is on screen");
  assert.ok(!t.document.getElementById("bookmarks-page").classList.contains("active"), "no other page's bookmarks are");
  assert.ok(![...t.document.querySelectorAll("#tabs-container .switcher-item .label")].some((l) => l.textContent.includes("Essentials")), "the deleted page is gone from the switcher");
  assert.equal(t.document.getElementById("search-page"), null, "there is no Home page to fall back to");
  assert.deepEqual(t.errors, []);
});
