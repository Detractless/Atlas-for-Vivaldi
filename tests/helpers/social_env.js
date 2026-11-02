// Loads the social media filter's page scripts (behaviours, guard, core) and one site table into a jsdom page
// with a fake chrome.storage, so the engine can be tested without a browser. jsdom does no layout: every
// element's box is 0 x 0 unless a test replaces getBoundingClientRect.
"use strict";

const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");
const { makeFakeChrome } = require("../unit/helpers/fakeChrome");

const ROOT = path.resolve(__dirname, "..", "..");
const DIR = path.join(ROOT, "payload", "install-files", "components", "atlas");
const ENGINE = ["atlas-social-behaviors.js", "atlas-social-guard.js", "atlas-social-core.js"];
const read = (name) => fs.readFileSync(path.join(DIR, name), "utf8");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const open = [];
/** Close every page a test opened: the filter's timers would otherwise keep the test process alive. */
const closeAll = () => { while (open.length) open.pop().close(); };

/**
 * @param {object} opts  html, url, filter (the socialFilter setting), table (a site table object), sync/local seed
 * @returns the jsdom window, its document, the fake chrome, and the filter's state (`siteFile`: a site key to load its real table instead of `table`)
 */
function loadSocial(opts) {
  const o = opts || {};
  const dom = new JSDOM(o.html || "<!doctype html><html><head></head><body></body></html>", {
    url: o.url || "https://example.test/",
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  const { window } = dom;
  open.push(window);
  const sync = Object.assign({}, o.sync || {});
  if (o.filter) sync.socialFilter = o.filter;
  const { chrome } = makeFakeChrome(window, { sync, local: o.local || {} });
  window.chrome = chrome;
  for (const f of ENGINE) window.eval(read(f));
  const navigations = [];
  window.__atlasSocial.navigate = (url) => navigations.push(url);
  if (o.siteFile) window.__atlasSocial.reviewing = true;   /* a table that is not live yet still runs in a test */
  const state = o.table ? window.__atlasSocial.run(o.table) : null;
  if (o.siteFile) { window.eval(read(`atlas-social-${o.siteFile}.js`)); }
  return { dom, window, document: window.document, chrome, S: window.__atlasSocial, state: state || window.__atlasSocial.state || null, navigations };
}

const styles = (document) => Array.from(document.querySelectorAll("style[data-atlas-social]"));

module.exports = { loadSocial, styles, wait, closeAll, DIR, ROOT, ENGINE };
