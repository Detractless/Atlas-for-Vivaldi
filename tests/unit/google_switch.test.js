// Spec 002, phase 3: switching Atlas profile switches the open Google tab to the
// new profile's account (src/modules/16-google-accounts.js, browser-window side).
// The active tab switches at once; other Google tabs open at the time switch
// when the user moves to them, once.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { openWindow } = require("./helpers/windowDom");

const plain = (v) => JSON.parse(JSON.stringify(v === undefined ? null : v));
let windows = [];
test.afterEach(() => { for (const w of windows) w.window.close(); windows = []; });

/** Google's account-list reply, made up (see google_accounts_detect.test.js). */
function listAccountsReply(accounts) {
  const entries = accounts.map((a) => {
    const e = ["gaia.l.a", 1, a.name, a.email, "", 1, 1, a.index];
    while (e.length < (a.signedOut ? 15 : 16)) e.push(0);
    return e;
  });
  const js = JSON.stringify(["gaia.l.a.r", entries]).replace(/"/g, "\\x22").replace(/\//g, "\\/");
  return `<html><head><script>window.parent.postMessage('${js}', 'x');</script></head></html>`;
}
const ACCOUNTS = [
  { name: "Pat", email: "pat@gmail.com", index: 0 },
  { name: "Pat (Work)", email: "pat@work.com", index: 3 },
  { name: "Old", email: "old@example.com", index: 4, signedOut: true },
];
function profiles(active, links) {
  const p = (id, email) => ({ id, name: id, label: "", color: 0, icon: "", db: "", settings: {}, google: email ? { email } : null });
  return { v: 2, active, owner: active, share: { bookmarks: true, theme: true, appearance: true, search: true, focus: true },
    list: [p("personal", links.personal), p("work", links.work), p("other", links.other)] };
}

async function start(links = { personal: "pat@gmail.com", work: "pat@work.com" }) {
  const w = await openWindow({
    local: { atlasProfilesV2: profiles("personal", links) },
    fetch: () => Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(listAccountsReply(ACCOUNTS)) }),
  });
  windows.push(w);
  await w.window.AtlasProfiles.ready;
  await wait(50);
  return w;
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Answer the newest recorded call to `name` whose first argument matches. */
function answer(w, name, match, value) {
  const call = w.calls.filter((c) => c.name === name && match(plain(c.args[0]))).pop();
  assert.ok(call, `${name} was called`);
  call.args.find((a) => typeof a === "function")(w.window.JSON.parse(JSON.stringify(value)));
}
const updates = (w) => w.calls.filter((c) => c.name === "chrome.tabs.update").map((c) => [c.args[0], plain(c.args[1]).url]);

async function switchTo(w, id, tabs) {
  await w.window.AtlasProfiles.switchTo(id);
  await wait(30);
  answer(w, "chrome.tabs.query", (q) => q && q.currentWindow === true, tabs);
  await wait(20);
}

test("redirectFor: a Google page showing another account gets the profile's account", async () => {
  const w = await start();
  const { redirectFor } = w.window.__Atlas.googleAccounts;
  const work = { email: "pat@work.com", index: 3 };
  assert.equal(redirectFor("https://www.youtube.com/", work), "https://www.youtube.com/?authuser=3");
  assert.equal(redirectFor("https://www.google.com/search?q=cats", work), "https://www.google.com/search?q=cats&authuser=3");
  assert.equal(redirectFor("https://mail.google.com/mail/u/0/#inbox", work, { force: true }), "https://mail.google.com/mail/u/3/?authuser=3#inbox");
  assert.equal(redirectFor("https://mail.google.com/mail/?authuser=0", work, { force: true }), "https://mail.google.com/mail/?authuser=3");
  assert.equal(redirectFor("https://www.google.com/?authuser=3", work, { force: true }), null, "already showing it");
  assert.equal(redirectFor("https://www.google.com/?authuser=pat%40work.com", work, { force: true }), null, "already showing it, by email");
  assert.equal(redirectFor("https://www.google.com/", { email: "pat@gmail.com", index: 0 }), null, "no account named means account 0");
  for (const url of ["https://notion.so/", "https://google.com.example.test/", "https://evilgoogle.com/", "https://accounts.google.com/ServiceLogin", "chrome://settings", "not a url"]) {
    assert.equal(redirectFor(url, work, { force: true }), null, url);
  }
  assert.equal(redirectFor("https://www.youtube.com/", null), null, "no linked account");
  assert.deepEqual(w.errors, []);
});

test("a profile switch reloads the active Google tab with the new account", async () => {
  const w = await start();
  await switchTo(w, "work", [{ id: 5, active: true, url: "https://www.youtube.com/watch?v=x" }]);
  assert.deepEqual(updates(w), [[5, "https://www.youtube.com/watch?v=x&authuser=3"]]);
});

test("a non-Google active tab is left alone", async () => {
  const w = await start();
  await switchTo(w, "work", [{ id: 5, active: true, url: "https://example.com/" }]);
  assert.deepEqual(updates(w), []);
});

test("a background Google tab switches when the user moves to it, once", async () => {
  const w = await start();
  await switchTo(w, "work", [
    { id: 5, active: true, url: "https://example.com/" },
    { id: 6, active: false, url: "https://mail.google.com/mail/u/0/#inbox" },
    { id: 7, active: false, url: "https://notion.so/" },
  ]);
  assert.deepEqual(updates(w), [], "nothing reloads in the background");
  const activated = w.listeners["chrome.tabs.onActivated"];
  for (const fn of activated) fn({ tabId: 6, windowId: 1 });
  await wait(20);
  answer(w, "chrome.tabs.get", (id) => id === 6, { id: 6, url: "https://mail.google.com/mail/u/0/#inbox" });
  await wait(20);
  assert.deepEqual(updates(w), [[6, "https://mail.google.com/mail/u/3/?authuser=3#inbox"]]);
  // Moving to it again, or to a non-Google tab, reloads nothing more. (Other
  // modules look tabs up on activation too, so every lookup is answered.)
  const before = w.calls.length;
  for (const fn of activated) fn({ tabId: 6, windowId: 1 });
  for (const fn of activated) fn({ tabId: 7, windowId: 1 });
  await wait(20);
  const tabs = { 6: { id: 6, url: "https://mail.google.com/mail/u/0/#inbox" }, 7: { id: 7, url: "https://notion.so/" } };
  for (const c of w.calls.slice(before).filter((x) => x.name === "chrome.tabs.get")) {
    c.args.find((a) => typeof a === "function")(w.window.JSON.parse(JSON.stringify(tabs[c.args[0]])));
  }
  await wait(20);
  assert.deepEqual(updates(w), [[6, "https://mail.google.com/mail/u/3/?authuser=3#inbox"]], "only once, and only for Google tabs open at the switch");
});

test("switching to a profile with no linked account, or a signed-out one, touches no tab", async () => {
  const w = await start({ personal: "pat@gmail.com", work: null, other: "old@example.com" });
  await switchTo(w, "work", [{ id: 5, active: true, url: "https://www.youtube.com/" }]);
  await switchTo(w, "other", [{ id: 5, active: true, url: "https://www.youtube.com/" }]);
  assert.deepEqual(updates(w), []);
});
