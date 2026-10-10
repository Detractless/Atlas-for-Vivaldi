// The address bar's engine logo shows once you type (19-addressbar-engine-picker.js,
// abeUntouched): clicking into a web page's address keeps Vivaldi's own icon,
// the lock; anything typed, words or notion.com alike, shows the logo and it
// stays, with no swap to Vivaldi's engine icon. Esc putting the address back
// brings the lock back. An empty field shows the logo.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { openWindow } = require("./helpers/windowDom");

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let open = [];
test.afterEach(() => { for (const w of open) w.window.close(); open = []; });

const NEWTAB = "chrome-extension://mpognobbkildjkofajifpdfhcoklimli/index.html";
const PAGE = "https://docs.google.com/document/d/1Xq7/edit";
const ENGINES = { google: { name: "Google", url: "https://www.google.com/search?q=", icon: "src/assets/svg/google.com.svg" } };

async function start(value = "") {
  const w = await openWindow({ sync: { customSearchEngines: ENGINES, defaultEngineKey: "google" } });
  open.push(w);
  w.window.document.getElementById("browser").insertAdjacentHTML("beforeend",
    '<div class="toolbar-mainbar"><div class="UrlBar-AddressField">' +
    '<div class="toolbar toolbar-small toolbar-insideinput"><button class="button-addressfield SiteInfoButton web"></button></div>' +
    '<div class="UrlBar-UrlFieldWrapper"><input class="UrlBar-UrlField url vivaldi-addressfield"></div></div></div>');
  w.input = w.window.document.querySelector(".UrlBar-AddressField input.url");
  w.input.value = value;
  return w;
}
/* Into the field; `then` runs as Vivaldi's own focus handling would, before the page settles. */
async function focus(w, then) {
  w.input.focus();
  w.input.dispatchEvent(new w.window.FocusEvent("focusin", { bubbles: true }));
  if (then) then();
  await wait(40);
}
function type(w, text) {
  w.input.value = text;
  w.input.dispatchEvent(new w.window.Event("input", { bubbles: true }));
}
function keyup(w, key) {
  w.input.dispatchEvent(new w.window.KeyboardEvent("keyup", { key, bubbles: true }));
}
const btn = (w) => w.window.document.querySelector(".atlas-enginebtn");
const browserHas = (w, c) => w.window.document.getElementById("browser").classList.contains(c);
/* The engine logo is showing, and Vivaldi's own icon is hidden under it. */
const logo = (w) => !!btn(w) && !btn(w).hidden && browserHas(w, "atlas-enginebtn-on");

test("clicking into a web page's address keeps Vivaldi's icon", async () => {
  const w = await start(PAGE);
  await focus(w);
  assert.equal(logo(w), false, "the page's own address: the lock");
  assert.ok(!browserHas(w, "atlas-enginebtn-inuse"));
  keyup(w, "ArrowRight");
  assert.equal(logo(w), false, "moving the cursor isn't typing");
  assert.deepEqual(w.errors, []);
});

test("once you type, the logo shows and stays, words or an address alike", async () => {
  const w = await start(PAGE);
  await focus(w);
  for (const text of ["n", "notion", "notion.", "notion.c", "notion.com", "notion.com/page",
    "https://example.com", "192.168.1.1", "localhost:3000", "how to cook rice"]) {
    type(w, text);
    keyup(w, text.slice(-1));
    assert.equal(logo(w), true, `"${text}": the logo, no swap`);
    assert.ok(browserHas(w, "atlas-enginebtn-inuse"));
  }
  type(w, "");
  assert.equal(logo(w), true, "emptied: the logo");
  assert.deepEqual(w.errors, []);
});

test("Esc putting the page's address back, with no input event, brings Vivaldi's icon back", async () => {
  const w = await start(PAGE);
  await focus(w);
  type(w, "cats");
  assert.equal(logo(w), true);
  w.input.value = PAGE;
  keyup(w, "Escape");
  assert.equal(logo(w), false);
  type(w, "dogs");
  assert.equal(logo(w), true, "typing again: the logo");
});

test("if Vivaldi changes the text itself on the way in, Esc back to that text is untouched", async () => {
  const w = await start("docs.google.com/document/d/1Xq7/edit");
  await focus(w, () => { w.input.value = PAGE; });
  keyup(w, "Shift");
  assert.equal(logo(w), false);
  type(w, "cats");
  assert.equal(logo(w), true);
  w.input.value = PAGE;
  keyup(w, "Escape");
  assert.equal(logo(w), false, "the full address Vivaldi showed on the way in");
});

test("leaving and coming back starts over: the address is untouched again", async () => {
  const w = await start(PAGE);
  await focus(w);
  type(w, "cats");
  w.input.dispatchEvent(new w.window.FocusEvent("focusout", { bubbles: true }));
  w.input.blur();
  w.input.value = PAGE;
  assert.equal(logo(w), false, "at rest on a web page: the lock");
  await focus(w);
  assert.equal(logo(w), false);
});

test("an empty field, and the new tab's own address, show the logo", async () => {
  const empty = await start("");
  await focus(empty);
  assert.equal(logo(empty), true, "empty field");
  const newTab = await start(NEWTAB);
  await focus(newTab);
  assert.equal(logo(newTab), true, "the new tab's address reads as an empty field");
  assert.deepEqual(empty.errors.concat(newTab.errors), []);
});
