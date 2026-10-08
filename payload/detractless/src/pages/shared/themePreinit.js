// src/pages/shared/themePreinit.js — sets data-theme before the first paint.
//
// Loaded as a plain <script src>, NEVER bundled. Bundled CSS and JS land after
// the first paint, so a page that resolved its theme from the bundle would flash
// the wrong one on every open.
//
// SHARED BY EVERY EXTENSION PAGE, on purpose. The side panel used to have no
// theme layer at all and fell back to a hardcoded light palette, so it rendered
// light while the app rendered dark. One copy of the resolution rule is what
// keeps that from happening again: if a page needs a theme, it loads this file.
//
// Scale is deliberately NOT handled here. It is new-tab-only (see
// ../newtab/preinit.js) because `body { zoom }` in a narrow side panel is wrong.
(function () {
  var root = document.documentElement;

  function resolveTheme(pref) {
    if (pref === 'system') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return pref || 'dark';
  }

  /**
   * Stamp a stored preference onto the document. Exposed so a page that learns
   * about a theme change AFTER first paint (the side panel, watching storage)
   * re-uses this resolution rule rather than copying it. A second copy of
   * `'system' -> matchMedia` is how the two would drift.
   */
  window.__applyTheme = function (pref) {
    root.setAttribute('data-theme', resolveTheme(pref));
  };

  // Ref-counted page hold. Theme and scale each have a slow path that must hide
  // the page while it resolves; without the count, whichever finished first would
  // reveal the page while the other was still pending.
  window.__preinitHold = function () {
    var n = (parseInt(root.dataset.preinitHold, 10) || 0) + 1;
    root.dataset.preinitHold = String(n);
    root.style.visibility = 'hidden';
  };
  window.__preinitRelease = function () {
    var n = Math.max(0, (parseInt(root.dataset.preinitHold, 10) || 1) - 1);
    if (n === 0) {
      root.style.visibility = '';
      delete root.dataset.preinitHold;
    } else {
      root.dataset.preinitHold = String(n);
    }
  };

  // Fast synchronous path: cache written by applyThemeConfig on every change.
  // Extension pages share one origin, so the side panel reads what the new tab
  // wrote without any message passing.
  var cached = null;
  try { cached = localStorage.getItem('_themeCache'); } catch (e) { /* no localStorage: take the slow path */ }
  if (cached) {
    root.setAttribute('data-theme', resolveTheme(cached));
    return;
  }

  // No cache yet (first load after install or upgrade): fall back to an async IDB
  // read, holding the page so it cannot paint the wrong theme first.
  window.__preinitHold();
  var applied = false;

  function finish(pref) {
    if (applied) return;
    applied = true;
    var p = pref;
    // Legacy key, still present if the uiPrefs migration has not run yet.
    if (!p) { try { p = localStorage.getItem('themePref'); } catch (e) { /* no localStorage: default theme */ } }
    root.setAttribute('data-theme', resolveTheme(p));
    window.__preinitRelease();
  }

  var fallback = setTimeout(function () { finish(null); }, 50);

  try {
    var req = indexedDB.open('DetractlessBookmarks');
    req.onsuccess = function () {
      clearTimeout(fallback);
      var db = req.result;
      db.onversionchange = function () { try { db.close(); } catch (e) { /* already closed */ } };
      try {
        if (!db.objectStoreNames.contains('uiPrefs')) { db.close(); finish(null); return; }
        var get = db.transaction('uiPrefs', 'readonly').objectStore('uiPrefs').get('themePref');
        get.onsuccess = function () {
          try { db.close(); } catch (e) { /* already closed */ }
          finish(get.result !== undefined ? get.result.value : null);
        };
        get.onerror = function () { try { db.close(); } catch (e) { /* already closed */ } finish(null); };
      } catch (e) { try { db.close(); } catch (e) { /* already closed */ } finish(null); }
    };
    req.onerror = function () { clearTimeout(fallback); finish(null); };
    // onupgradeneeded is followed by onsuccess, which is where finish() runs.
    req.onupgradeneeded = function (event) {
      clearTimeout(fallback);
      if (event && event.target && event.target.result) {
        try { event.target.result.close(); } catch (e) { /* already closed */ }
      }
    };
  } catch (e) {
    clearTimeout(fallback);
    finish(null);
  }
})();
