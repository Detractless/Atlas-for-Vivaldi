// Spec 002, phase 4: every Google, Gmail and YouTube page that opens (typed in
// the address bar, a link, history) uses the active profile's account.
// components/atlas/atlas-google-account.js runs in the page and asks the browser
// window (src/modules/16-google-accounts.js), which decides with redirectFor.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
require("./helpers/jsdomNavigation");
const { JSDOM, VirtualConsole } = require("jsdom");
const { openWindow } = require("./helpers/windowDom");

const SCRIPT = fs.readFileSync(path.join(__dirname, "..", "..", "payload", "install-files", "components", "atlas", "atlas-google-account.js"), "utf8");
const plain = (v) => JSON.parse(JSON.stringify(v === undefined ? null : v));
let open = [];
test.afterEach(() => { for (const x of open) x.window.close(); open = []; });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** A Google page with the content script, its message answered by `reply`. */
function openPage(url, reply, setup) {
  const errors = [], sent = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", (e) => { if (e.type !== "not-implemented") errors.push(String(e.cause || e.message)); });
  const dom = new JSDOM("<!DOCTYPE html><body></body>", {
    url, runScripts: "outside-only", virtualConsole,
    beforeParse(window) {
      window.chrome = { runtime: { lastError: undefined, sendMessage(msg, cb) { sent.push(plain(msg)); setTimeout(() => cb(reply), 0); } } };
      if (setup) setup(window);
    },
  });
  dom.window.eval(SCRIPT);
  const page = { window: dom.window, sent, errors };
  open.push(page);
  return page;
}

test("a Google page asks the browser window and opens once as the account it names", async () => {
  const p = openPage("https://www.google.com/search?q=cats", { redirect: "https://www.google.com/search?q=cats&authuser=3" });
  await wait(30);
  assert.deepEqual(p.sent, [{ atlas: { act: "google-account-for-page", url: "https://www.google.com/search?q=cats" } }]);
  assert.deepEqual(plain(p.window.__navigations), ["https://www.google.com/search?q=cats&authuser=3"]);
  assert.deepEqual(p.errors, []);
});

test("nothing happens when the window has no account to switch to", async () => {
  for (const reply of [{}, { redirect: null }, undefined]) {
    const p = openPage("https://www.youtube.com/", reply);
    await wait(30);
    assert.equal(p.sent.length, 1);
    assert.equal(p.window.__navigations, undefined, JSON.stringify(reply));
  }
});

test("guard: a page whose address already names an account is left alone, without asking", async () => {
  for (const url of ["https://www.google.com/search?q=x&authuser=1", "https://mail.google.com/mail/u/2/#inbox", "https://www.youtube.com/?authuser=pat%40work.com"]) {
    const p = openPage(url, { redirect: "https://elsewhere.example/" });
    await wait(30);
    assert.deepEqual(p.sent, [], url);
    assert.equal(p.window.__navigations, undefined, url);
  }
});

test("guard: the same tab and address are not switched twice within 5 seconds (no loop)", async () => {
  const url = "https://www.google.com/";
  const p = openPage(url, { redirect: "https://www.google.com/?authuser=3" }, (window) => {
    window.sessionStorage.setItem("atlas-google-account-redirect", JSON.stringify({ from: url, at: Date.now() - 1000 }));
  });
  await wait(30);
  assert.deepEqual(p.sent, [], "a switch from this address happened a second ago");
  const later = openPage(url, { redirect: "https://www.google.com/?authuser=3" }, (window) => {
    window.sessionStorage.setItem("atlas-google-account-redirect", JSON.stringify({ from: url, at: Date.now() - 6000 }));
  });
  await wait(30);
  assert.equal(later.sent.length, 1, "six seconds later it may switch again");
  assert.deepEqual(plain(JSON.parse(later.window.sessionStorage.getItem("atlas-google-account-redirect"))).from, url, "the switch is remembered");
});

/* ── The browser window's side ─────────────────────────────────────────── */

function listAccountsReply(accounts) {
  const entries = accounts.map((a) => {
    const e = ["gaia.l.a", 1, a.name, a.email, "", 1, 1, a.index];
    while (e.length < (a.signedOut ? 15 : 16)) e.push(0);
    return e;
  });
  const js = JSON.stringify(["gaia.l.a.r", entries]).replace(/"/g, "\\x22").replace(/\//g, "\\/");
  return `<html><head><script>window.parent.postMessage('${js}', 'x');</script></head></html>`;
}

async function windowWith(linked) {
  const p = (id, email) => ({ id, name: id, label: "", color: 0, icon: "", db: "", settings: {}, google: email ? { email } : null });
  const w = await openWindow({
    local: { atlasProfilesV2: { v: 2, active: "work", owner: "work", share: { bookmarks: true, theme: true, appearance: true, search: true, focus: true },
      list: [p("work", linked), p("personal", null)] } },
    fetch: () => Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(listAccountsReply([
      { name: "Pat", email: "pat@gmail.com", index: 0 }, { name: "Work", email: "pat@work.com", index: 3 },
      { name: "Old", email: "old@example.com", index: 4, signedOut: true }])) }),
  });
  open.push(w);
  await w.window.AtlasProfiles.ready;
  await wait(50);
  return w;
}
function ask(w, url) {
  const replies = w.control.deliver({ atlas: { act: "google-account-for-page", url } });
  return plain(replies[0]);
}

test("the window answers with the active profile's account, or nothing", async () => {
  const w = await windowWith("pat@work.com");
  assert.deepEqual(ask(w, "https://www.google.com/search?q=cats"), { redirect: "https://www.google.com/search?q=cats&authuser=3" });
  assert.deepEqual(ask(w, "https://www.google.com/search?q=x&authuser=1"), { redirect: null }, "an address naming an account is left alone");
  assert.deepEqual(ask(w, "https://accounts.google.com/ServiceLogin"), { redirect: null }, "sign-in pages are never touched");
  const out = await windowWith("old@example.com");
  assert.deepEqual(ask(out, "https://www.youtube.com/"), { redirect: null }, "a signed-out account: no switch");
  const none = await windowWith(null);
  assert.deepEqual(ask(none, "https://www.youtube.com/"), { redirect: null }, "no linked account: no switch");
});

test("the page script is registered for Google, Gmail and YouTube pages only, beside the page menu", async () => {
  const w = await windowWith(null);
  const reg = w.calls.find((c) => c.name === "chrome.scripting.getRegisteredContentScripts");
  reg.args.find((a) => typeof a === "function")(w.window.JSON.parse('[{"id":"atlas-google-account"}]'));
  await wait(20);
  const updated = w.calls.filter((c) => c.name === "chrome.scripting.updateContentScripts").map((c) => plain(c.args[0])[0]);
  const g = updated.find((s) => s.id === "atlas-google-account");
  assert.ok(g, "an existing registration is updated, not added twice");
  assert.deepEqual(g.matches, ["*://*.google.com/*", "*://*.gmail.com/*", "*://*.youtube.com/*"]);
  assert.deepEqual(g.js, ["components/atlas/atlas-google-account.js"]);
  assert.equal(g.runAt, "document_start");
  assert.ok(!g.allFrames, "top frames only");
});
