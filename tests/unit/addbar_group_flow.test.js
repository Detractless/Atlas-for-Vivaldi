// "Add group" in the address bar, and the group choices of Add bookmark (src/modules/23-addbar-core.js,
// 24-addbar-screens.js, 25-addbar-place.js): the group's name, then its page; a page with no groups says
// "None yet" and offers Add group, which comes back to the bookmark. The worker's answers are a stand-in
// (helpers/addbarHarness.js); the real worker is tested in addbar_worker.test.js.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { start, closeAll, wait, card, field, ask, step, click, type, key, input, next, opened } = require("./helpers/addbarHarness");

test.afterEach(closeAll);

test("Add group: its name, then its page, and Add sends the group and closes", async () => {
  const w = await start();
  await opened(w, "group");
  assert.equal(ask(w), "Name the new group, like Streaming");
  assert.equal(step(w), "groupName");
  assert.equal(card(w).getAttribute("aria-label"), "Add group");
  assert.equal(field(w).querySelector("[data-ab-back]"), null, "nothing to go back to on screen 1");
  assert.equal(card(w).querySelector(".atlas-addhint").textContent, "Enter continues · Esc cancels");
  await next(w);
  assert.equal(card(w).querySelector("[data-ab-error]").textContent, "Give the new group a name.", "an empty name asks for one");
  assert.equal(step(w), "groupName");
  type(w, input(w), "movies");
  await next(w);
  assert.equal(step(w), "place");
  assert.equal(input(w).value, "movies", "the name stays in the bar");
  assert.ok(input(w).readOnly);
  assert.ok(field(w).querySelector("[data-ab-back]"));
  assert.deepEqual([...card(w).querySelectorAll(".atlas-addlbl")].map((l) => l.textContent), ["Page"], "only the page is asked");
  assert.equal(card(w).querySelector('[data-ab-dd="group"]'), null);
  assert.equal(card(w).querySelector('[data-ab-dd="page"] span').textContent, "Home");
  assert.equal(card(w).querySelector("[data-ab-save]").textContent, "Add");
  assert.match(card(w).querySelector(".atlas-addhint").textContent, /^Enter adds the group · Esc cancels$/);
  click(w, card(w).querySelector('[data-ab-dd="page"]'));
  click(w, [...card(w).querySelectorAll('[data-ab-item="page"]')].find((b) => b.textContent === "Streaming"));
  click(w, card(w).querySelector("[data-ab-save]"));
  await wait(80);
  assert.deepEqual(w.saved.groups, [{ action: "addGroup", db: "DetractlessBookmarks", page: 12, group: "MOVIES" }], "saved in capitals, on the chosen page");
  assert.equal(card(w), null, "closed once saved");
  assert.ok(!w.window.document.getElementById("browser").classList.contains("atlas-add-open"));
  assert.deepEqual(w.errors, []);
});

test("Add group: a name the page already has is refused on screen 2, where it can be changed", async () => {
  const w = await start();
  await opened(w, "group");
  type(w, input(w), "work");
  await next(w);
  w.fail = { action: "addGroup", reply: { error: "WORK already exists on this page." } };
  click(w, card(w).querySelector("[data-ab-save]"));
  await wait(80);
  assert.match(card(w).querySelector("[data-ab-error]").textContent, /WORK already exists/);
  assert.equal(step(w), "place", "still open, on the same screen");
  assert.equal(w.saved.groups.length, 0);
  click(w, field(w).querySelector("[data-ab-back]"));
  await wait(60);
  assert.equal(step(w), "groupName");
  assert.equal(input(w).value, "work", "what was typed is kept");
  w.fail = null;
  type(w, input(w), "gym");
  await next(w);
  click(w, card(w).querySelector("[data-ab-save]"));
  await wait(80);
  assert.deepEqual(w.saved.groups.map((g) => g.group), ["GYM"]);
  assert.equal(card(w), null);
});

test("Add group with no page to put it on says so", async () => {
  const w = await start({ pages: [] });
  await opened(w, "group");
  type(w, input(w), "movies");
  await next(w);
  click(w, card(w).querySelector("[data-ab-save]"));
  assert.match(card(w).querySelector("[data-ab-error]").textContent, /Add a page first, then a group/);
  assert.equal(step(w), "place");
  assert.equal(w.saved.groups.length, 0);
});

test("Back goes one screen at a time, and each screen keeps what you chose", async () => {
  const w = await start({ thisUrl: "" });
  await opened(w);
  type(w, input(w), "netflix.com"); await wait(120); await next(w); await next(w); await wait(80);
  click(w, card(w).querySelector('[data-ab-dd="group"]'));
  click(w, [...card(w).querySelectorAll('[data-ab-item="group"]')].find((b) => b.textContent === "WORK"));
  const back = async () => { click(w, field(w).querySelector("[data-ab-back]")); await wait(60); };
  await back();
  assert.equal(step(w), "name");
  assert.equal(input(w).value, "Netflix");
  await next(w);
  assert.equal(card(w).querySelector('[data-ab-dd="group"] span').textContent, "WORK", "the group you chose is kept");
  await back(); await back();
  assert.equal(step(w), "url");
  assert.equal(input(w).value, "netflix.com");
  assert.equal(w.saved.bookmarks.length, 0, "nothing was saved on the way");

  await opened(w, "group");
  type(w, input(w), "movies"); await next(w);
  await back();
  assert.equal(step(w), "groupName");
  assert.equal(input(w).value, "movies", "Add group's screen 2 goes back to its name");
});

test("a page with no groups says None yet; Add group makes one and comes back to screen 3 with it chosen", async () => {
  const w = await start({ thisUrl: "", groups: { 11: [], 12: [] } });
  await opened(w);
  type(w, input(w), "netflix.com"); await wait(120); await next(w); await next(w); await wait(80);
  assert.equal(step(w), "place");
  assert.equal(card(w).querySelector(".atlas-addnone").textContent, "None yet");
  assert.equal(card(w).querySelector('[data-ab-dd="group"]'), null, "there is nothing to choose from");
  assert.equal(card(w).querySelector("[data-ab-save]").textContent, "Add group");
  assert.match(card(w).querySelector(".atlas-addhint").textContent, /^Home has no groups yet · Enter adds a group$/);
  click(w, card(w).querySelector("[data-ab-save]"));
  assert.equal(step(w), "groupName", "the Add group flow, in the same bar");
  assert.equal(ask(w), "Name the new group, like Streaming");
  assert.equal(card(w).getAttribute("aria-label"), "Add group");
  assert.ok(field(w).querySelector("[data-ab-back]"), "with a way back to the bookmark");
  assert.equal(w.saved.bookmarks.length + w.saved.groups.length, 0);
  type(w, input(w), "watch");
  await next(w);
  assert.equal(step(w), "place");
  assert.deepEqual([...card(w).querySelectorAll(".atlas-addlbl")].map((l) => l.textContent), ["Page"]);
  click(w, card(w).querySelector("[data-ab-save]"));
  await wait(120);
  assert.deepEqual(w.saved.groups, [{ action: "addGroup", db: "DetractlessBookmarks", page: 11, group: "WATCH" }]);
  assert.ok(card(w), "the flow is still open");
  assert.equal(card(w).getAttribute("aria-label"), "Add bookmark", "back on the bookmark");
  assert.equal(step(w), "place");
  assert.equal(input(w).value, "Netflix", "with what was typed kept");
  assert.deepEqual([...card(w).querySelectorAll(".atlas-addlbl")].map((l) => l.textContent), ["Page", "Group"]);
  assert.equal(card(w).querySelector('[data-ab-dd="group"] span').textContent, "WATCH", "the new group is chosen");
  assert.equal(card(w).querySelector("[data-ab-save]").textContent, "Add");
  assert.equal(w.saved.bookmarks.length, 0, "the bookmark is not saved until Add");
  click(w, card(w).querySelector("[data-ab-save]"));
  await wait(80);
  assert.deepEqual(w.saved.bookmarks, [{ action: "addBookmark", db: "DetractlessBookmarks", name: "Netflix", url: "netflix.com", page: 11, group: "WATCH" }]);
  assert.equal(card(w), null, "closed once saved");
  assert.deepEqual(w.errors, []);
});

test("Back out of a group started from Add bookmark returns to its screen 3", async () => {
  const w = await start({ thisUrl: "", groups: { 11: [], 12: [] } });
  await opened(w);
  type(w, input(w), "netflix.com"); await wait(120); await next(w); await next(w); await wait(80);
  click(w, card(w).querySelector("[data-ab-save]"));
  assert.equal(step(w), "groupName");
  click(w, field(w).querySelector("[data-ab-back]"));
  assert.equal(step(w), "place");
  assert.equal(card(w).getAttribute("aria-label"), "Add bookmark");
  assert.equal(card(w).querySelector(".atlas-addnone").textContent, "None yet");
  assert.equal(w.saved.groups.length, 0);
});

test("with no page to put it on, screen 3 says so instead of moving on", async () => {
  const w = await start({ thisUrl: "", pages: [] });
  await opened(w);
  type(w, input(w), "netflix.com"); await wait(120); await next(w); await next(w); await wait(80);
  assert.equal(step(w), "place");
  assert.equal(card(w).querySelector(".atlas-addnone").textContent, "None yet");
  assert.equal(card(w).querySelector("[data-ab-save]").textContent, "Add", "no page, so no group can be made either");
  click(w, card(w).querySelector("[data-ab-save]"));
  assert.match(card(w).querySelector("[data-ab-error]").textContent, /Add a page first/);
  assert.equal(step(w), "place");
});
