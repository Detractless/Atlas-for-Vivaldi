/* ── The active profile's Google account (spec 001, phase 4) ────────────────
   A profile can be linked to one of the Google accounts signed into Vivaldi
   (its email, saved on the profile by profilesCore.js). While that profile is
   active, the Google links the new tab opens (bookmarks, searches, bookmark
   pills) carry the account, so Gmail, Drive and the rest open as it.

   How: Google picks the account from `authuser`, and from a /u/N/ part of the
   path, which is replaced too. The value is the account's number from the list
   the browser window found (spec 002, chrome.storage.local.atlasGoogleAccounts),
   because Google Search ignores an email there: measured 2026-10-09 in Vivaldi,
   google.com/search?authuser=<email> opened account 0 while authuser=3 opened
   account 3 (Gmail took either). The number is looked up again each time, as
   numbers shift when accounts sign in or out. Without a list, the email is
   used, which still works for Gmail.

   Not covered, on purpose (the user's decision): the address bar and anything
   typed there, searches the browser runs with its own default engine, and
   Google's country domains (google.co.uk and so on). Detecting the signed-in
   accounts is a follow-up for when the user shares the Google extension that
   does it. */

/* google.com and its subdomains, and YouTube; never a look-alike such as
   google.com.example.test or evilgoogle.com. */
const GOOGLE_HOST = /(^|\.)(google\.com|youtube\.com)$/i;
const ACCOUNT_IN_PATH = /(^|\/)u\/\d+(\/|$)/;

/** `url` set to open as `who` (an account number or an email), if it is a
    Google link; otherwise `url` unchanged. */
export function withGoogleAccount(url, who) {
  if (who === '' || who === null || who === undefined) return url;
  const value = String(who);
  let u;
  try {
    u = new URL(url);
  } catch (e) {
    return url; // not an absolute URL (a search term, say): nothing to change
  }
  if (!/^https?:$/.test(u.protocol) || !GOOGLE_HOST.test(u.hostname)) return url;
  if (ACCOUNT_IN_PATH.test(u.pathname)) {
    u.pathname = u.pathname.replace(ACCOUNT_IN_PATH, (m, before, after) => `${before}u/${encodeURIComponent(value)}${after}`);
  }
  u.searchParams.set('authuser', value);
  return u.toString();
}

/* The signed-in accounts the browser window found, kept current. */
let found = [];
try {
  chrome.storage.local.get(['atlasGoogleAccounts'], (r) => { found = (r && r.atlasGoogleAccounts && r.atlasGoogleAccounts.accounts) || []; });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.atlasGoogleAccounts) found = (changes.atlasGoogleAccounts.newValue || {}).accounts || [];
  });
} catch (e) { /* no chrome.storage (outside the browser, or a unit test): no list, emails are used */ }

/** The active profile's linked email, or '' when there is none. */
export function activeGoogleEmail() {
  const ap = typeof window !== 'undefined' ? window.AtlasProfiles : null;
  const p = ap && ap.active ? ap.active() : null;
  return (p && p.google && p.google.email) || '';
}

/** The active profile's account as Google should be asked for it: its number
    when it is signed in and found, else its email, else ''. */
export function activeGoogleAccount() {
  const email = activeGoogleEmail().toLowerCase();
  if (!email) return '';
  const a = found.find((x) => x && x.signedIn && String(x.email).toLowerCase() === email && Number.isInteger(x.index));
  return a ? a.index : activeGoogleEmail();
}

/** `url` as the active profile's Google account would open it. */
export function forActiveAccount(url) {
  return withGoogleAccount(url, activeGoogleAccount());
}
