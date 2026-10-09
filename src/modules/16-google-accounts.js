/* ── 16-google-accounts.js: the Google accounts signed into Vivaldi (spec 002) ──
   Google keeps a list of the accounts signed into this browser at
   accounts.google.com/ListAccounts. This window (Vivaldi's own UI extension,
   which may send the browser's cookies there) reads it at start and when the
   new tab asks, and caches it in chrome.storage.local.atlasGoogleAccounts:
     { accounts: [{ index, name, email, photo, signedIn }], at, error? }
   The list stays on this computer: it is not in backups and goes nowhere but
   back to Google. A profile's edit page shows it; later phases switch Google
   pages to the account linked to the active profile.

   The approach comes from the "Google Accounts Autopilot" extension the user
   pointed at; none of its code is used. The reply's format is Google's and
   undocumented, so every reading of it fails soft: no list, a reason cached. ── */

var GOOGLE_ACCOUNTS_URL = 'https://accounts.google.com/ListAccounts?gpsia=1&source=ogb&mo=1&origin=https://accounts.google.com';
var GA_EMAIL = /^[^\s@"'<>]+@[^\s@"'<>]+\.[^\s@"'<>]+$/;
var gaCache = null;        // the last list, kept in memory for accountFor()
var gaRefreshing = null;   // one read at a time

/* The reply's list sits in a JavaScript string; undo its escapes (\xNN, \uNNNN,
   \/, \', \\ ...). A \n is dropped, as a raw newline would break the JSON. */
function unescapeJsString(s) {
  return s.replace(/\\(x[0-9a-fA-F]{2}|u[0-9a-fA-F]{4}|[\s\S])/g, function (m, e) {
    if (e.length > 1) return String.fromCharCode(parseInt(e.slice(1), 16));
    return e === 'n' ? '' : e;
  });
}

/* { accounts, ok }: ok is false when the reply isn't the list at all (the
   format changed, or a sign-in page came back), so it can be told apart from
   "no accounts signed in". */
function readAccountList(text) {
  var script = /<script[^>]*>([\s\S]*?)<\/script>/i.exec(String(text || ''));
  var quoted = script && /'((?:[^'\\]|\\[\s\S])*)'/.exec(script[1]);
  var data = null;
  if (quoted) {
    try { data = JSON.parse(unescapeJsString(quoted[1])); } catch (e) { data = null; /* not JSON: not the list */ }
  }
  if (!Array.isArray(data) || !Array.isArray(data[1])) return { accounts: [], ok: false };
  var accounts = [];
  data[1].forEach(function (a, i) {
    if (!Array.isArray(a) || typeof a[3] !== 'string' || !GA_EMAIL.test(a[3])) return;
    accounts.push({
      index: typeof a[7] === 'number' ? a[7] : i,
      name: typeof a[2] === 'string' ? a[2] : '',
      email: a[3],
      photo: typeof a[4] === 'string' ? a[4] : '',
      /* Signed-out accounts stay listed with fewer fields; the reference
         extension tells them apart the same way. */
      signedIn: a.length >= 16
    });
  });
  return { accounts: accounts, ok: true };
}

function parseAccountList(text) {
  return readAccountList(text).accounts;
}

function saveGoogleAccounts(cache) {
  gaCache = cache;
  return new Promise(function (resolve) {
    chrome.storage.local.set({ atlasGoogleAccounts: cache }, function () { void chrome.runtime.lastError; resolve(cache); });
  });
}

/** Read the list from Google now and cache it (a failure is cached as `error`). */
function refreshGoogleAccounts() {
  if (gaRefreshing) return gaRefreshing;
  gaRefreshing = Promise.resolve()
    .then(function () { return fetch(GOOGLE_ACCOUNTS_URL, { method: 'GET', credentials: 'include' }); })
    .then(function (r) {
      if (!r.ok) throw new Error('Google answered ' + r.status);
      return r.text();
    })
    .then(function (text) {
      var got = readAccountList(text);
      return saveGoogleAccounts(got.ok ? { accounts: got.accounts, at: Date.now() }
        : { accounts: [], at: Date.now(), error: "Google's reply was not in the expected format." });
    }, function (err) {
      atlasWarn('reading the Google accounts failed', err);
      return saveGoogleAccounts({ accounts: [], at: Date.now(), error: 'Could not reach Google: ' + ((err && err.message) || err) });
    })
    .then(function (cache) { gaRefreshing = null; return cache; });
  return gaRefreshing;
}

/** The signed-in account with this email (any case), as { email, index }, or null. */
function accountFor(email) {
  var want = String(email || '').toLowerCase();
  var list = (gaCache && gaCache.accounts) || [];
  var a = want ? list.filter(function (x) { return x.signedIn && x.email.toLowerCase() === want; })[0] : null;
  return a ? { email: a.email, index: a.index } : null;
}

Atlas.googleAccounts = { parseAccountList: parseAccountList, refreshGoogleAccounts: refreshGoogleAccounts, accountFor: accountFor };

/* The new tab asks with { atlas: { act: 'google-accounts', refresh } }. */
if (chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    var m = msg && msg.atlas;
    if (!m || m.act !== 'google-accounts') return false;
    (m.refresh || !gaCache ? refreshGoogleAccounts() : Promise.resolve(gaCache)).then(sendResponse);
    return true;
  });
}

if (chrome.storage && chrome.storage.local) {
  chrome.storage.local.get(['atlasGoogleAccounts'], function (r) {
    void chrome.runtime.lastError;
    if (r && r.atlasGoogleAccounts && !gaCache) gaCache = r.atlasGoogleAccounts;
    refreshGoogleAccounts();
  });
}
