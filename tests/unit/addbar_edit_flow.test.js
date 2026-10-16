// Right-click on the new tab, in the address bar (src/modules/26-addbar-edit.js, opened by the message in
// 04-bridge-messages.js): the bar names what was clicked and offers pills; picking one turns the bar into that job.
// The worker's answers are a stand-in (helpers/addbarHarness.js); the real worker is tested in addbar_edit_worker.test.js.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { start, closeAll, wait, card, field, step, click, type, key, input } = require("./helpers/addbarHarness");

test.afterEach(closeAll);

const DB = "DetractlessBookmarks";
const BOOKMARK = { kind: "bookmark", page: 11, group: "WORK", name: "Slack", url: "https://slack.com/team" };
const GROUP = { kind: "group", page: 11, group: "WORK", count: 3 };
const PAGE = { kind: "page", id: 12, label: "Streaming", name: "Streaming", sub: "Shows and movies", type: "bookmarks" };
const HOME = { kind: "page", id: "search", label: "Home", name: "Home", sub: "Search and shortcuts", type: "search" };

const pills = (w) => [...card(w).querySelectorAll("[data-ab-job]")].map((b) => b.textContent);
const picked = (w) => card(w).querySelector('[data-ab-job][aria-selected="true"]').textContent;
const hint = (w) => card(w).querySelector(".atlas-addhint").textContent;
const error = (w) => card(w).querySelector("[data-ab-error]").textContent;
const pickPill = async (w, label) => { click(w, [...card(w).querySelectorAll("[data-ab-job]")].find((b) => b.textContent === label)); await wait(40); };
async function edit(w, what) { w.window.__Atlas.openEdit(what); await wait(100); }

test("a bookmark: the bar names it with its address, and the pills are Rename, Edit URL, Delete", async () => {
  const w = await start();
  await edit(w, BOOKMARK);
  assert.equal(card(w).getAttribute("aria-label"), "Edit");
  assert.equal(step(w), "editPick");
  assert.equal(input(w).value, "Slack");
  assert.ok(input(w).readOnly, "nothing to type until a job is picked");
  assert.equal(field(w).querySelector(".atlas-addwhere").textContent, "slack.com/team", "its address beside it");
  assert.equal(field(w).querySelector("[data-ab-back]"), null, "nothing to go back to");
  assert.deepEqual(pills(w), ["Rename", "Edit URL", "Delete"]);
  assert.equal(picked(w), "Rename");
  assert.equal(hint(w), "Enter picks Rename · ←→ to move · Esc cancels");
  key(w, input(w), "ArrowRight");
  assert.equal(picked(w), "Edit URL", "the arrow keys move the pick");
  assert.equal(hint(w), "Enter picks Edit URL · ←→ to move · Esc cancels");
  key(w, input(w), "ArrowLeft"); key(w, input(w), "ArrowLeft");
  assert.equal(picked(w), "Delete", "and wrap round");
  assert.deepEqual(w.errors, []);
});

test("Rename: the bar becomes the text box, and Enter saves through the worker and closes", async () => {
  const w = await start();
  await edit(w, BOOKMARK);
  key(w, input(w), "Enter");
  assert.equal(step(w), "editValue");
  assert.equal(input(w).placeholder, "Name this bookmark");
  assert.equal(input(w).value, "Slack");
  assert.ok(!input(w).readOnly);
  assert.ok(field(w).querySelector("[data-ab-back]"), "a way back to the pills");
  type(w, input(w), "Slack HQ");
  key(w, input(w), "Enter");
  await wait(80);
  assert.deepEqual(w.saved.edits, [{ action: "editBookmark", db: DB, page: 11, group: "WORK", name: "Slack", url: "https://slack.com/team", op: "rename", value: "Slack HQ" }]);
  assert.equal(card(w), null, "closed once saved");
  assert.deepEqual(w.errors, []);
});

test("Edit URL starts from the whole address and saves with the Save button", async () => {
  const w = await start();
  await edit(w, BOOKMARK);
  await pickPill(w, "Edit URL");
  assert.equal(input(w).value, "https://slack.com/team");
  assert.equal(input(w).placeholder, "Address, like example.com");
  type(w, input(w), "slack.com/other");
  click(w, card(w).querySelector("[data-ab-save]"));
  await wait(80);
  assert.deepEqual(w.saved.edits.map((e) => [e.op, e.value]), [["url", "slack.com/other"]]);
  assert.equal(card(w), null);
});

test("Delete asks first: Cancel goes back, a held Enter does nothing, and a press deletes", async () => {
  const w = await start();
  await edit(w, BOOKMARK);
  key(w, input(w), "ArrowLeft");
  key(w, input(w), "Enter");
  assert.equal(step(w), "editDelete");
  assert.equal(input(w).value, "Delete Slack?");
  assert.ok(input(w).readOnly);
  assert.equal(hint(w), "It goes for good · Enter deletes · Esc cancels");
  assert.deepEqual([...card(w).querySelectorAll(".atlas-addbtn")].map((b) => b.textContent), ["Cancel", "Delete"]);
  assert.equal(w.saved.edits.length, 0, "picking Delete deletes nothing");
  click(w, card(w).querySelector("[data-ab-cancel]"));
  assert.equal(step(w), "editPick", "Cancel returns to the pills");
  assert.equal(picked(w), "Delete", "with Delete still the pick");
  key(w, input(w), "Enter");
  key(w, input(w), "Enter", { repeat: true });
  await wait(60);
  assert.equal(w.saved.edits.length, 0, "a held Enter is ignored");
  key(w, input(w), "Enter");
  await wait(80);
  assert.deepEqual(w.saved.edits.map((e) => e.op), ["delete"]);
  assert.equal(card(w), null);
});

test("a refusal from the worker is shown in the bar, which stays open", async () => {
  const w = await start();
  await edit(w, BOOKMARK);
  key(w, input(w), "Enter");
  w.fail = { action: "editBookmark", reply: { error: "That bookmark is not there any more." } };
  key(w, input(w), "Enter");
  await wait(80);
  assert.match(error(w), /not there any more/);
  assert.equal(step(w), "editValue");
  click(w, field(w).querySelector("[data-ab-back]"));
  assert.equal(step(w), "editPick");
});

test("a group: Rename, Move to page, Delete group; moving offers every other page", async () => {
  const w = await start();
  await edit(w, GROUP);
  assert.deepEqual(pills(w), ["Rename", "Move to page", "Delete group"]);
  assert.equal(input(w).value, "WORK");
  assert.equal(field(w).querySelector(".atlas-addwhere").textContent, "3 bookmarks");
  await pickPill(w, "Rename");
  assert.equal(input(w).placeholder, "Name this group");
  type(w, input(w), "jobs");
  key(w, input(w), "Enter");
  await wait(80);
  assert.deepEqual(w.saved.edits[0], { action: "editGroup", db: DB, page: 11, group: "WORK", op: "rename", value: "jobs" });

  await edit(w, GROUP);
  await pickPill(w, "Move to page");
  assert.equal(step(w), "editMove");
  assert.equal(card(w).querySelector(".atlas-addlbl").textContent, "Page");
  assert.equal(card(w).querySelector('[data-ab-dd="page"] span').textContent, "Streaming", "the other page, not this one");
  assert.equal(card(w).querySelector("[data-ab-save]").textContent, "Move");
  assert.match(hint(w), /^Moves the group, with its bookmarks · Enter moves · Esc cancels$/);
  click(w, card(w).querySelector("[data-ab-save]"));
  await wait(80);
  assert.deepEqual(w.saved.edits[1], { action: "editGroup", db: DB, page: 11, group: "WORK", op: "move", value: "", to: 12 });
  assert.equal(card(w), null);
});

test("a group with nowhere to move to says so, and Delete group names how many bookmarks go", async () => {
  const w = await start({ pages: [{ id: 11, label: "Home" }] });
  await edit(w, GROUP);
  await pickPill(w, "Move to page");
  assert.match(hint(w), /^There is only one page, so there is nowhere to move it/);
  assert.equal(card(w).querySelector("[data-ab-save]"), null, "no button to press");
  click(w, field(w).querySelector("[data-ab-back]"));
  await pickPill(w, "Delete group");
  assert.equal(input(w).value, "Delete WORK and its 3 bookmarks?");
  await edit(w, { ...GROUP, count: 1 });
  await pickPill(w, "Delete group");
  assert.equal(input(w).value, "Delete WORK and its bookmark?");
  await edit(w, { ...GROUP, count: 0 });
  await pickPill(w, "Delete group");
  assert.equal(input(w).value, "Delete WORK?", "an empty group has no bookmarks to name");
});

test("a page: Rename, Subtitle, Move, Delete; Home has no Move or Delete", async () => {
  const w = await start();
  await edit(w, PAGE);
  assert.deepEqual(pills(w), ["Rename", "Subtitle", "Move", "Delete"]);
  assert.equal(field(w).querySelector(".atlas-addwhere").textContent, "Page");
  await pickPill(w, "Subtitle");
  assert.equal(input(w).value, "Shows and movies");
  assert.match(card(w).querySelector("[data-ab-count]").textContent, /^3 of 3-5 words/, "the same counter as Add page");
  type(w, input(w), "Lifting");
  assert.match(card(w).querySelector("[data-ab-count]").textContent, /^1 of 3-5 words/);
  key(w, input(w), "Enter");
  await wait(80);
  assert.deepEqual(w.saved.edits[0], { action: "editPage", db: DB, id: 12, op: "sub", value: "Lifting" });

  await edit(w, PAGE);
  key(w, input(w), "ArrowLeft");
  key(w, input(w), "Enter");
  key(w, input(w), "Enter");
  await wait(80);
  assert.deepEqual(w.saved.edits[1], { action: "editPage", db: DB, id: 12, op: "delete", value: "" });

  await edit(w, HOME);
  assert.deepEqual(pills(w), ["Rename", "Subtitle"], "Home can't be moved or deleted: it always stays first");
});

test("a page's Move: After offers Home and the other pages, starts where the page is now, and sends where it goes", async () => {
  const w = await start({ pages: [{ id: 11, label: "Essentials" }, { id: 12, label: "Streaming" }, { id: 13, label: "Work" }] });
  const after = () => card(w).querySelector('[data-ab-dd="page"] span').textContent;
  await edit(w, PAGE);
  await pickPill(w, "Move");
  assert.equal(step(w), "editMove");
  assert.equal(card(w).querySelector(".atlas-addlbl").textContent, "After");
  assert.equal(after(), "Essentials", "Streaming is after Essentials now");
  assert.match(hint(w), /^Home always stays first · Enter moves · Esc cancels$/);
  assert.equal(card(w).querySelector("[data-ab-save]").textContent, "Move");
  click(w, card(w).querySelector('[data-ab-dd="page"]'));
  assert.deepEqual([...card(w).querySelectorAll('[data-ab-item="page"]')].map((b) => b.textContent), ["Home", "Essentials", "Work"], "every page but itself");
  click(w, card(w).querySelector('[data-ab-item="page"][data-value=""]'));
  assert.equal(after(), "Home");
  key(w, input(w), "Enter");
  await wait(80);
  assert.deepEqual(w.saved.edits[0], { action: "editPage", db: DB, id: 12, op: "move", value: "", after: "" }, "after Home: first");
  assert.equal(card(w), null);

  await edit(w, { ...PAGE, id: 11, label: "Essentials", name: "Essentials" });
  await pickPill(w, "Move");
  assert.equal(after(), "Home", "the first page starts after Home");
  click(w, card(w).querySelector('[data-ab-dd="page"]'));
  click(w, card(w).querySelector('[data-ab-item="page"][data-value="13"]'));
  click(w, card(w).querySelector("[data-ab-save]"));
  await wait(80);
  assert.deepEqual(w.saved.edits[1], { action: "editPage", db: DB, id: 11, op: "move", value: "", after: "13" });
});

test("the new tab's message opens the bar in its own window only, and says it did", async () => {
  const w = await start();
  w.window.vivaldiWindowId = 5;
  const elsewhere = w.control.deliver({ atlas: { act: "edit-open", edit: BOOKMARK } }, { tab: { windowId: 9 } });
  await wait(60);
  assert.equal(card(w), null, "another window's tab is not ours");
  assert.deepEqual(elsewhere, []);
  const mine = w.control.deliver({ atlas: { act: "edit-open", edit: BOOKMARK } }, { tab: { windowId: 5 } });
  await wait(100);
  assert.deepEqual(JSON.parse(JSON.stringify(mine)), [{ ok: true }], "it answers, so the tab does not open its own pop-up");
  assert.equal(step(w), "editPick");
  assert.equal(input(w).value, "Slack");
  assert.deepEqual(w.errors, []);
});
