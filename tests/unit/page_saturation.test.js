// The Focus colour filter sits on each tab's page container (a <webview> in
// Vivaldi's window), not inside the page, so it is already on when a page starts
// loading: nothing flashes in colour on a reload or a click to another page.
// Atlas's own pages and Vivaldi's stay in full colour. (22-page-saturation.js)
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { openWindow } = require("./helpers/windowDom");

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const NEWTAB = "chrome-extension://mpognobbkildjkofajifpdfhcoklimli/index.html";
let open = [];
test.afterEach(() => { for (const w of open) w.window.close(); open = []; });

/* A window with the page stack Vivaldi builds, holding one <webview> per tab id. */
async function start(sync, tabIds = []) {
  const w = await openWindow({ sync, settleMs: 100 });
  open.push(w);
  const doc = w.window.document;
  doc.body.insertAdjacentHTML("beforeend", '<div id="webpage-stack"></div>');
  await wait(300);   // the module looks for the stack every 200ms
  for (const id of tabIds) addTab(w, id);
  await wait(20);
  return w;
}
const addTab = (w, id) => w.window.document.getElementById("webpage-stack")
  .insertAdjacentHTML("beforeend", `<div class="webpageview"><webview tab_id="${id}"></webview></div>`);
const view = (w, id) => w.window.document.querySelector(`webview[tab_id="${id}"]`);
const exempt = (w, id) => view(w, id).hasAttribute("data-atlas-nofilter");
const css = (w) => { const el = w.window.document.getElementById("atlas-page-filter"); return el ? el.textContent : null; };
const fire = (w, event, ...args) => { for (const fn of w.listeners[`chrome.tabs.${event}`] || []) fn(...args); };
const navigate = async (w, id, url) => { fire(w, "onUpdated", id, { url }, { id, url }); await wait(10); };

test("the filter is on the page container at the saved level, for web pages only", async () => {
  const w = await start({ saturation: 30 }, [1]);
  assert.match(css(w), /#webpage-stack \.webpageview webview:not\(\[data-atlas-nofilter\]\) \{ filter: saturate\(30%\); \}/);
  await navigate(w, 1, "https://example.com/");
  assert.equal(exempt(w, 1), false, "a web page is filtered");
  assert.equal(w.window.localStorage.getItem("atlas-page-saturation"), "30", "the level is kept for the next start");
  assert.deepEqual(w.errors, []);
});

test("Atlas's new tab and Vivaldi's pages stay in full colour", async () => {
  const w = await start({ saturation: 0 }, [1, 2, 3]);
  await navigate(w, 1, NEWTAB);
  await navigate(w, 2, "vivaldi://settings");
  await navigate(w, 3, "https://example.com/");
  assert.equal(exempt(w, 1), true, "Atlas new tab");
  assert.equal(exempt(w, 2), true, "Vivaldi settings");
  assert.equal(exempt(w, 3), false, "web page");
});

test("a page whose address is not known yet is left alone, so a new tab never paints grey", async () => {
  const w = await start({ saturation: 0 });
  addTab(w, 9);
  await wait(10);
  assert.equal(exempt(w, 9), true);
});

test("going from the new tab to a web page and back moves the filter with the page, with no reload", async () => {
  const w = await start({ saturation: 50 }, [4]);
  await navigate(w, 4, NEWTAB);
  const same = view(w, 4);
  assert.equal(exempt(w, 4), true);
  await navigate(w, 4, "https://example.com/a");
  assert.equal(exempt(w, 4), false, "filtered the moment the address is a web page");
  await navigate(w, 4, "https://example.com/b");
  assert.equal(exempt(w, 4), false, "stays filtered across page to page");
  await navigate(w, 4, NEWTAB);
  assert.equal(exempt(w, 4), true);
  assert.equal(view(w, 4), same, "the same container the whole time");
});

test("a tab opened for a link is filtered from its first frame", async () => {
  const w = await start({ saturation: 20 });
  fire(w, "onCreated", { id: 12, url: "", pendingUrl: "https://news.test/story" });
  addTab(w, 12);
  await wait(10);
  assert.equal(exempt(w, 12), false);
});

test("full color draws no filter; the slider changes it live", async () => {
  const w = await start({ saturation: 40 }, [1]);
  assert.match(css(w), /saturate\(40%\)/);
  await w.chrome.storage.sync.set({ saturation: 65 });
  await wait(20);
  assert.match(css(w), /saturate\(65%\)/);
  await w.chrome.storage.sync.set({ saturation: 100 });
  await wait(20);
  assert.equal(css(w), null, "100 is full color: no filter");
});

test("settings saved before the slider (a Grayscale switch plus a level) still show the right level", async () => {
  const on = await start({ grayscale: true, saturation: 30 }, [1]);
  assert.match(css(on), /saturate\(30%\)/, "switch on: the saved level");
  const noLevel = await start({ grayscale: true }, [1]);
  assert.match(css(noLevel), /saturate\(0%\)/, "switch on, no level saved: fully gray, as before");
  const off = await start({ grayscale: false, saturation: 0 }, [1]);
  assert.equal(css(off), null, "switch off: full color, whatever level was left behind");
});

test("the page itself no longer draws a filter (it would stack on the container's)", async () => {
  const fs = require("fs"), path = require("path");
  const src = fs.readFileSync(path.join(__dirname, "..", "..", "payload", "install-files", "components", "atlas", "atlas-ctxmenu.js"), "utf8");
  assert.ok(!/saturate\(/.test(src) && !/atlas-focus-filter/.test(src));
});
