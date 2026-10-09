// A profile linked to a Google account (spec 001, phase 4): while that profile
// is active, Google links the new tab opens carry the account
// (src/services/googleAccount.js). The account is a typed email on the
// profile's edit page; nothing detects accounts yet.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const esbuild = require("esbuild");
const { openNewTab, closeAll, waitFor, settle, click } = require("./helpers/newtabDom");

test.afterEach(closeAll);

const SERVICE = path.join(__dirname, "..", "..", "payload", "detractless", "src", "services", "googleAccount.js");
const text = (el) => (el ? el.textContent.replace(/\s+/g, " ").trim() : "");
const plain = (v) => JSON.parse(JSON.stringify(v));

function loadService() {
  const out = esbuild.buildSync({ entryPoints: [SERVICE], bundle: true, format: "cjs", platform: "node", write: false });
  const mod = { exports: {} };
  new Function("module", "exports", out.outputFiles[0].text)(mod, mod.exports);
  return mod.exports;
}

function profiles(active, emails = {}) {
  const p = (id, name) => ({ id, name, label: "", color: 0, icon: "", db: "", settings: {}, google: emails[id] ? { email: emails[id] } : null });
  return {
    v: 2, active, owner: active,
    share: { bookmarks: true, theme: true, appearance: true, search: true, focus: true },
    list: [p("personal", "Pat"), p("school", "Pat (School)")],
  };
}
const EMAILS = { personal: "pat@gmail.com", school: "pat@students.ksu.edu" };
const account = (url) => new URL(url).searchParams.get("authuser");

function type(win, input, value) {
  input.value = value;
  input.dispatchEvent(new win.Event("input", { bubbles: true }));
}
function key(win, el, k) {
  el.dispatchEvent(new win.KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
}
async function openEssentials(t) {
  const { window: win, document: doc } = t;
  click(win, doc.querySelector(".switcher-btn"));
  click(win, [...doc.querySelectorAll(".switcher-item")].find((li) => li.textContent.includes("Essentials")));
  const page = doc.getElementById("bookmarks-page");
  await waitFor(() => page.classList.contains("active") && text(page).includes("Gmail"), 3000, "Essentials");
  return page;
}
const link = (page, name) => [...page.querySelectorAll("a")].find((a) => text(a) === name);

test("withGoogleAccount: Google and YouTube links get the account; nothing else does", () => {
  const { withGoogleAccount } = loadService();
  const e = "pat@students.ksu.edu";
  for (const url of ["https://mail.google.com", "https://drive.google.com/drive/my-drive", "https://www.google.com/search?q=cats",
    "https://docs.google.com/document/d/1/edit#heading=h.1", "https://calendar.google.com/calendar/r", "https://www.youtube.com/watch?v=x"]) {
    const out = withGoogleAccount(url, e);
    assert.equal(account(out), e, url);
  }
  assert.equal(new URL(withGoogleAccount("https://www.google.com/search?q=cats", e)).searchParams.get("q"), "cats", "other parameters stay");
  assert.equal(new URL(withGoogleAccount("https://docs.google.com/document/d/1/edit#heading=h.1", e)).hash, "#heading=h.1", "the hash stays");
  assert.equal(account(withGoogleAccount("https://mail.google.com/?authuser=0", e)), e, "an existing account is replaced");
  assert.equal(withGoogleAccount("https://mail.google.com/mail/u/1/#inbox", e), `https://mail.google.com/mail/u/${encodeURIComponent(e)}/?authuser=${encodeURIComponent(e)}#inbox`, "a /u/N/ account number is replaced too");
  for (const url of ["https://notion.so", "https://google.com.evil.test/x", "https://evilgoogle.com", "http://example.com/?q=google.com", "file:///Users/me/google.com.txt"]) {
    assert.equal(withGoogleAccount(url, e), url, `${url} is left alone`);
  }
  assert.equal(withGoogleAccount("https://mail.google.com", ""), "https://mail.google.com", "no account, no change");
  assert.equal(account(withGoogleAccount("https://www.google.com/search?q=x", 3)), "3", "an account number works too");
  assert.equal(account(withGoogleAccount("https://www.google.com/search?q=x", 0)), "0", "including number 0");
  assert.ok(withGoogleAccount("https://mail.google.com/mail/u/1/#inbox", 3).startsWith("https://mail.google.com/mail/u/3/?authuser=3"));
  assert.equal(withGoogleAccount("not a url", e), "not a url");
});

test("with a linked account, Google bookmarks open as that account; others are unchanged", async () => {
  const t = await openNewTab({ local: { atlasProfilesV2: profiles("school", EMAILS) } });
  const page = await openEssentials(t);
  assert.equal(account(link(page, "Gmail").href), EMAILS.school);
  assert.equal(account(link(page, "Google Calendar").href), EMAILS.school);
  assert.equal(link(page, "Notion").getAttribute("href"), "https://notion.so");
  assert.deepEqual(t.errors, []);
});

test("when the linked account is among the signed-in ones, links use its number (Google Search ignores an email)", async () => {
  // Measured 2026-10-09 in Vivaldi: google.com/search?authuser=<email> opened account 0; authuser=3 opened account 3.
  const found = { accounts: [
    { index: 0, name: "Other", email: "other@example.com", photo: "", signedIn: true },
    { index: 3, name: "Pat", email: EMAILS.school, photo: "", signedIn: true }], at: 1 };
  const t = await openNewTab({ sync: { selectedSearchEngine: "google" }, local: { atlasProfilesV2: profiles("school", EMAILS), atlasGoogleAccounts: found } });
  const { window: win, document: doc } = t;
  const input = doc.getElementById("search-input");
  type(win, input, "cats");
  key(win, input, "Enter");
  await settle(win, 100);
  assert.equal(account(plain(win.__navigations)[0]), "3");
  const page = await openEssentials(t);
  assert.equal(account(link(page, "Gmail").href), "3");
  await t.chrome.storage.local.set({ atlasGoogleAccounts: { accounts: [], at: 2, error: "offline" } });
  await settle(win, 50);
  link(page, "Gmail").dispatchEvent(new win.MouseEvent("mousedown", { bubbles: true }));
  assert.equal(account(link(page, "Gmail").href), EMAILS.school, "without a list, the email is used");
});

test("with no linked account, Google bookmarks open unchanged", async () => {
  const t = await openNewTab({ local: { atlasProfilesV2: profiles("school") } });
  const page = await openEssentials(t);
  assert.equal(link(page, "Gmail").getAttribute("href"), "https://mail.google.com");
});

test("a Google search and a bookmark pill open as the linked account", async () => {
  const t = await openNewTab({ sync: { selectedSearchEngine: "google" }, local: { atlasProfilesV2: profiles("school", EMAILS) } });
  const { window: win, document: doc } = t;
  const input = doc.getElementById("search-input");
  type(win, input, "cats");
  key(win, input, "Enter");
  await settle(win, 100);
  type(win, input, "gmail");
  await waitFor(() => doc.querySelectorAll("#bookmark-search-results .bookmark-search-item:not(.empty)").length === 1, 2000, "Gmail pill");
  key(win, input, "ArrowDown");
  key(win, input, "Enter");
  await settle(win, 100);
  type(win, input, "./calendar");
  const pill = await waitFor(() => doc.querySelector("#bookmark-search-results .bookmark-search-item:not(.empty)"), 2000, "Calendar pill");
  click(win, pill);
  await settle(win, 100);
  const navs = plain(win.__navigations);
  assert.equal(navs.length, 3, navs.join(" "));
  assert.equal(new URL(navs[0]).searchParams.get("q"), "cats");
  assert.deepEqual(navs.map(account), [EMAILS.school, EMAILS.school, EMAILS.school]);
});

test("switching profile switches the account, without a reload", async () => {
  const t = await openNewTab({ local: { atlasProfilesV2: profiles("school", EMAILS) } });
  const page = await openEssentials(t);
  assert.equal(account(link(page, "Gmail").href), EMAILS.school);
  await t.window.AtlasProfiles.switchTo("personal");
  await waitFor(() => account(link(page, "Gmail").href) === EMAILS.personal, 3000, "the personal account");
  assert.equal(t.window.__navigations, undefined, "no reload");
});

test("the edit page links, changes and unlinks the account; a non-email is refused", async () => {
  const t = await openNewTab({ local: { atlasProfilesV2: profiles("school") } });
  const { window: win, document: doc } = t;
  const stored = async () => plain((await t.chrome.storage.local.get(["atlasProfilesV2"])).atlasProfilesV2).list.find((p) => p.id === "school").google;
  click(win, doc.getElementById("global-settings-btn"));
  click(win, await waitFor(() => doc.querySelector('#sp-nav [data-page="profiles"]'), 2000, "Profiles"));
  click(win, await waitFor(() => doc.querySelector('#sp-content [data-pf-edit="school"]'), 2000, "Edit"));
  const field = () => doc.querySelector("#sp-content [data-pfe-google]");
  await waitFor(field, 2000, "Google account field");
  const set = (v) => { field().value = v; field().dispatchEvent(new win.Event("change", { bubbles: true })); };

  set("pat at school");
  await settle(win, 100);
  assert.match(text(doc.getElementById("sp-content")), /doesn't look like an email/);
  assert.equal(await stored(), null, "nothing saved");

  set("  pat@students.ksu.edu ");
  await settle(win, 100);
  assert.deepEqual(await stored(), { email: "pat@students.ksu.edu" });
  assert.equal(field().value, "pat@students.ksu.edu");

  click(win, doc.querySelector("#sp-content [data-pfe-google-unlink]"));
  await settle(win, 100);
  assert.equal(await stored(), null, "unlinked");
});
