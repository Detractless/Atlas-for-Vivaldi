// src/services/log.js — one way to report a failure that should not stop the page.
// A swallowed error is invisible; one that goes through here shows in the console
// with where it came from.
export function warn(where, err) {
  try { console.warn('[Atlas] ' + where, err); } catch (e) { /* no console in this context */ }
}
