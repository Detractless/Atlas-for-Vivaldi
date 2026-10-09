// Spec 002, phase 1: finding the Google accounts signed into Vivaldi.
// src/modules/16-google-accounts.js (browser-window side) reads Google's account
// list, caches it in chrome.storage.local.atlasGoogleAccounts and answers the
// new tab; a profile's edit page shows what was found.
// No fixture here holds real account data: replies are made up in Google's shape.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { openWindow } = require("./helpers/windowDom");
const { openNewTab, closeAll, waitFor, settle, click } = require("./helpers/newtabDom");

const plain = (v) => JSON.parse(JSON.stringify(v === undefined ? null : v));
const text = (el) => (el ? el.textContent.replace(/\s+/g, " ").trim() : "");
const LIST_URL = "https://accounts.google.com/ListAccounts?gpsia=1&source=ogb&mo=1&origin=https://accounts.google.com";

let windows = [];
test.afterEach(() => { for (const w of windows) w.window.close(); windows = []; closeAll(); });

/** A reply in the shape Google sends: a <script> whose single-quoted JS string
    holds JSON, with quotes written \x22, apostrophes \x27 and slashes \/. */
function listAccountsReply(accounts) {
  const entries = accounts.map((a) => {
    const e = ["gaia.l.a", 1, a.name, a.email, a.photo, 1, 1, a.index === undefined ? null : a.index];
    while (e.length < (a.signedOut ? 15 : 16)) e.push(0);
    return e;
  });
  const js = JSON.stringify(["gaia.l.a.r", entries]).replace(/"/g, "\\x22").replace(/'/g, "\\x27").replace(/\//g, "\\/");
  return `<?xml version="1.0" encoding="UTF-8"?><html><head><script type="text/javascript">window.parent.postMessage('${js}', 'https:\\/\\/accounts.google.com');</script></head></html>`;
}

const PAT = { name: "Pat O'Brien", email: "pat@gmail.com", photo: "https://lh3.googleusercontent.com/a/one", index: 0 };
const SCHOOL = { name: "Pat (KSU)", email: "pat@students.ksu.edu", photo: "https://lh3.googleusercontent.com/a/two", index: 1 };

function replying(body, calls = []) {
  return (url, init) => {
    calls.push({ url: String(url), init: plain(init) });
    if (body instanceof Error) return Promise.reject(body);
    return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(body) });
  };
}

async function start(opts = {}) {
  const w = await openWindow(opts);
  windows.push(w);
  return w;
}
const cached = async (w) => plain((await w.chrome.storage.local.get(["atlasGoogleAccounts"])).atlasGoogleAccounts);

/** waitFor for an async check (waitFor takes a plain one). */
async function waitAsync(check, ms, what) {
  const t0 = Date.now();
  for (;;) {
    if (await check()) return;
    if (Date.now() - t0 > ms) throw new Error(`Timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 20));
  }
}

function ask(w, msg) {
  const replies = w.control.deliver(msg);
  return waitFor(() => replies.length && replies[0], 2000, "an answer").then(plain);
}

test("the account list is read from Google's reply: names, emails, photos, numbers", async () => {
  const w = await start();
  const { parseAccountList } = w.window.__Atlas.googleAccounts;
  const third = { name: "No Number", email: "third@example.com", photo: "" };
  const got = plain(parseAccountList(listAccountsReply([PAT, SCHOOL, third])));
  assert.deepEqual(got, [
    { index: 0, name: "Pat O'Brien", email: "pat@gmail.com", photo: "https://lh3.googleusercontent.com/a/one", signedIn: true },
    { index: 1, name: "Pat (KSU)", email: "pat@students.ksu.edu", photo: "https://lh3.googleusercontent.com/a/two", signedIn: true },
    { index: 2, name: "No Number", email: "third@example.com", photo: "", signedIn: true },
  ], "the number falls back to the position; escapes are undone");
  const out = plain(parseAccountList(listAccountsReply([{ ...SCHOOL, signedOut: true }])));
  assert.equal(out[0].signedIn, false, "a signed-out account is listed as such");
});

test("a reply that isn't Google's account list gives no accounts and no error", async () => {
  const w = await start();
  const { parseAccountList } = w.window.__Atlas.googleAccounts;
  for (const bad of ["", "<html><body>Sign in</body></html>", "<script>var x = 1;</script>", "<script>f('not json')</script>",
    "<script>f('{\\x22a\\x22:1}')</script>", "<script>f('[1,2]')</script>", "<script>f('[0,[[0,1,2,\\x22not-an-email\\x22]]]')</script>", null, undefined]) {
    assert.deepEqual(plain(parseAccountList(bad)), [], JSON.stringify(bad));
  }
  assert.deepEqual(w.errors, []);
});

test("at start the window reads the list with the browser's cookies and caches it", async () => {
  const calls = [];
  const w = await start({ fetch: replying(listAccountsReply([PAT, SCHOOL]), calls) });
  await waitAsync(async () => (await cached(w)) !== null, 2000, "the cache");
  assert.equal(calls[0].url, LIST_URL);
  assert.equal(calls[0].init.credentials, "include");
  const c = await cached(w);
  assert.deepEqual(c.accounts.map((a) => a.email), ["pat@gmail.com", "pat@students.ksu.edu"]);
  assert.equal(typeof c.at, "number");
  assert.equal(c.error, undefined);
  assert.deepEqual(w.errors, []);
});

test("a failed or unreadable reply is cached as an error, not as an empty success", async () => {
  const offline = await start({ fetch: replying(new Error("network down")) });
  await waitAsync(async () => (await cached(offline)) !== null, 2000, "the cache");
  let c = await cached(offline);
  assert.deepEqual(c.accounts, []);
  assert.match(c.error, /network down/);

  const changed = await start({ fetch: replying("<html><body>Something new</body></html>") });
  await waitAsync(async () => (await cached(changed)) !== null, 2000, "the cache");
  c = await cached(changed);
  assert.deepEqual(c.accounts, []);
  assert.match(c.error, /format/);
  assert.deepEqual(offline.errors.concat(changed.errors), []);
});

test("the new tab can ask for the list, fresh or cached", async () => {
  const calls = [];
  const w = await start({ fetch: replying(listAccountsReply([PAT]), calls) });
  await waitAsync(async () => (await cached(w)) !== null, 2000, "the cache");
  const cachedReply = await ask(w, { atlas: { act: "google-accounts" } });
  assert.deepEqual(cachedReply.accounts.map((a) => a.email), ["pat@gmail.com"]);
  assert.equal(calls.length, 1, "answered from the cache");
  const fresh = await ask(w, { atlas: { act: "google-accounts", refresh: true } });
  assert.deepEqual(fresh.accounts.map((a) => a.email), ["pat@gmail.com"]);
  assert.equal(calls.length, 2, "read again when asked");
});

test("accountFor finds a signed-in account by email, ignoring case", async () => {
  const w = await start({ fetch: replying(listAccountsReply([PAT, { ...SCHOOL, signedOut: true }])) });
  await waitAsync(async () => (await cached(w)) !== null, 2000, "the cache");
  const { accountFor } = w.window.__Atlas.googleAccounts;
  assert.deepEqual(plain(accountFor("PAT@Gmail.com")), { email: "pat@gmail.com", index: 0 });
  assert.equal(accountFor("pat@students.ksu.edu"), null, "signed out: can't switch to it");
  assert.equal(accountFor("nobody@example.com"), null);
  assert.equal(accountFor(""), null);
});

test("the cached list is listed as a local key and is never put in backups", () => {
  const keys = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "payload", "detractless", "src", "constants", "atlasKeys.json"), "utf8"));
  const entry = keys.local.atlasGoogleAccounts;
  assert.ok(entry, "listed under local");
  assert.notEqual(entry.backup, true, "not backed up");
});

/* ── The profile edit page shows what was found ─────────────────────────── */

function profiles() {
  const p = (id, name) => ({ id, name, label: "", color: 0, icon: "", db: "", settings: {}, google: null });
  return { v: 2, active: "personal", owner: "personal", share: { bookmarks: true, theme: true, appearance: true, search: true, focus: true },
    list: [p("personal", "Pat"), p("school", "Pat (School)")] };
}

async function editPage(local) {
  const t = await openNewTab({ local: { atlasProfilesV2: profiles(), ...local } });
  click(t.window, t.document.getElementById("global-settings-btn"));
  click(t.window, await waitFor(() => t.document.querySelector('#sp-nav [data-page="profiles"]'), 2000, "Profiles"));
  click(t.window, await waitFor(() => t.document.querySelector('#sp-content [data-pf-edit="school"]'), 2000, "Edit"));
  await waitFor(() => t.document.querySelector("#sp-content [data-pfe-ga], #sp-content [data-pfe-pick]"), 2000, "the Google row");
  return t;
}
const gaLine = (t) => text(t.document.querySelector("#sp-content [data-pfe-ga]"));

test("the edit page shows the Google accounts found, and asks for a fresh list", async () => {
  const t = await editPage({ atlasGoogleAccounts: { accounts: [
    { index: 0, name: "Pat", email: "pat@gmail.com", photo: "", signedIn: true },
    { index: 1, name: "Pat (KSU)", email: "pat@students.ksu.edu", photo: "", signedIn: false }], at: 1 } });
  // Phase 2 lists them as accounts to click (google_account_picker.test.js), with no line about them.
  assert.equal(t.document.querySelector("#sp-content [data-pfe-ga]"), null);
  assert.deepEqual([...t.document.querySelectorAll("#sp-content [data-pfe-pick]")].map((r) => r.dataset.pfePick),
    ["pat@gmail.com", "pat@students.ksu.edu", ""]);
  assert.ok(t.control.sentMessages.some((m) => m.atlas && m.atlas.act === "google-accounts" && m.atlas.refresh), "asked the browser window for a fresh list");
  assert.deepEqual(t.errors, []);
});

test("the edit page says why when no accounts could be read, and follows a new list live", async () => {
  const t = await editPage({ atlasGoogleAccounts: { accounts: [], at: 1, error: "Could not reach Google: offline" } });
  assert.match(gaLine(t), /Couldn't read your Google accounts: Could not reach Google: offline/);
  await t.chrome.storage.local.set({ atlasGoogleAccounts: { accounts: [{ index: 0, name: "Pat", email: "pat@gmail.com", photo: "", signedIn: true }], at: 2 } });
  await waitFor(() => t.document.querySelectorAll("#sp-content [data-pfe-pick]").length === 2, 2000, "the new list");
  assert.equal(t.document.querySelector("#sp-content [data-pfe-ga]"), null, "the error line is gone");
  assert.ok(t.document.querySelector("#sp-content [data-pfe-typed]"), "typing an email is still offered");
});

test("before any list arrives the edit page says it is looking", async () => {
  const t = await editPage({});
  assert.match(gaLine(t), /Looking for the Google accounts signed into Vivaldi/);
  await settle(t.window, 10);
});
