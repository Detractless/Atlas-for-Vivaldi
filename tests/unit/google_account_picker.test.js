// Spec 002, phase 2: picking a profile's Google account with a click (design A
// of the picker mockups). The accounts the browser window found are listed in
// the Google row of a profile's edit page; one click links one.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { openNewTab, closeAll, waitFor, settle, click } = require("./helpers/newtabDom");

test.afterEach(closeAll);

const text = (el) => (el ? el.textContent.replace(/\s+/g, " ").trim() : "");
const plain = (v) => JSON.parse(JSON.stringify(v));
const PHOTO = "https://lh3.googleusercontent.com/a/photo-one";
const ACCOUNTS = [
  { index: 0, name: "Pat Example", email: "pat@gmail.com", photo: PHOTO, signedIn: true },
  { index: 1, name: "Pat (School)", email: "pat@school.edu", photo: "", signedIn: true },
  { index: 2, name: "Old Account", email: "old@example.com", photo: "", signedIn: false },
];

function profiles(google = null) {
  const p = (id, name, g) => ({ id, name, label: "", color: 0, icon: "", db: "", settings: {}, google: g });
  return { v: 2, active: "personal", owner: "personal", share: { bookmarks: true, theme: true, appearance: true, search: true, focus: true },
    list: [p("personal", "Pat", null), p("school", "Pat (School)", google)] };
}

async function editSchool(local) {
  const t = await openNewTab({ local: { atlasProfilesV2: profiles(local.google || null), ...(local.cache !== undefined ? { atlasGoogleAccounts: local.cache } : {}) } });
  const { window: win, document: doc } = t;
  click(win, doc.getElementById("global-settings-btn"));
  click(win, await waitFor(() => doc.querySelector('#sp-nav [data-page="profiles"]'), 2000, "Profiles"));
  click(win, await waitFor(() => doc.querySelector('#sp-content [data-pf-edit="school"]'), 2000, "Edit"));
  await waitFor(() => doc.querySelector("#sp-content [data-pfe-ga]"), 2000, "the Google row");
  await settle(win, 30);
  return t;
}

const content = (t) => t.document.getElementById("sp-content");
const rows = (t) => [...content(t).querySelectorAll("[data-pfe-pick]")];
const row = (t, email) => rows(t).find((r) => r.dataset.pfePick === email);
const linked = async (t) => plain((await t.chrome.storage.local.get(["atlasProfilesV2"])).atlasProfilesV2).list.find((p) => p.id === "school").google;

test("the found accounts are listed; one click links one and marks it", async () => {
  const t = await editSchool({ cache: { accounts: ACCOUNTS, at: 1 } });
  assert.deepEqual(rows(t).map((r) => r.dataset.pfePick), ["pat@gmail.com", "pat@school.edu", "old@example.com", ""], "each account, then None");
  assert.ok(text(row(t, "pat@gmail.com")).includes("Pat Example"));
  assert.equal(row(t, "pat@gmail.com").querySelector("img").getAttribute("src"), PHOTO, "Google's photo");
  assert.ok(row(t, "pat@school.edu").querySelector(".pfe-acc-initials"), "initials when there is no photo");
  assert.equal(content(t).querySelector("[data-pfe-google]"), null, "no email box until asked for");

  click(t.window, row(t, "pat@school.edu"));
  await settle(t.window, 100);
  assert.deepEqual(await linked(t), { email: "pat@school.edu" });
  assert.equal(row(t, "pat@school.edu").getAttribute("aria-pressed"), "true");
  assert.equal(row(t, "pat@gmail.com").getAttribute("aria-pressed"), "false");

  click(t.window, row(t, ""));
  await settle(t.window, 100);
  assert.equal(await linked(t), null, "None unlinks");
  assert.deepEqual(t.errors, []);
});

test("a signed-out account is marked and can't be picked", async () => {
  const t = await editSchool({ cache: { accounts: ACCOUNTS, at: 1 } });
  const old = row(t, "old@example.com");
  assert.ok(old.disabled, "disabled");
  assert.match(text(old), /signed out/);
});

test("a linked account that isn't signed in now is shown as such and stays linked", async () => {
  const t = await editSchool({ google: { email: "gone@example.com" }, cache: { accounts: ACCOUNTS, at: 1 } });
  const gone = row(t, "gone@example.com");
  assert.ok(gone, "listed");
  assert.equal(gone.getAttribute("aria-pressed"), "true");
  assert.match(text(gone), /not signed in right now/);
  await settle(t.window, 50);
  assert.deepEqual(await linked(t), { email: "gone@example.com" }, "still linked");
});

test("Type an email instead brings back the email box, which still works", async () => {
  const t = await editSchool({ cache: { accounts: ACCOUNTS, at: 1 } });
  click(t.window, content(t).querySelector("[data-pfe-typed]"));
  const box = await waitFor(() => content(t).querySelector("[data-pfe-google]"), 2000, "the email box");
  box.value = "not an email";
  box.dispatchEvent(new t.window.Event("change", { bubbles: true }));
  await settle(t.window, 100);
  assert.match(text(content(t)), /doesn't look like an email/);
  const again = content(t).querySelector("[data-pfe-google]");
  again.value = "typed@example.com";
  again.dispatchEvent(new t.window.Event("change", { bubbles: true }));
  await settle(t.window, 100);
  assert.deepEqual(await linked(t), { email: "typed@example.com" });
});

test("with no list, the reason and the email box show, as before", async () => {
  const t = await editSchool({ cache: { accounts: [], at: 1, error: "Could not reach Google: offline" } });
  assert.match(text(content(t).querySelector("[data-pfe-ga]")), /Couldn't read your Google accounts/);
  assert.ok(content(t).querySelector("[data-pfe-google]"), "the email box");
  assert.equal(rows(t).length, 0, "nothing to pick");
});

test("Refresh asks for a fresh list and shows it when it arrives", async () => {
  const t = await editSchool({ cache: { accounts: ACCOUNTS.slice(0, 1), at: 1 } });
  const before = t.control.sentMessages.length;
  click(t.window, content(t).querySelector("[data-pfe-ga-refresh]"));
  await settle(t.window, 30);
  assert.ok(t.control.sentMessages.slice(before).some((m) => m.atlas && m.atlas.act === "google-accounts" && m.atlas.refresh));
  assert.match(text(content(t).querySelector("[data-pfe-ga]")), /Looking/);
  await t.chrome.storage.local.set({ atlasGoogleAccounts: { accounts: ACCOUNTS, at: 2 } });
  await waitFor(() => rows(t).length === 4, 2000, "the new list");
});

test("names from Google are shown as text, and only Google's own photos are loaded", async () => {
  const odd = [
    { index: 0, name: "<img src=x onerror=alert(1)>", email: "odd@example.com", photo: "https://evil.example.com/p.png", signedIn: true },
    { index: 1, name: "Fine", email: "fine@example.com", photo: "javascript:alert(1)", signedIn: true },
  ];
  const t = await editSchool({ cache: { accounts: odd, at: 1 } });
  const r = row(t, "odd@example.com");
  assert.ok(text(r).includes("<img src=x onerror=alert(1)>"), "the name is text");
  assert.equal(content(t).querySelectorAll("[data-pfe-pick] img").length, 0, "no photo from anywhere else");
});
