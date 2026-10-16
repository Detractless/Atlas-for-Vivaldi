// The profile menu's Add and Settings rows (src/modules/07-profile-menu.js): clicking Add shrinks the menu
// to three choices (bookmark, group, page) and a way back, and each choice opens that flow in the address bar.
// Clicking Settings shrinks it to Atlas (Atlas's own settings) and Advanced (the browser's, vivaldi://settings).
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

function answer(w, name, value) {
  const call = [...w.calls].reverse().find((c) => c.name === name);
  assert.ok(call, `${name} was called`);
  call.args.find((a) => typeof a === "function")(w.window.JSON.parse(JSON.stringify(value)));
}

async function waitFor(fn, what, ms = 2000) {
  const t0 = Date.now();
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() - t0 > ms) throw new Error(`timed out: ${what}`);
    await new Promise((r) => setTimeout(r, 20));
  }
}

async function openProfileMenu(w) {
  const doc = w.window.document;
  doc.querySelector('[data-name="AccountButton"]').dispatchEvent(new w.window.MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 }));
  return waitFor(() => doc.querySelector(".atlas-nosurf-menu .apm-strip") && doc.querySelector(".atlas-nosurf-menu"), "profile menu with profiles");
}

test("Add shrinks the menu to three choices and a way back; each choice opens the flow in the address bar, here", async () => {
  const w = await start();
  w.window.document.getElementById("browser").insertAdjacentHTML("beforeend",
    '<div class="toolbar-mainbar"><button data-name="AccountButton">P</button><div class="UrlBar-AddressField"><input class="url"></div></div>');
  const menu = await openProfileMenu(w);
  const click = (el) => el.dispatchEvent(new w.window.MouseEvent("click", { bubbles: true }));
  const rows = () => [...menu.querySelectorAll(".apm-item .apm-row-label")].map((s) => s.textContent);
  const row = (label) => [...menu.querySelectorAll(".apm-item")].find((b) => b.textContent.includes(label));

  click(row("Add"));
  assert.ok(w.window.document.querySelector(".atlas-nosurf-menu"), "the menu stays open");
  assert.deepEqual(rows(), ["Add bookmark", "Add group", "Add page"]);
  assert.equal(menu.querySelector(".apm-head").textContent.trim(), "Add", "a way back, named Add");
  assert.equal(menu.querySelector(".apm-strip"), null, "the profiles are out of the way while choosing");

  click(menu.querySelector(".apm-head"));
  assert.deepEqual(rows(), ["Add", "History", "Downloads", "Settings"]);
  assert.ok(menu.querySelector(".apm-strip"), "back to the profiles");

  click(row("Add"));
  click(row("Add bookmark"));
  assert.equal(w.window.document.querySelector(".atlas-nosurf-menu"), null, "the menu closes");
  const card = w.window.document.querySelector(".atlas-addcard");
  assert.ok(card, "the flow opens in the address bar");
  assert.equal(w.window.document.querySelector(".atlas-addfield input").placeholder, "Type a website to bookmark, or pick one below");
  assert.ok(!w.calls.some((c) => c.name === "chrome.tabs.create" || c.name === "chrome.tabs.sendMessage"), "no new tab, no message to one");

  w.window.__Atlas.closeAdd();
  await new Promise((r) => setTimeout(r, 300));   // the button ignores a second press within 250 ms
  const again = await openProfileMenu(w);
  const click2 = (el) => el.dispatchEvent(new w.window.MouseEvent("click", { bubbles: true }));
  const pick = (m, label) => click2([...m.querySelectorAll(".apm-item")].find((b) => b.textContent.trim() === label));
  pick(again, "Add");
  pick(again, "Add group");
  assert.equal(w.window.document.querySelector(".atlas-addfield input").placeholder, "Name the new group, like Streaming", "Add group opens its own flow");
  assert.equal(w.window.document.querySelector(".atlas-addcard").getAttribute("aria-label"), "Add group");

  w.window.__Atlas.closeAdd();
  await new Promise((r) => setTimeout(r, 300));
  const third = await openProfileMenu(w);
  pick(third, "Add");
  pick(third, "Add page");
  assert.equal(w.window.document.querySelector(".atlas-addfield input").placeholder, "Give the new page a name, like Streaming");
  assert.ok(!w.calls.some((c) => c.name === "chrome.tabs.create"), "still no new tab");
});

test("Settings shrinks the menu to Atlas and Advanced and a way back: Atlas opens Atlas's settings, Advanced the browser's", async () => {
  const w = await start();
  w.window.document.getElementById("browser").insertAdjacentHTML("beforeend",
    '<div class="toolbar-mainbar"><button data-name="AccountButton">P</button><div class="UrlBar-AddressField"><input class="url"></div></div>');
  const click = (el) => el.dispatchEvent(new w.window.MouseEvent("click", { bubbles: true }));
  const pick = (m, label) => click([...m.querySelectorAll(".apm-item")].find((b) => b.textContent.trim() === label));
  const menu = await openProfileMenu(w);
  const rows = () => [...menu.querySelectorAll(".apm-item .apm-row-label")].map((s) => s.textContent);
  assert.ok(!rows().some((r) => /extension|browser/i.test(r)), "neither says extension or browser any more");

  pick(menu, "Settings");
  assert.ok(w.window.document.querySelector(".atlas-nosurf-menu"), "the menu stays open");
  assert.deepEqual(rows(), ["Atlas", "Advanced"]);
  assert.equal(menu.querySelector(".apm-head").textContent.trim(), "Settings", "a way back, named Settings");
  assert.equal(menu.querySelector(".apm-strip"), null, "the profiles are out of the way while choosing");
  click(menu.querySelector(".apm-head"));
  assert.deepEqual(rows(), ["Add", "History", "Downloads", "Settings"], "back");

  pick(menu, "Settings");
  pick(menu, "Advanced");
  assert.equal(w.window.document.querySelector(".atlas-nosurf-menu"), null, "the menu closes");
  assert.ok(w.calls.some((c) => c.name === "chrome.tabs.create" && plain(c.args[0]).url === "vivaldi://settings"), "Advanced: the browser's own settings");

  await new Promise((r) => setTimeout(r, 300));   // the button ignores a second press within 250 ms
  const again = await openProfileMenu(w);
  pick(again, "Settings");
  pick(again, "Atlas");
  answer(w, "chrome.tabs.query", [{ id: 7, url: "https://example.com/" }]);
  const opened = [...w.calls].reverse().find((c) => c.name === "chrome.tabs.create");
  assert.match(plain(opened.args[0]).url, /^chrome-extension:\/\/[a-z]+\/index\.html#settings$/, "Atlas: Atlas's settings page, in a new tab");
});
