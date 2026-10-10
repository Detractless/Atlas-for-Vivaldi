// Atlas's marks on the window (atlasMark, src/modules/00-shared.js). Vivaldi
// rebuilds #browser's whole class list now and then (when the window gains or
// loses focus, among others), and that erased Atlas's marks: the address bar's
// engine logo then sat over Vivaldi's own icon, both showing. Marks Atlas has
// on come back at once; marks it took off stay off.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { openWindow } = require("./helpers/windowDom");

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let open = [];
test.afterEach(() => { for (const w of open) w.window.close(); open = []; });

const NEWTAB = "chrome-extension://mpognobbkildjkofajifpdfhcoklimli/index.html";
const ENGINES = { google: { name: "Google", url: "https://www.google.com/search?q=", icon: "src/assets/svg/google.com.svg" } };

/* A window with an address field showing `value`, after a tab switch (which
   Atlas answers from the field's text, 01-addressbar.js). */
async function start(value) {
  const w = await openWindow({ sync: { customSearchEngines: ENGINES, defaultEngineKey: "google" } });
  open.push(w);
  const doc = w.window.document;
  doc.getElementById("browser").insertAdjacentHTML("beforeend",
    '<div class="toolbar-mainbar"><div class="UrlBar-AddressField">' +
    '<div class="toolbar toolbar-small toolbar-insideinput"><button class="button-addressfield SiteInfoButton web"></button></div>' +
    '<div class="UrlBar-UrlFieldWrapper"><input class="UrlBar-UrlField url vivaldi-addressfield"></div></div></div>');
  w.input = doc.querySelector(".UrlBar-AddressField input.url");
  w.input.value = value;
  for (const fn of w.listeners["chrome.tabs.onActivated"] || []) fn({ tabId: 1 });
  await wait(80);
  return w;
}

const browserOf = (w) => w.window.document.getElementById("browser");
const marks = (w) => [...browserOf(w).classList].filter((c) => c.startsWith("atlas-")).sort();
/* What Vivaldi does when the window gains or loses focus: its own list, whole. */
const vivaldiRewrites = (w, list) => browserOf(w).setAttribute("class", list);
const hoverBar = (w) => w.window.document.querySelector(".UrlBar-AddressField").dispatchEvent(new w.window.MouseEvent("mouseenter"));

test("marks Vivaldi's rewrite erases come back before the window redraws", async () => {
  const w = await start(NEWTAB);
  hoverBar(w);
  const on = ["atlas-enginebtn-on", "atlas-newtab", "atlas-urlbar-hover"];
  assert.deepEqual(marks(w), on, "the new tab, hovered: the logo over Vivaldi's hidden icon");
  vivaldiRewrites(w, "theme-light isblurred");
  await Promise.resolve();   // the watch runs in the same turn, ahead of any redraw
  assert.deepEqual(marks(w), on, "Vivaldi's icon stays hidden under the logo");
  assert.ok(browserOf(w).classList.contains("isblurred"), "Vivaldi's own marks stay as it set them");
  assert.deepEqual(w.errors, []);
});

test("marks Atlas took off stay off after Vivaldi's rewrite", async () => {
  const w = await start("https://example.com/");
  w.input.focus();
  w.input.dispatchEvent(new w.window.FocusEvent("focusin", { bubbles: true }));
  await wait(40);
  w.input.value = "cats";   // a search: the engine logo, not the page's address
  w.input.dispatchEvent(new w.window.Event("input", { bubbles: true }));
  assert.deepEqual(marks(w), ["atlas-enginebtn-inuse", "atlas-enginebtn-on"], "searching on a web page");
  w.input.blur();
  w.input.dispatchEvent(new w.window.FocusEvent("focusout", { bubbles: true }));
  await wait(20);
  vivaldiRewrites(w, "theme-light hasfocus");
  await wait(0);
  assert.deepEqual(marks(w), [], "Vivaldi's lock is back on the web page");
});

test("putting the marks back settles after one pass", async () => {
  const w = await start(NEWTAB);
  // Vivaldi's list keeps the theme Atlas picked, so the theme's own watch (11-theme-sync.js) stays still.
  const theme = [...browserOf(w).classList].filter((c) => c.startsWith("theme-")).join(" ");
  let changes = 0;
  new w.window.MutationObserver((recs) => { changes += recs.length; })
    .observe(browserOf(w), { attributes: true, attributeFilter: ["class"] });
  vivaldiRewrites(w, theme + " hasfocus");
  await wait(50);
  assert.equal(marks(w).length, 2);
  assert.equal(changes, 1 + marks(w).length, "Vivaldi's rewrite, then one change per mark put back, then nothing");
});

test("if Vivaldi replaces #browser itself, the marks move to the new one", async () => {
  const w = await start(NEWTAB);
  const old = browserOf(w), fresh = w.window.document.createElement("div");
  fresh.id = "browser";
  fresh.className = "theme-light";
  while (old.firstChild) fresh.appendChild(old.firstChild);
  old.replaceWith(fresh);
  hoverBar(w);
  assert.deepEqual(marks(w), ["atlas-enginebtn-on", "atlas-newtab", "atlas-urlbar-hover"], "at the next mark change");
  vivaldiRewrites(w, "theme-light hasfocus");
  await wait(0);
  assert.deepEqual(marks(w), ["atlas-enginebtn-on", "atlas-newtab", "atlas-urlbar-hover"], "and watched there");
});

test("every Atlas mark on #browser is set through atlasMark", () => {
  const dir = path.join(__dirname, "..", "..", "src", "modules");
  const direct = [];
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith(".js"))) {
    fs.readFileSync(path.join(dir, f), "utf8").split(/\r?\n/).forEach((line, i) => {
      if (/\b(browser|host|bHost)\.classList\.(add|remove|toggle)\(\s*['"]atlas-/.test(line)) direct.push(`${f}:${i + 1}`);
    });
  }
  assert.deepEqual(direct, [], "set these with atlasMark, or Vivaldi's rewrite erases them");
});
