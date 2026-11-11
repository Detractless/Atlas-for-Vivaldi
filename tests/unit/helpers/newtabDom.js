// Loads the real new tab (payload/detractless/index.html and every script it
// pulls in) into jsdom, with a fake chrome.* and a fresh in-memory IndexedDB.
// Files are served from disk by a request interceptor, so what runs is exactly
// what install.py copies into Vivaldi.
"use strict";

const fs = require("fs");
const path = require("path");
require("./jsdomNavigation"); // must load before jsdom
const { JSDOM, VirtualConsole, requestInterceptor } = require("jsdom");
const { IDBFactory, IDBKeyRange } = require("fake-indexeddb");
const { makeFakeChrome } = require("./fakeChrome");
const { captureJsdomErrors } = require("../../helpers/jsdom-error-capture");

const ROOT = path.resolve(__dirname, "..", "..", "..");
const PAGE_ROOT = path.join(ROOT, "payload", "detractless");
// components/atlas/* sits beside the new tab once installed (install.py step 1).
const COMPONENTS_ROOT = path.join(ROOT, "payload", "install-files");
const ORIGIN = "https://atlas.test";
const TYPES = { ".js": "application/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".html": "text/html" };

function serveFromDisk(root) {
  return requestInterceptor((request) => {
    const url = new URL(request.url);
    if (url.origin !== ORIGIN) return new Response("", { status: 404 });
    const rel = decodeURIComponent(url.pathname);
    const base = rel.startsWith("/components/") ? COMPONENTS_ROOT : root;
    const file = path.join(base, rel);
    if (!file.startsWith(base) || !fs.existsSync(file)) return new Response("", { status: 404 });
    const type = TYPES[path.extname(file)] || "application/octet-stream";
    return new Response(fs.readFileSync(file), { headers: { "Content-Type": type } });
  });
}

function stubBrowserOnlyApis(window) {
  window.matchMedia = (query) => ({
    matches: false, media: query, onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
  });
  window.scrollTo = () => {};
  window.HTMLElement.prototype.scrollIntoView = function () {};
  window.open = () => null;
  // Downloads: keep each Blob handed to createObjectURL on window.__blobs.
  window.__blobs = [];
  window.URL.createObjectURL = (blob) => {
    window.__blobs.push(blob);
    return "blob:https://atlas.test/" + window.__blobs.length;
  };
  window.URL.revokeObjectURL = () => {};
  // Atlas's right-click menu (components/atlas/atlas-menu.js) draws in a CLOSED
  // shadow root; open it so tests can read the menu (as host.__root).
  const attach = window.Element.prototype.attachShadow;
  window.Element.prototype.attachShadow = function () { const r = attach.call(this, { mode: "open" }); this.__root = r; return r; };
}

/**
 * Open the new tab. Resolves once the bundle has finished starting (the page
 * switcher exists and the search page is showing).
 * @param {{ sync?: object, local?: object, query?: string, root?: string }} opts
 */
async function openNewTab(opts = {}) {
  const root = path.resolve(opts.root || process.env.ATLAS_PAGE_ROOT || PAGE_ROOT);
  const errors = [];
  const virtualConsole = new VirtualConsole();
  captureJsdomErrors(virtualConsole, errors);

  let fake;
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const dom = new JSDOM(html, {
    url: `${ORIGIN}/index.html${opts.query || ""}`,
    runScripts: "dangerously",
    pretendToBeVisual: true,
    virtualConsole,
    resources: { interceptors: [serveFromDisk(root)] },
    beforeParse(window) {
      stubBrowserOnlyApis(window);
      window.indexedDB = new IDBFactory();
      window.IDBKeyRange = IDBKeyRange;
      fake = makeFakeChrome(window, { sync: opts.sync, local: opts.local });
      window.chrome = fake.chrome;
    },
  });
  const { window } = dom;
  openWindows.add(window);
  await waitFor(() => window.document.querySelector("#tabs-container .switcher-item"), 8000, "page switcher");
  await settle(window);
  return { dom, window, document: window.document, chrome: fake.chrome, control: fake.control, errors };
}

const openWindows = new Set();

/** Close every window this file opened (use in test.afterEach). Open windows keep timers alive. */
function closeAll() {
  for (const w of openWindows) {
    try { w.close(); } catch (e) { /* already closed */ }
  }
  openWindows.clear();
}

/** Let pending timers, animation frames and IndexedDB callbacks run. */
function settle(window, ms = 200) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(check, timeout = 3000, what = "condition") {
  const start = Date.now();
  for (;;) {
    const value = check();
    if (value) return value;
    if (Date.now() - start > timeout) throw new Error(`Timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 20));
  }
}

async function openEssentials(tab, { rememberPage = false } = {}) {
  const { window, document } = tab;
  click(window, document.querySelector(".switcher-btn"));
  click(window, [...document.querySelectorAll(".switcher-item")].find((item) => item.textContent.includes("Essentials")));
  const page = document.getElementById("bookmarks-page");
  await waitFor(() => page.classList.contains("active") && page.textContent.replace(/\s+/g, " ").includes("Gmail"), 3000, "Essentials");
  if (rememberPage) {
    await settle(window, 50);
    const { activeTabs } = await tab.chrome.storage.sync.get(["activeTabs"]);
    tab.essentials = activeTabs.find((item) => item.label === "Essentials");
  }
  return page;
}

async function openFocusSettings(tab) {
  const { window, document } = tab;
  click(window, document.getElementById("global-settings-btn"));
  click(window, await waitFor(() => document.querySelector('#sp-nav [data-page="focus"]'), 2000, "Focus in the menu"));
  await waitFor(() => document.querySelector("#sp-content [data-lock]"), 2000, "the Focus page");
  return document.getElementById("sp-content");
}

const settingsText = (element) => (element ? element.textContent.replace(/\s+/g, " ").trim() : "");

function settingsMenuChoices(tab, key) {
  click(tab.window, tab.document.querySelector(`#sp-content [data-select="${key}"]`));
  return Object.fromEntries([...tab.document.querySelectorAll("#sp-menu .sp-menu-item")].map((item) => [settingsText(item), item.getAttribute("aria-disabled") !== "true"]));
}

function closeSettingsMenu(tab, key) {
  if (tab.document.querySelector("#sp-menu.open")) click(tab.window, tab.document.querySelector(`#sp-content [data-select="${key}"]`));
}

async function pickSettingsChoice(tab, key, label) {
  settingsMenuChoices(tab, key);
  click(tab.window, [...tab.document.querySelectorAll("#sp-menu .sp-menu-item")].find((item) => settingsText(item) === label));
  await settle(tab.window, 80);
  closeSettingsMenu(tab, key);
}

async function dragSettingsSlider(tab, slider, value) {
  slider.value = String(value);
  slider.dispatchEvent(new tab.window.Event("input", { bubbles: true }));
  slider.dispatchEvent(new tab.window.Event("change", { bubbles: true }));
  await settle(tab.window, 100);
}

function click(window, el) {
  el.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
}

function pressEnter(window, el) {
  el.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
}

module.exports = { openNewTab, openEssentials, openFocusSettings, settingsMenuChoices, closeSettingsMenu, pickSettingsChoice, dragSettingsSlider, closeAll, waitFor, settle, click, pressEnter, PAGE_ROOT, ROOT };
