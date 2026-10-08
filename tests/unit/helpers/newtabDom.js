// Loads the real new tab (payload/detractless/index.html and every script it
// pulls in) into jsdom, with a fake chrome.* and a fresh in-memory IndexedDB.
// Files are served from disk by a request interceptor, so what runs is exactly
// what install.py copies into Vivaldi.
"use strict";

const fs = require("fs");
const path = require("path");
const { JSDOM, VirtualConsole, requestInterceptor } = require("jsdom");
const { IDBFactory, IDBKeyRange } = require("fake-indexeddb");
const { makeFakeChrome } = require("./fakeChrome");

const ROOT = path.resolve(__dirname, "..", "..", "..");
const PAGE_ROOT = path.join(ROOT, "payload", "detractless");
const ORIGIN = "https://atlas.test";
const TYPES = { ".js": "application/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".html": "text/html" };

function serveFromDisk(root) {
  return requestInterceptor((request) => {
    const url = new URL(request.url);
    if (url.origin !== ORIGIN) return new Response("", { status: 404 });
    const file = path.join(root, decodeURIComponent(url.pathname));
    if (!file.startsWith(root) || !fs.existsSync(file)) return new Response("", { status: 404 });
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
}

/**
 * Open the new tab. Resolves once the bundle has finished starting (the page
 * switcher exists and the search page is showing).
 * @param {{ sync?: object, local?: object, query?: string, root?: string }} opts
 */
async function openNewTab(opts = {}) {
  const root = path.resolve(opts.root || PAGE_ROOT);
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", (err) => {
    if (err.type === "css-parsing" || err.type === "not-implemented") return;
    errors.push(`${err.type}: ${(err.cause && err.cause.stack) || err.message}`);
  });
  virtualConsole.on("error", (...args) => errors.push("console.error: " + args.map(String).join(" ")));

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
  await waitFor(() => window.document.querySelector("#tabs-container .switcher-item"), 8000, "page switcher");
  await settle(window);
  return { dom, window, document: window.document, chrome: fake.chrome, control: fake.control, errors };
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

function click(window, el) {
  el.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
}

function pressEnter(window, el) {
  el.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
}

module.exports = { openNewTab, waitFor, settle, click, pressEnter, PAGE_ROOT, ROOT };
