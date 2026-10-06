// src/pages/newtab/preinit.js — applies UI scale before the first paint.
//
// THEME IS NOT HANDLED HERE any more. It moved to ../shared/themePreinit.js so
// the side panel could use the same resolution rule; index.html loads that file
// first, then this one. Scale stayed behind because it is new-tab-only: the side
// panel must not be zoomed.
//
// The page hold is ref-counted by themePreinit (__preinitHold/__preinitRelease),
// so this file and the theme one can each hide the page on their slow path
// without one revealing it while the other is still pending.
(function () {
  function hold() { if (window.__preinitHold) window.__preinitHold(); }
  function release() { if (window.__preinitRelease) window.__preinitRelease(); }

  function applyScale(scale) {
    if (isNaN(scale) || scale === 1) return;
    var pct = (1 / scale - 1) * 50;
    var s = document.createElement('style');
    s.id = 'pre-scale';
    s.textContent = 'body{zoom:' + scale + ';margin-left:' + pct + 'vw!important;margin-top:' + pct + 'vh!important}';
    document.head.appendChild(s);
  }

  // Fast synchronous path: cache written by applyScale in displayEffects.js.
  var cached = null;
  try { cached = localStorage.getItem('_scaleCache'); } catch (e) {}
  if (cached !== null) {
    applyScale(parseFloat(cached));
    return;
  }

  // No cache yet: read uiPrefs, holding the page so it cannot paint unscaled and
  // then jump. Previously this branch was reachable only when the THEME cache was
  // also cold, so a profile with a theme cache but no scale cache silently skipped
  // scaling until the bundle ran. The two caches are independent now.
  hold();
  var applied = false;

  function finish(scale) {
    if (applied) return;
    applied = true;
    var s = scale;
    if (isNaN(s)) { try { s = parseFloat(localStorage.getItem('uiScale') || ''); } catch (e) {} }
    applyScale(s);
    release();
  }

  var fallback = setTimeout(function () { finish(NaN); }, 50);

  try {
    var req = indexedDB.open('DetractlessBookmarks');
    req.onsuccess = function () {
      clearTimeout(fallback);
      var db = req.result;
      try {
        if (!db.objectStoreNames.contains('uiPrefs')) { db.close(); finish(NaN); return; }
        var get = db.transaction('uiPrefs', 'readonly').objectStore('uiPrefs').get('uiScale');
        get.onsuccess = function () {
          db.close();
          finish(get.result !== undefined ? parseFloat(get.result.value) : NaN);
        };
        get.onerror = function () { db.close(); finish(NaN); };
      } catch (e) { db.close(); finish(NaN); }
    };
    req.onerror = function () { clearTimeout(fallback); finish(NaN); };
    // onupgradeneeded is followed by onsuccess, which is where finish() runs.
    req.onupgradeneeded = function () { clearTimeout(fallback); };
  } catch (e) {
    clearTimeout(fallback);
    finish(NaN);
  }
})();
