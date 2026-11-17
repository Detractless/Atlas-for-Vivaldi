/* ── 17-google-switch.js: Google pages follow the active profile's account ──
   Spec 002, phases 3 and 4. The active profile's linked email (profilesCore.js)
   is looked up among the signed-in accounts (accountFor, 16-google-accounts.js)
   and Google is asked for that account by its number, `authuser=N` (Google
   Search ignores an email there; measured 2026-10-09).

   - Phase 3: switching profile reloads the active tab, if it is a Google page
     showing another account; other Google tabs open at the time switch when
     the user moves to them, once. Reloading them all at once could cost
     unsaved work in a background tab.
   - Phase 4: atlas-google-account.js asks, from every Google page that opens,
     whether it should show another account (act 'google-account-for-page').
     redirectFor decides both cases. ── */

var GS_HOST = /(^|\.)(google\.com|gmail\.com|youtube\.com)$/i;
var GS_NEVER = /^accounts\.google\.com$/i;   // sign-in pages: never redirected
var GS_PATH_ACCOUNT = /(^|\/)u\/(\d+)(\/|$)/;

/* The account an address asks for: ?authuser= (a number or an email), else a
   /u/N/ part of the path, else null (Google then shows account 0). */
function shownAccount(u) {
  if (u.searchParams.has('authuser')) return u.searchParams.get('authuser');
  var m = GS_PATH_ACCOUNT.exec(u.pathname);
  return m ? m[2] : null;
}

/**
 * The address `url` should open at to show `account` ({ email, index }), or
 * null to leave it. An address that names an account is left alone unless
 * `opts.force` (a profile switch). Only Google, Gmail and YouTube pages over
 * http(s) are ever changed, never Google's sign-in pages.
 */
function redirectFor(url, account, opts) {
  opts = opts || {};
  if (!account || typeof account.index !== 'number') return null;
  var u;
  try { u = new URL(url); } catch (e) { return null; /* not an address */ }
  if (!/^https?:$/.test(u.protocol) || !GS_HOST.test(u.hostname) || GS_NEVER.test(u.hostname)) return null;
  var shown = shownAccount(u), want = String(account.index);
  if (shown !== null && !opts.force) return null;
  if (shown === null ? want === '0' : (shown === want || shown.toLowerCase() === account.email.toLowerCase())) return null;
  if (GS_PATH_ACCOUNT.test(u.pathname)) {
    u.pathname = u.pathname.replace(GS_PATH_ACCOUNT, function (m, before, n, after) { return before + 'u/' + want + after; });
  }
  u.searchParams.set('authuser', want);
  return u.toString();
}

/* The active profile's linked account, if it is signed in now. */
function linkedAccount() {
  var ap = window.AtlasProfiles, p = ap && ap.active ? ap.active() : null;
  return p && p.google && p.google.email ? accountFor(p.google.email) : null;
}

Atlas.googleAccounts.redirectFor = redirectFor;

if (chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    var m = msg && msg.atlas;
    if (!m || m.act !== 'google-account-for-page') return false;
    sendResponse({ redirect: redirectFor(m.url, linkedAccount()) });
    return false;
  });
}

/* ── Phase 3: the profile switch ─────────────────────────────────────── */

var gsActive = null;      // the profile this window last saw as active
var gsPending = {};       // tab id -> true: Google tabs to switch when shown

function switchTab(tab) {
  if (!tab || !tab.url) return;
  var to = redirectFor(tab.url, linkedAccount(), { force: true });
  if (to) chrome.tabs.update(tab.id, { url: to }, function () { void chrome.runtime.lastError; });
}

function onProfileSwitch() {
  chrome.tabs.query({ currentWindow: true }, function (tabs) {
    void chrome.runtime.lastError;
    gsPending = {};
    (tabs || []).forEach(function (t) {
      if (t.active) switchTab(t);
      else if (t.url && redirectFor(t.url, linkedAccount(), { force: true })) gsPending[t.id] = true;
    });
  });
}

if (window.AtlasProfiles && chrome.tabs) {
  window.AtlasProfiles.ready.then(function (s) {
    gsActive = s ? s.active : null;
    window.AtlasProfiles.onChange(function (st) {
      var now = st && st.active;
      if (!now || now === gsActive) return;
      gsActive = now;
      onProfileSwitch();
    });
  });
  if (chrome.tabs.onActivated) {
    chrome.tabs.onActivated.addListener(function (info) {
      if (!gsPending[info.tabId]) return;
      delete gsPending[info.tabId];
      chrome.tabs.get(info.tabId, function (tab) { void chrome.runtime.lastError; switchTab(tab); });
    });
  }
}
