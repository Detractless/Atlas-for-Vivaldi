/* ── The active profile's Google account (spec 001, phase 4) ────────────────
   A profile can be linked to one of the Google accounts signed into Vivaldi
   (its email, saved on the profile by profilesCore.js). While that profile is
   active, the Google links the new tab opens (bookmarks, searches, bookmark
   pills) carry the account, so Gmail, Drive and the rest open as it.

   How: Google picks the account from `authuser` (an email works, and unlike
   the u/0, u/1 numbers it does not shift when accounts sign in or out), and
   from a /u/N/ part of the path, which is replaced by the email too.

   Not covered, on purpose (the user's decision): the address bar and anything
   typed there, searches the browser runs with its own default engine, and
   Google's country domains (google.co.uk and so on). Detecting the signed-in
   accounts is a follow-up for when the user shares the Google extension that
   does it. */

/* google.com and its subdomains, and YouTube; never a look-alike such as
   google.com.example.test or evilgoogle.com. */
const GOOGLE_HOST = /(^|\.)(google\.com|youtube\.com)$/i;
const ACCOUNT_IN_PATH = /(^|\/)u\/\d+(\/|$)/;

/** `url` set to open as `email`, if it is a Google link; otherwise `url` unchanged. */
export function withGoogleAccount(url, email) {
  if (!email) return url;
  let u;
  try {
    u = new URL(url);
  } catch (e) {
    return url; // not an absolute URL (a search term, say): nothing to change
  }
  if (!/^https?:$/.test(u.protocol) || !GOOGLE_HOST.test(u.hostname)) return url;
  if (ACCOUNT_IN_PATH.test(u.pathname)) {
    u.pathname = u.pathname.replace(ACCOUNT_IN_PATH, (m, before, after) => `${before}u/${encodeURIComponent(email)}${after}`);
  }
  u.searchParams.set('authuser', email);
  return u.toString();
}

/** The active profile's linked email, or '' when there is none. */
export function activeGoogleEmail() {
  const ap = typeof window !== 'undefined' ? window.AtlasProfiles : null;
  const p = ap && ap.active ? ap.active() : null;
  return (p && p.google && p.google.email) || '';
}

/** `url` as the active profile's Google account would open it. */
export function forActiveAccount(url) {
  return withGoogleAccount(url, activeGoogleEmail());
}
