// The new tab's address field on hover (20-addressbar-newtab.js, section 4 of
// 03-addressbar.css): Vivaldi keeps the new tab's own chrome-extension address
// in the field while it isn't in use, so the field showed nothing on hover and
// its hint, "Search … or enter an address", only once clicked into. Now the
// hint shows on hover in place of that address, copied from the field so it
// names the engine in use.
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

/* A window whose address field shows `value`, laid out as Vivaldi's is, after a
   tab switch (which Atlas answers from the field's text, 01-addressbar.js). */
async function start(value) {
  const w = await openWindow({ sync: { customSearchEngines: ENGINES, defaultEngineKey: "google" } });
  open.push(w);
  const doc = w.window.document;
  doc.getElementById("browser").insertAdjacentHTML("beforeend",
    '<div class="toolbar-mainbar"><div class="UrlBar-AddressField">' +
    '<div class="toolbar toolbar-small toolbar-insideinput"><button class="button-addressfield SiteInfoButton web"></button></div>' +
    '<div class="UrlBar-UrlFieldWrapper"><div class="observer"><div class="UrlField">' +
    '<input class="UrlBar-UrlField url vivaldi-addressfield" placeholder="Search Google or enter an address">' +
    '<div class="UrlFragments UrlFragment-Wrapper"></div></div></div></div></div></div>');
  w.input = doc.querySelector(".UrlBar-AddressField input.url");
  w.input.value = value;
  w.box = doc.querySelector(".UrlField");
  for (const fn of w.listeners["chrome.tabs.onActivated"] || []) fn({ tabId: 1 });
  await wait(80);
  return w;
}
const hoverBar = (w) => w.window.document.querySelector(".UrlBar-AddressField").dispatchEvent(new w.window.MouseEvent("mouseenter"));

test("on the new tab the field carries its hint, ready for hover, and follows an engine change", async () => {
  const w = await start(NEWTAB);
  assert.equal(w.box.getAttribute("data-atlas-hint"), "Search Google or enter an address", "copied when the new tab comes up");
  w.input.setAttribute("placeholder", "Search DuckDuckGo or enter an address");   // Vivaldi, after a pick
  hoverBar(w);
  assert.equal(w.box.getAttribute("data-atlas-hint"), "Search DuckDuckGo or enter an address", "copied again on hover");
  assert.deepEqual(w.errors, []);
});

test("the stylesheet shows the hint on hover in place of the new tab's address", () => {
  const css = fs.readFileSync(path.join(__dirname, "..", "..", "payload", "css-mods", "03-addressbar.css"), "utf8");
  const rest = "#browser.atlas-newtab .UrlBar-AddressField:not(:focus-within)";
  assert.ok(!css.includes(`${rest} .UrlBar-UrlFieldWrapper`),
    "the new tab no longer hides the field's text until clicked into: it shows on hover, as on any page");
  assert.ok(css.includes(`${rest} .UrlField:not(.UrlField--IsEmpty) .UrlFragment-Wrapper {\r\n  visibility: hidden !important;`),
    "the new tab's own address stays hidden");
  const hint = css.slice(css.indexOf(`${rest} .UrlField[data-atlas-hint]:not(.UrlField--IsEmpty)::after {`));
  assert.ok(hint.length < css.length, "the hint is drawn in its place");
  assert.match(hint.slice(0, hint.indexOf("}")), /content: attr\(data-atlas-hint\);[\s\S]*padding: 0 3px;[\s\S]*opacity: \.66;/,
    "where and as Vivaldi draws its own hint");
  assert.match(css, /#browser\.atlas-urlbar-hover \.UrlBar-AddressField:not\(:focus-within\) \.UrlBar-UrlFieldWrapper \{\r\n  opacity: 1;/,
    "and it stays while the pointer is on the logo");
});
