// The address bar's engine logo means "this will be searched"
// (src/modules/21-addressbar-address-check.js, 19-addressbar-engine-picker.js):
// while the field holds an address (a page's own https://..., notion.so,
// localhost, an IP) the logo steps aside for Vivaldi's own icon; a search or
// an empty field shows it. The endings are the new tab's own list.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { openWindow } = require("./helpers/windowDom");

const ROOT = path.join(__dirname, "..", "..");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let open = [];
test.afterEach(() => { for (const w of open) w.window.close(); open = []; });

const NEWTAB = "chrome-extension://mpognobbkildjkofajifpdfhcoklimli/index.html";
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
async function focus(w) {
  w.input.focus();
  w.input.dispatchEvent(new w.window.FocusEvent("focusin", { bubbles: true }));
  await wait(40);
}
function type(w, text) {
  w.input.value = text;
  w.input.dispatchEvent(new w.window.Event("input", { bubbles: true }));
}
const btn = (w) => w.window.document.querySelector(".atlas-enginebtn");
const browserHas = (w, c) => w.window.document.getElementById("browser").classList.contains(c);
/* The engine logo is showing, and Vivaldi's own icon is hidden under it. */
const logo = (w) => !!btn(w) && !btn(w).hidden && browserHas(w, "atlas-enginebtn-on");

const ADDRESSES = [
  "https://docs.google.com/document/d/1Xq7/edit", "http://example.com", "vivaldi://settings",
  "chrome://extensions", "about:blank", "www.reddit.com", "notion.so", "Notion.SO/page?x=1",
  "github.com/anthropics", "localhost", "localhost:3000/app", "192.168.1.1", "10.0.0.5:8080",
  "/Users/me/notes.txt", "C:\\Users\\me",
];
const SEARCHES = [
  "", "   ", "how to cook rice", "notion", "notes.docx", "photo.zip", "version.1.3",
  "report.v2", "3.14", "what is example.com", "e.g. this", NEWTAB,
];

test("the engine logo shows for a search or an empty field, and steps aside for an address", async () => {
  const w = await start();
  await focus(w);
  for (const text of ADDRESSES) {
    type(w, text);
    assert.equal(logo(w), false, `"${text}" is an address: Vivaldi's icon`);
  }
  for (const text of SEARCHES) {
    type(w, text);
    assert.equal(logo(w), true, `"${JSON.stringify(text)}" is a search: the engine logo`);
  }
  assert.deepEqual(w.errors, []);
});

test("clicking into a web page's address keeps Vivaldi's icon until you type a search", async () => {
  const w = await start("https://docs.google.com/document/d/1Xq7/edit");
  await focus(w);
  assert.equal(logo(w), false, "the page's own address");
  assert.ok(!browserHas(w, "atlas-enginebtn-inuse"));
  type(w, "how to");
  assert.equal(logo(w), true, "words: the engine logo");
  assert.ok(browserHas(w, "atlas-enginebtn-inuse"));
  type(w, "");
  assert.equal(logo(w), true, "emptied: the logo stays");
  assert.deepEqual(w.errors, []);
});

test("when Vivaldi puts an address back itself (Esc), with no input event, its icon comes back", async () => {
  const w = await start("https://example.com/page");
  await focus(w);
  type(w, "cats");
  assert.equal(logo(w), true);
  w.input.value = "https://example.com/page";
  w.input.dispatchEvent(new w.window.KeyboardEvent("keyup", { key: "Escape", bubbles: true }));
  assert.equal(logo(w), false);
});

test("an address typed while the engine pills show closes them with the logo", async () => {
  const w = await start();
  await focus(w);
  btn(w).dispatchEvent(new w.window.MouseEvent("click", { bubbles: true, cancelable: true }));
  assert.ok(browserHas(w, "atlas-engines-open"), "engine pills open");
  type(w, "notion.so");
  assert.ok(!browserHas(w, "atlas-engines-open"));
  assert.equal(logo(w), false);
});

test("Atlas's list of web address endings is the new tab's own", () => {
  const read = (file, from, to) => {
    const src = fs.readFileSync(path.join(ROOT, file), "utf8");
    const body = src.slice(src.indexOf(from), src.indexOf(to, src.indexOf(from)));
    return body.split(/\r?\n/).filter((l) => !l.trim().startsWith("//")).join("\n").match(/'([a-z]+)'/g).sort();
  };
  const newTab = read("payload/detractless/src/utils/url.js", "KNOWN_TLDS = new Set([", "]);");
  const atlas = read("src/modules/21-addressbar-address-check.js", "ATLAS_KNOWN_ENDINGS = [", "];");
  assert.equal(newTab.length, 117);
  assert.deepEqual(atlas, newTab);
});
