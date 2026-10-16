// What the Add flow tests share (addbar_flow.test.js, addbar_group_flow.test.js): a window with an address
// field and a page area, a stand-in for the service worker's answers (background/addFlow.js), and short
// helpers to drive the bar. The real worker script is tested in addbar_worker.test.js.
"use strict";

const { openWindow } = require("./windowDom");

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const plain = (v) => JSON.parse(JSON.stringify(v));
let open = [];
const closeAll = () => { for (const w of open) w.window.close(); open = []; };

const PAGES = [{ id: 11, label: "Home" }, { id: 12, label: "Streaming" }];
const SITES = { "": ["netflix.com", "reddit.com"], net: ["netflix.com", "netlify.com"] };

/** A window with an address field, a page area, and a service worker that answers like the real one. */
async function start({ thisUrl = "https://www.example.com/post", groups = { 11: ["SHOWS", "WORK"], 12: [] }, rect, pages = PAGES } = {}) {
  const w = await openWindow();
  open.push(w);
  const doc = w.window.document;
  doc.getElementById("browser").insertAdjacentHTML("beforeend",
    '<div class="toolbar-mainbar"><div class="UrlBar-AddressField"><input class="url"></div></div><div id="webpage-stack"></div>');
  if (rect) doc.querySelector(".UrlBar-AddressField").getBoundingClientRect = () => rect;
  w.asked = [];
  w.saved = { bookmarks: [], groups: [], pages: [], edits: [] };
  const book = Object.fromEntries(Object.entries(groups).map(([page, list]) => [page, [...list]]));
  w.fail = null;
  w.window.chrome.tabs.query = (q, cb) => cb([{ id: 1, url: thisUrl }]);
  // The flow asks the worker script in its own page (background/messaging.js), so the stand-in sits there.
  w.window.__atlasWorker = { ask: (msg) => {
    w.asked.push(plain(msg));
    const reply = (r) => Promise.resolve(plain(r));
    if (w.fail && msg.action === w.fail.action) return reply(w.fail.reply);
    if (msg.action === "addInfo") return reply({ pages });
    if (msg.action === "addGroups") return reply({ groups: [...(book[msg.page] || [])].sort() });
    if (msg.action === "addSuggest") {
      const list = (SITES[msg.typed] || SITES[""]).map((d) => ({ label: d, value: d }));
      const here = msg.thisUrl ? [{ label: "example.com · this page", value: "example.com" }] : [];
      const host = String(msg.typed || "").replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
      const cap = (x) => x.charAt(0).toUpperCase() + x.slice(1);
      return reply({ sites: [...here, ...list].slice(0, 8), names: host.includes(".") ? [cap(host.split(".")[0]), cap(host)] : [] });
    }
    if (msg.action === "addBookmark") { w.saved.bookmarks.push(plain(msg)); return reply({ ok: true }); }
    if (/^edit(Bookmark|Group|Page)$/.test(msg.action)) { w.saved.edits.push(plain(msg)); return reply({ ok: true }); }
    if (msg.action === "addGroup") { w.saved.groups.push(plain(msg)); (book[msg.page] = book[msg.page] || []).push(msg.group); return reply({ ok: true }); }
    if (msg.action === "addPage") { w.saved.pages.push(plain(msg)); return reply({ ok: true }); }
    return reply({});
  } };
  return w;
}

const $ = (w, sel) => w.window.document.querySelector(sel);
const card = (w) => $(w, ".atlas-addcard");
const field = (w) => $(w, ".atlas-addfield");
const ask = (w) => input(w).placeholder;                       // the question is the bar's placeholder
const step = (w) => input(w).getAttribute("data-ab-field");     // url, name, place | groupName, place | pageName, sub
const pills = (w) => [...card(w).querySelectorAll("[data-ab-site]")].map((b) => b.getAttribute("data-ab-site"));
const click = (w, el) => el.dispatchEvent(new w.window.MouseEvent("click", { bubbles: true }));
const type = (w, el, value) => { el.value = value; el.dispatchEvent(new w.window.Event("input", { bubbles: true })); };
const key = (w, el, k, extra = {}) => el.dispatchEvent(new w.window.KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...extra }));
const input = (w) => field(w).querySelector("input");
const next = async (w) => { key(w, input(w), "Enter"); await wait(60); };   // screen 1 has no button: Enter moves on
async function opened(w, mode = "bookmark") { w.window.__Atlas.openAdd(mode); await wait(80); }

module.exports = { start, closeAll, wait, $, card, field, ask, step, pills, click, type, key, input, next, opened };
