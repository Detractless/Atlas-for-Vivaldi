/* ── 00-shared.js: helpers every module may use. Loaded first. ── */

/* Report a failure that should not stop the window: an action from a menu that
   threw, for example. A swallowed error is invisible; this shows where it came from. */
function atlasWarn(where, err) {
  try { console.warn('[Atlas] ' + where, err); } catch (e) { /* no console in this context */ }
}
