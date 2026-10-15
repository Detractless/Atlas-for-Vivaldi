// The profile menu's Add page or bookmark row (src/modules/07-profile-menu.js): clicking it shrinks the menu
// to two choices and a way back, and each choice asks the new tab for that flow.
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

test("Add page or bookmark shrinks the menu to two choices and a way back; each choice opens the flow in the address bar, here", async () => {
  const w = await start();
  w.window.document.getElementById("browser").insertAdjacentHTML("beforeend",
    '<div class="toolbar-mainbar"><button data-name="AccountButton">P</button><div class="UrlBar-AddressField"><input class="url"></div></div>');
  const menu = await openProfileMenu(w);
  const click = (el) => el.dispatchEvent(new w.window.MouseEvent("click", { bubbles: true }));
  const rows = () => [...menu.querySelectorAll(".apm-item .apm-row-label")].map((s) => s.textContent);
  const row = (label) => [...menu.querySelectorAll(".apm-item")].find((b) => b.textContent.includes(label));

  click(row("Add page or bookmark"));
  assert.ok(w.window.document.querySelector(".atlas-nosurf-menu"), "the menu stays open");
  assert.deepEqual(rows(), ["Add bookmark", "Add page"]);
  assert.equal(menu.querySelector(".apm-head").textContent.trim(), "Add", "a way back, named Add");
  assert.equal(menu.querySelector(".apm-strip"), null, "the profiles are out of the way while choosing");

  click(menu.querySelector(".apm-head"));
  assert.deepEqual(rows(), ["Add page or bookmark", "History", "Downloads", "Extension settings", "Browser settings"]);
  assert.ok(menu.querySelector(".apm-strip"), "back to the profiles");

  click(row("Add page or bookmark"));
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
  click2([...again.querySelectorAll(".apm-item")].find((b) => b.textContent.includes("Add page or bookmark")));
  click2([...again.querySelectorAll(".apm-item")].find((b) => b.textContent.includes("Add page")));
  assert.equal(w.window.document.querySelector(".atlas-addfield input").placeholder, "Give the new page a name, like Streaming");
  assert.ok(!w.calls.some((c) => c.name === "chrome.tabs.create"), "still no new tab");
});
