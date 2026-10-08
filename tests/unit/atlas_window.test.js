// Atlas's browser-window code (atlas.js from src/modules, plus profilesCore.js
// and the service-worker bundle it loads) in a stand-in window.html.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { openWindow } = require("./helpers/windowDom");

const plain = (v) => JSON.parse(JSON.stringify(v === undefined ? null : v));
let open = [];
test.afterEach(() => { for (const w of open) w.window.close(); open = []; });

async function start(opts) {
  const w = await openWindow(opts);
  open.push(w);
  return w;
}

test("atlas.js starts in the browser window without errors", async () => {
  const w = await start();
  assert.deepEqual(w.errors, []);
  assert.ok(w.window.__Atlas, "window.__Atlas exists");
  assert.equal(typeof w.window.__Atlas.showUiMenu, "function", "the toolbar menu is published for other modules");
});

test("the service worker defaults are seeded once", async () => {
  const w = await start({ sync: { tabLimit: 4 } });
  const got = plain(await w.chrome.storage.sync.get(["tabLimit", "managementMethod", "searchDelaySeconds", "showQueryOnDelay", "customSearchEngines"]));
  assert.deepEqual(got, { tabLimit: 4, managementMethod: "block", searchDelaySeconds: 0, showQueryOnDelay: true, customSearchEngines: {} });
  const local = plain(await w.chrome.storage.local.get(["activeDelays"]));
  assert.deepEqual(local, { activeDelays: {} });
});

test("the context-menu content script is registered", async () => {
  const w = await start();
  const reg = w.calls.find((c) => c.name === "chrome.scripting.getRegisteredContentScripts");
  assert.ok(reg, "asks which scripts are registered");
  const cb = reg.args.find((a) => typeof a === "function");
  cb(w.window.JSON.parse('[{"id":"detractless-rules"}]'));
  await new Promise((r) => setTimeout(r, 20));
  const registered = w.calls.filter((c) => c.name === "chrome.scripting.registerContentScripts").map((c) => plain(c.args[0])[0].id);
  // Called twice: the stand-in answers once by itself ("none registered") and once here.
  assert.deepEqual([...new Set(registered)], ["atlas-ctxmenu"]);
  const swept = w.calls.find((c) => c.name === "chrome.scripting.unregisterContentScripts");
  assert.deepEqual(plain(swept.args[0]), { ids: ["detractless-rules"] }, "an archived script registration is removed");
});

test("context-menu messages open tabs and downloads", async () => {
  const w = await start();
  w.control.deliver({ atlas: { act: "opentab", url: "https://a.test/" } });
  w.control.deliver({ atlas: { act: "download", url: "https://a.test/f.zip" } });
  await new Promise((r) => setTimeout(r, 20));
  const created = w.calls.filter((c) => c.name === "chrome.tabs.create").map((c) => plain(c.args[0]).url);
  assert.ok(created.includes("https://a.test/"));
  const dl = w.calls.find((c) => c.name === "chrome.downloads.download");
  assert.equal(plain(dl.args[0]).url, "https://a.test/f.zip");
});

test("http://home opens the Atlas new tab", async () => {
  const w = await start();
  for (const fn of w.listeners["chrome.tabs.onUpdated"] || []) fn(7, { url: "http://home/" }, { id: 7 });
  const upd = w.calls.find((c) => c.name === "chrome.tabs.update" && c.args[0] === 7);
  assert.ok(upd, "tab 7 is redirected");
  assert.match(plain(upd.args[1]).url, /^chrome-extension:\/\/[a-p]{32}\/index\.html$/);
});
