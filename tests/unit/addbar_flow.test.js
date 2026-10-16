// "Add bookmark" and "Add page" in the address bar (src/modules/23-addbar-core.js, 24-addbar-screens.js, 25-addbar-place.js):
// a field over the bar and a card under it, on whatever page you are on. The service worker's answers
// (background/addFlow.js) are played by a stand-in so each screen can be driven. Add group: addbar_group_flow.test.js.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { start, closeAll, wait, $, card, field, ask, step, pills, click, type, key, input, next, opened } = require("./helpers/addbarHarness");

test.afterEach(closeAll);

test("it opens over the address bar on any page: a small field, a card under it, the page dimmed", async () => {
  const w = await start({ rect: { left: 200, top: 10, width: 600, height: 30, right: 800, bottom: 40 } });
  await opened(w);
  assert.ok($(w, ".atlas-addscrim") && field(w) && card(w));
  assert.ok(w.window.document.getElementById("browser").classList.contains("atlas-add-open"));
  assert.equal(ask(w), "Type a website to bookmark, or pick one below", "an instruction in the bar, like the address bar's own");
  assert.equal(field(w).querySelector(".atlas-addchip"), null, "no 'Add bookmark 1/2' chip");
  assert.equal(step(w), "url");
  assert.equal(field(w).querySelector("[data-ab-back]"), null, "nothing to go back to on screen 1");
  assert.deepEqual([field(w).style.left, field(w).style.top, field(w).style.width], ["200px", "10px", "600px"], "the same place and width as the address field");
  assert.deepEqual([card(w).style.left, card(w).style.top, card(w).style.width], ["200px", "40px", "600px"], "the card hangs under it, 30px field");
  assert.equal(card(w).querySelector("button:not([data-ab-site])"), null, "screen 1 has no buttons: Enter or a pill moves on, Esc cancels");
  assert.match(card(w).textContent, /Esc cancels/);
  assert.deepEqual(w.errors, []);
});

test("it is never narrower than it can use, nor wider than the address bar's 620px", async () => {
  const w = await start({ rect: { left: 300, top: 10, width: 300, height: 30, right: 600, bottom: 40 } });
  await opened(w);
  assert.equal(field(w).style.width, "360px");
  assert.equal(field(w).style.left, "270px", "centred on the same middle");
  const wide = await start({ rect: { left: 100, top: 10, width: 800, height: 30, right: 900, bottom: 40 } });
  await opened(wide);
  assert.equal(field(wide).style.width, "620px");
  assert.equal(field(wide).style.left, "190px");
});

test("the first pill is the page you are on, then sites you visit; typing narrows them", async () => {
  const w = await start();
  await opened(w);
  assert.deepEqual(pills(w), ["example.com", "netflix.com", "reddit.com"]);
  assert.match(card(w).querySelector('[data-ab-site][aria-selected="true"]').textContent, /example\.com · this page/);
  assert.match(card(w).textContent, /Enter picks example\.com/);
  type(w, input(w), "net");
  await wait(150);
  assert.deepEqual(pills(w), ["example.com", "netflix.com", "netlify.com"]);
  assert.deepEqual(w.asked.filter((m) => m.action === "addSuggest").at(-1), { action: "addSuggest", db: "DetractlessBookmarks", typed: "net", thisUrl: "https://www.example.com/post" });
  key(w, input(w), "ArrowDown");
  assert.match(card(w).querySelector('[data-ab-site][aria-selected="true"]').textContent, /netflix\.com/, "arrows move the pick");
});

test("a pick goes to screen 2, named for the site, where only the name is asked", async () => {
  const w = await start();
  await opened(w);
  type(w, input(w), "netflix.com");
  await wait(120);
  key(w, input(w), "Enter");              // nothing picked yet but pills show: Enter takes the highlighted one
  await wait(150);
  assert.equal(step(w), "name");
  assert.equal(ask(w), "Name this bookmark, or pick a name below");
  assert.match(card(w).querySelector(".atlas-addhint").textContent, /^Name this bookmark, or pick a name above · Enter continues · Esc cancels$/);
  assert.equal(input(w).value, "Example", "the name is filled in from the pick");
  assert.ok(field(w).querySelector("[data-ab-back]"), "a small back arrow in the bar");
  assert.equal(card(w).querySelectorAll("[data-ab-dd], [data-ab-save]").length, 0, "the page and group are on the next screen");
  assert.deepEqual([...card(w).querySelectorAll("[data-ab-name]")].map((b) => b.textContent), ["Example", "Example.com"]);
});

test("screen 3 says where it goes: Page and Group, each named, with the first page and its first group", async () => {
  const w = await start();
  await opened(w);
  type(w, input(w), "netflix.com");
  await wait(120);
  key(w, input(w), "Enter");
  await wait(150);
  await next(w);                          // Enter on the name
  assert.equal(step(w), "place");
  assert.equal(input(w).value, "Example", "what is being added stays in the bar");
  assert.ok(input(w).readOnly, "nothing to type on this screen");
  assert.equal(field(w).querySelector(".atlas-addwhere").textContent, "example.com", "with its address beside it");
  assert.ok(field(w).querySelector("[data-ab-back]"));
  assert.deepEqual([...card(w).querySelectorAll(".atlas-addlbl")].map((l) => l.textContent), ["Page", "Group"], "labelled, not a guess");
  assert.equal(card(w).querySelector('[data-ab-dd="page"] span').textContent, "Home");
  assert.equal(card(w).querySelector('[data-ab-dd="group"] span').textContent, "SHOWS");
  assert.equal(card(w).querySelector("[data-ab-save]").textContent, "Add");
  assert.match(card(w).querySelector(".atlas-addhint").textContent, /^Enter adds · Esc cancels$/);
  assert.deepEqual(w.errors, []);
});

test("with an existing group, Enter on screen 3 saves at once", async () => {
  const w = await start({ thisUrl: "" });
  await opened(w);
  type(w, input(w), "netflix.com"); await wait(120); await next(w); await next(w); await wait(40);
  key(w, input(w), "Enter");
  await wait(80);
  assert.deepEqual(w.saved.bookmarks, [{ action: "addBookmark", db: "DetractlessBookmarks", name: "Netflix", url: "netflix.com", page: 11, group: "SHOWS" }]);
  assert.equal(card(w), null, "closed once saved");
});

test("Shift+Enter uses exactly what was typed, where Enter takes the highlighted pill", async () => {
  const save = async (w) => { await next(w); click(w, card(w).querySelector("[data-ab-save]")); await wait(80); return w.saved.bookmarks.map((b) => b.url); };   // the name, then Add on screen 3

  const plain = await start();
  await opened(plain);
  type(plain, input(plain), "reddit.com/r/cats");
  await wait(150);
  key(plain, input(plain), "Enter");
  await wait(150);
  assert.deepEqual(await save(plain), ["example.com"], "Enter: the highlighted pill, the typed path is dropped");

  const shift = await start();
  await opened(shift);
  type(shift, input(shift), "reddit.com/r/cats");
  await wait(150);
  assert.match(card(shift).querySelector(".atlas-addhint").textContent, /Enter picks example\.com · Shift\+Enter uses what you typed · /);
  key(shift, input(shift), "Enter", { shiftKey: true });
  await wait(150);
  assert.equal(step(shift), "name");
  assert.equal(input(shift).value, "Reddit", "the name comes from the typed address");
  assert.deepEqual(await save(shift), ["reddit.com/r/cats"], "Shift+Enter: the typed address, path and all");
});

test("the Shift+Enter hint waits for something typed, and an empty field still asks for an address", async () => {
  const w = await start();
  await opened(w);
  assert.doesNotMatch(card(w).textContent, /Shift\+Enter/);
  key(w, input(w), "Enter", { shiftKey: true });
  await wait(60);
  assert.equal(step(w), "url", "nothing typed, nothing to use");
  assert.equal(card(w).querySelector("[data-ab-error]").textContent, "Give the bookmark a URL.");
});

test("Back keeps what was typed, and a name you changed is kept", async () => {
  const w = await start({ thisUrl: "" });
  await opened(w);
  type(w, input(w), "netflix.com");
  await wait(120);
  await next(w);
  assert.equal(input(w).value, "Netflix");
  type(w, input(w), "Movie night");
  click(w, field(w).querySelector("[data-ab-back]"));
  await wait(60);
  assert.equal(step(w), "url");
  assert.equal(input(w).value, "netflix.com");
  await next(w);
  assert.equal(input(w).value, "Movie night");
  click(w, card(w).querySelector('[data-ab-name="Netflix.com"]'));
  assert.equal(input(w).value, "Netflix.com", "a name pill fills the name");
});

test("a refusal from the service worker is shown and the flow stays open", async () => {
  const w = await start({ thisUrl: "" });
  await opened(w);
  type(w, input(w), "netflix.com"); await wait(120); await next(w); await next(w); await wait(80);
  w.fail = { action: "addBookmark", reply: { error: "WORK already exists on this page." } };
  click(w, card(w).querySelector("[data-ab-save]"));
  await wait(80);
  assert.match(card(w).querySelector("[data-ab-error]").textContent, /already exists/);
  assert.equal(step(w), "place", "still on the same screen");
  click(w, field(w).querySelector("[data-ab-back]"));
  await wait(60);
  type(w, input(w), "");
  key(w, input(w), "Enter");
  assert.match(card(w).querySelector("[data-ab-error]").textContent, /name/i, "a missing name is caught on the name screen, before going on");
  assert.equal(step(w), "name");
});

test("Add page: its name, then a subtitle of three to five words", async () => {
  const w = await start();
  await opened(w, "page");
  assert.equal(ask(w), "Give the new page a name, like Streaming");
  assert.equal(field(w).querySelector(".atlas-addchip"), null, "no chip on the page screens either");
  assert.equal(step(w), "pageName");
  assert.match(card(w).textContent, /empty is Page 3/, "the default name, from the pages there are");
  type(w, input(w), "Gym");
  await next(w);
  assert.equal(step(w), "sub");
  assert.equal(ask(w), "Add a short subtitle, 3 to 5 words");
  type(w, input(w), "Lifting");
  assert.match(card(w).querySelector("[data-ab-count]").textContent, /1 of 3-5 words · 7 \/ 32/);
  click(w, card(w).querySelector("[data-ab-save]"));
  assert.match(card(w).querySelector("[data-ab-error]").textContent, /at least 3 words/);
  assert.equal(w.saved.pages.length, 0);
  type(w, input(w), "Workouts and meal plans");
  click(w, card(w).querySelector("[data-ab-save]"));
  await wait(80);
  assert.deepEqual(w.saved.pages, [{ action: "addPage", label: "Gym", sub: "Workouts and meal plans" }]);
  assert.equal(card(w), null);
});

test("Escape closes the drop-down first, then the flow; the backdrop, another tab and a new flow close it too", async () => {
  const w = await start({ thisUrl: "" });
  await opened(w);
  type(w, input(w), "netflix.com"); await wait(120); await next(w); await next(w); await wait(80);
  click(w, card(w).querySelector('[data-ab-dd="group"]'));
  w.window.document.dispatchEvent(new w.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  assert.ok(card(w), "the first Escape only closes the list");
  assert.ok(card(w).querySelector('[data-ab-menu="group"]').hidden);
  w.window.document.dispatchEvent(new w.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  assert.equal(card(w), null, "the second closes the flow");
  assert.equal(w.saved.bookmarks.length, 0, "nothing was saved");

  await opened(w);
  $(w, ".atlas-addscrim").dispatchEvent(new w.window.MouseEvent("mousedown", { bubbles: true, cancelable: true }));
  assert.equal(card(w), null, "clicking the dimmed page closes it");

  await opened(w);
  for (const fn of w.listeners["chrome.tabs.onActivated"] || []) fn({ tabId: 5 });
  assert.equal(card(w), null, "switching tabs closes it");

  await opened(w);
  await opened(w, "page");
  assert.equal(w.window.document.querySelectorAll(".atlas-addcard").length, 1, "only one flow at a time");
  assert.equal(ask(w), "Give the new page a name, like Streaming");
});

test("clicking a pill moves on, named for the pick", async () => {
  const w = await start();
  await opened(w);
  click(w, card(w).querySelector('[data-ab-site="netflix.com"]'));
  await wait(120);
  assert.equal(step(w), "name");
  assert.equal(input(w).value, "Netflix");
});

test("a screen that opens with text in it puts the cursor after the text, not before it", async () => {
  const w = await start({ thisUrl: "" });
  const atEnd = (label) => {
    const el = input(w);
    assert.equal(w.window.document.activeElement, el, `${label}: the field has the focus`);
    assert.deepEqual([el.selectionStart, el.selectionEnd], [el.value.length, el.value.length], `${label}: the cursor is after "${el.value}"`);
  };
  await opened(w);
  click(w, card(w).querySelector('[data-ab-site="netflix.com"]'));
  await wait(120);
  atEnd("the name, filled in from the pick");
  await next(w);
  click(w, field(w).querySelector("[data-ab-back]"));
  await wait(60);
  atEnd("the name again, after Back");
  click(w, field(w).querySelector("[data-ab-back]"));
  await wait(60);
  assert.equal(step(w), "url");
  atEnd("the address, after Back");
});
