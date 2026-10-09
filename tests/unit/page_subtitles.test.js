// Page subtitles: every page carries a short line under its name in the page
// switcher. The rule lives in src/services/pageSubtitle.js; the switcher, the
// page dialog and the new-page prompt use it.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const esbuild = require("esbuild");
const { openNewTab, closeAll, waitFor, settle, click, pressEnter } = require("./helpers/newtabDom");

test.afterEach(closeAll);

const RULE = path.join(__dirname, "..", "..", "payload", "detractless", "src", "services", "pageSubtitle.js");
const plain = (v) => JSON.parse(JSON.stringify(v));
const text = (el) => (el ? el.textContent.replace(/\s+/g, " ").trim() : "");

/** The ES module, bundled to CommonJS so a plain Node test can call it. */
function loadRule() {
  const out = esbuild.buildSync({ entryPoints: [RULE], bundle: true, format: "cjs", platform: "node", write: false });
  const mod = { exports: {} };
  new Function("module", "exports", out.outputFiles[0].text)(mod, mod.exports);
  return mod.exports;
}

const PAGES = [
  { id: "search", label: "Home", type: "search" },
  { id: 1, label: "College", type: "bookmarks" },
  { id: 2, label: "Work", type: "bookmarks", sub: "Shifts and pay stubs" },
];
const seeded = () => openNewTab({ local: { hasSeededDefaults: true }, sync: { activeTabs: PAGES } });

const items = (doc) => [...doc.querySelectorAll("#tabs-container .switcher-item")];
const subs = (doc) => items(doc).map((li) => text(li.querySelector(".sub")));
const item = (doc, name) => items(doc).find((li) => li.querySelector(".label").firstChild.textContent === name);
const stored = async (t) => plain((await t.chrome.storage.sync.get(["activeTabs"])).activeTabs);

function rightClick(win, el) {
  el.dispatchEvent(new win.MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
}

/** The open dialog pane titled `title` (a dialog keeps all its panes in the DOM). */
function pane(doc, title) {
  return [...doc.querySelectorAll(".bookmark-dialog .picker-pane")].find((p) => text(p.querySelector(".picker-title")) === title);
}

async function answer(win, title, value) {
  const p = await waitFor(() => pane(win.document, title), 3000, `pane "${title}"`);
  const field = p.querySelector(".picker-field");
  field.value = value;
  pressEnter(win, field);
  await settle(win, 50);
  return p;
}

test("the subtitle rule: 3 to 5 words that fit the switcher", () => {
  const r = loadRule();
  for (const ok of ["Everything at a glance", "Your saved links here", "Classes and due dates", "Shifts and pay stubs", "One two three", "One two three four five"]) {
    assert.equal(r.subtitleProblem(ok), null, ok);
    assert.equal(r.validSubtitle(ok), true, ok);
  }
  for (const bad of ["", "   ", "Classes", "Two words", "one two three four five six", "Extraordinarily comprehensive internationalization resources"]) {
    assert.equal(typeof r.subtitleProblem(bad), "string", `rejects "${bad}"`);
    assert.equal(r.validSubtitle(bad), false, bad);
  }
  assert.equal(r.cleanSubtitle("  Classes   and  due dates "), "Classes and due dates");
  assert.equal(r.validSubtitle("  Classes   and  due dates "), true, "spaces are tidied, not counted");
  assert.equal(r.starterSubtitle({ type: "search" }), "Everything at a glance");
  assert.equal(r.validSubtitle(r.starterSubtitle({ type: "bookmarks" })), true, "the starter subtitle passes its own rule");
});

test("every page shows a subtitle in the switcher, Home included", async () => {
  const t = await openNewTab();
  assert.deepEqual(subs(t.document), ["Everything at a glance", "Your saved links here", "Your saved links here"]);
  assert.deepEqual(t.errors, []);
});

test("pages saved without a subtitle get the starter one; existing subtitles stay", async () => {
  const t = await seeded();
  assert.deepEqual(subs(t.document), ["Everything at a glance", "Your saved links here", "Shifts and pay stubs"]);
  const pages = await stored(t);
  assert.deepEqual(pages.map((p) => p.sub), ["Everything at a glance", "Your saved links here", "Shifts and pay stubs"], "saved, so it sticks");
  assert.deepEqual(pages.map((p) => p.label), ["Home", "College", "Work"], "names and order unchanged");
  assert.deepEqual(t.errors, []);
});

test("the page dialog edits the subtitle; an invalid one says why and saves nothing", async () => {
  const t = await seeded();
  const { window: win, document: doc } = t;
  rightClick(win, item(doc, "College"));
  const root = await waitFor(() => pane(doc, "College"), 3000, "College dialog");
  click(win, [...root.querySelectorAll(".picker-row")].find((r) => text(r).startsWith("Edit subtitle")));

  const p = await answer(win, "Edit subtitle", "Hi");
  assert.match(text(p.querySelector(".picker-error")), /at least 3 words/);
  assert.equal((await stored(t))[1].sub, "Your saved links here", "nothing saved");

  await answer(win, "Edit subtitle", "Classes and due dates");
  await waitFor(() => !doc.querySelector(".bookmark-dialog"), 2000, "dialog closes");
  assert.equal((await stored(t))[1].sub, "Classes and due dates");
  assert.equal(subs(doc)[1], "Classes and due dates");
  assert.deepEqual(t.errors, []);
});

test("Home's subtitle can be edited too, and Home can't be deleted", async () => {
  const t = await seeded();
  const { window: win, document: doc } = t;
  rightClick(win, item(doc, "Dashboard")); // Home shows as "Dashboard" until renamed
  const root = await waitFor(() => pane(doc, "Dashboard"), 3000, "Home dialog");
  const rows = [...root.querySelectorAll(".picker-row")].map(text);
  assert.ok(rows.some((r) => r.startsWith("Edit subtitle")), rows.join(", "));
  assert.ok(!rows.some((r) => r.startsWith("Delete")), "no Delete for Home");
  click(win, [...root.querySelectorAll(".picker-row")].find((r) => text(r).startsWith("Edit subtitle")));
  await answer(win, "Edit subtitle", "Start every day here");
  assert.equal((await stored(t))[0].sub, "Start every day here");
});

/** The add popup (components/addPopup), switched to Page mode. */
async function pagePopup(win, doc) {
  click(win, doc.getElementById("global-add-btn"));
  const p = await waitFor(() => doc.querySelector(".add-popup"), 2000, "add popup");
  click(win, p.querySelector('[data-add-mode="page"]'));
  return p;
}
function setField(win, p, name, value) {
  const el = p.querySelector(`[data-field="${name}"]`);
  el.value = value;
  el.dispatchEvent(new win.Event("input", { bubbles: true }));
}

test("a new page needs a name and a valid subtitle", async () => {
  const t = await seeded();
  const { window: win, document: doc } = t;
  const p = await pagePopup(win, doc);
  setField(win, p, "pageName", "Gym");
  setField(win, p, "sub", "Lifting");
  click(win, p.querySelector("[data-add-save]"));
  await settle(win, 100);
  assert.match(text(p.querySelector('[data-error-for="sub"]')), /at least 3 words/);
  assert.equal((await stored(t)).length, 3, "no page yet");

  setField(win, p, "sub", "Workouts and meal plans");
  click(win, p.querySelector("[data-add-save]"));
  await settle(win, 200);
  const page = (await stored(t))[3];
  assert.equal(page.label, "Gym");
  assert.equal(page.sub, "Workouts and meal plans");
  assert.equal(subs(doc)[3], "Workouts and meal plans");
  assert.deepEqual(t.errors, []);
});

test("closing the popup in Page mode creates no page", async () => {
  const t = await seeded();
  const { window: win, document: doc } = t;
  const p = await pagePopup(win, doc);
  setField(win, p, "pageName", "Gym");
  setField(win, p, "sub", "Workouts and meal plans");
  click(win, p.querySelector("[data-add-cancel]"));
  await settle(win, 100);
  assert.equal((await stored(t)).length, 3);
});
