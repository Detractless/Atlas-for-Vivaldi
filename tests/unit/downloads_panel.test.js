"use strict";
const test = require("node:test");
const { after } = test;
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const DIR = path.join(__dirname, "../../payload/install-files/components/atlas/");
const read = (f) => fs.readFileSync(DIR + f, "utf8");
const BODY = `<header id="bar"><h1 id="title"></h1><input id="search" hidden><button id="search-toggle"></button><button id="clear-all" hidden></button></header><main id="list"></main>`;
const today = (h) => new Date(new Date().setHours(h, 0, 0, 0)).toISOString();
const dl = (o) => Object.assign({ id: 1, state: "complete", exists: true, url: "https://a.test/f.zip", filename: "/d/f.zip", startTime: today(9) }, o);

const windows = [];
after(() => windows.forEach((w) => w.close())); // the panel polls once a second; close the pages so node can exit

// The panel page with a fake chrome.downloads holding `start`; records what the buttons ask for.
function open(start) {
  const dom = new JSDOM("<body>" + BODY + "</body>", { runScripts: "outside-only", pretendToBeVisual: true });
  const w = dom.window;
  windows.push(w);
  const calls = [], all = start.slice(), listeners = {};
  const plain = () => JSON.parse(JSON.stringify(calls)); // the page's own realm otherwise fails deepEqual
  const on = (n) => ({ addListener: (f) => { listeners[n] = f; } });
  const rec = (name) => (...a) => { calls.push([name].concat(a.filter((x) => typeof x !== "function"))); const cb = a.find((x) => typeof x === "function"); if (cb) cb(); };
  w.chrome = { runtime: {}, downloads: {
    search: (q, cb) => cb(q.id ? all.filter((i) => i.id === q.id) : all),
    getFileIcon: (id, o, cb) => cb("data:image/png;base64,AAAA"),
    onCreated: on("created"), onChanged: on("changed"), onErased: on("erased"),
    open: rec("open"), show: rec("show"), erase: rec("erase"), pause: rec("pause"), resume: rec("resume"), cancel: rec("cancel"), download: rec("download"),
  } };
  w.navigator.clipboard = { writeText: (t) => calls.push(["copy", t]) };
  w.eval(read("downloads-core.js") + "\n" + read("downloads-panel.js"));
  const $ = (s) => w.document.querySelector(s);
  return { w, calls, plain, all, listeners, $, $$: (s) => [...w.document.querySelectorAll(s)], click: (el) => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true, cancelable: true })) };
}

test("downloads are grouped under day headings, one card each", () => {
  const p = open([dl({ id: 1 }), dl({ id: 2, startTime: new Date(Date.now() - 86400000).toISOString() })]);
  assert.deepEqual(p.$$(".date").map((d) => d.textContent), ["Today", "Yesterday"]);
  assert.equal(p.$$(".card").length, 2);
});

test("a finished download's name is a blue link; a deleted one is struck through", () => {
  const p = open([dl({ id: 1 }), dl({ id: 2, exists: false })]);
  const finished = p.$('.card[data-id="1"]'), deleted = p.$('.card[data-id="2"]');
  assert.ok(finished.querySelector("a.name.link"));
  assert.ok(deleted.classList.contains("is-inactive"));
  assert.equal(deleted.querySelector("a"), null);
  assert.equal(deleted.querySelector(".tag").textContent, "Deleted");
});

test("the card buttons act on their own download", () => {
  const p = open([dl({ id: 7 })]);
  p.click(p.$('[data-act="show"]'));
  p.click(p.$('[data-act="copy"]'));
  p.click(p.$("a.name"));
  p.click(p.$('[data-act="remove"]'));
  assert.deepEqual(p.plain(), [["show", 7], ["copy", "https://a.test/f.zip"], ["open", 7], ["erase", { id: 7 }]]);
});

test("a running download shows a progress bar and Pause and Cancel", () => {
  const p = open([dl({ id: 3, state: "in_progress", bytesReceived: 1e6, totalBytes: 4e6, exists: true })]);
  assert.equal(p.$(".progress-fill").style.width, "25%");
  assert.deepEqual(p.$$(".icon-button").map((b) => b.dataset.act), ["copy", "pause", "cancel"]);
  p.click(p.$('[data-act="pause"]'));
  assert.deepEqual(p.plain()[0], ["pause", 3]);
  assert.equal(p.$("#clear-all").hidden, true, "nothing finished yet to clear");
});

test("a change to a download redraws its card", () => {
  const p = open([dl({ id: 3, state: "in_progress", bytesReceived: 1e6, totalBytes: 4e6 })]);
  p.all[0] = dl({ id: 3, state: "complete" });
  p.listeners.changed({ id: 3 });
  assert.ok(p.$("a.name.link"));
  assert.equal(p.$(".progress"), null);
});

test("a new or erased download appears and disappears", () => {
  const p = open([dl({ id: 1 })]);
  p.listeners.created(dl({ id: 2, filename: "/d/new.pdf" }));
  assert.equal(p.$$(".card").length, 2);
  p.listeners.erased(1);
  assert.equal(p.$$(".card").length, 1);
  p.listeners.erased(2);
  assert.equal(p.$(".empty").textContent, "No downloads");
});

test("Clear all removes finished and failed ones, and only shows when there are some", () => {
  const p = open([dl({ id: 1 })]);
  assert.equal(p.$("#clear-all").hidden, false);
  p.click(p.$("#clear-all"));
  assert.deepEqual(p.plain(), [["erase", { state: "complete" }], ["erase", { state: "interrupted" }]]);
});

test("search narrows the list, says when nothing matches, and Escape clears it", () => {
  const p = open([dl({ id: 1, filename: "/d/cats.pdf" }), dl({ id: 2, filename: "/d/dogs.pdf" })]);
  p.click(p.$("#search-toggle"));
  assert.equal(p.$("#search").hidden, false);
  p.$("#search").value = "cats";
  p.$("#search").dispatchEvent(new p.w.Event("input"));
  assert.equal(p.$$(".card").length, 1);
  p.$("#search").value = "zebra";
  p.$("#search").dispatchEvent(new p.w.Event("input"));
  assert.equal(p.$(".empty").textContent, "No search results found");
  p.$("#search").dispatchEvent(new p.w.KeyboardEvent("keydown", { key: "Escape" }));
  assert.equal(p.$$(".card").length, 2);
  assert.equal(p.$("#search").hidden, true);
});

test("a failed download offers Retry, which starts it again", () => {
  const p = open([dl({ id: 4, state: "interrupted", error: "NETWORK_FAILED", canResume: false })]);
  assert.match(p.$(".description").textContent, /Failed - Network error/);
  p.click(p.$('[data-act="retry"]'));
  assert.deepEqual(p.plain()[0], ["download", { url: "https://a.test/f.zip" }]);
});

test("file icons load after the card is drawn", () => {
  const p = open([dl({ id: 1 })]);
  assert.match(p.$("img.file-icon").src, /^data:image\/png/);
});

test("a button on a card that no longer exists does nothing", () => {
  const p = open([dl({ id: 1 })]);
  const stale = p.w.document.createElement("div");
  stale.className = "card";
  stale.dataset.id = "99";
  stale.innerHTML = '<button data-act="remove"></button>';
  p.$("#list").appendChild(stale);
  const errors = [];
  p.w.addEventListener("error", (e) => errors.push(e.message)); // jsdom reports a throwing handler here
  p.click(stale.querySelector("button"));
  assert.deepEqual(errors, []);
  assert.deepEqual(p.plain(), []);
});

test("redrawing keeps the place you scrolled to", () => {
  const p = open([dl({ id: 1 })]);
  const list = p.$("#list");
  let top = 120;
  Object.defineProperty(list, "scrollTop", { get: () => top, set: (v) => { top = v; } });
  p.listeners.created(dl({ id: 2 }));
  assert.equal(top, 120);
});
