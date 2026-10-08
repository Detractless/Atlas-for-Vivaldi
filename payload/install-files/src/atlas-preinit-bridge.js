/* Atlas bridge: replays Detractless's pre-paint caches once the localStorage
   shim has loaded.

   In the native setup window.localStorage is a shim backed by
   chrome.storage.local, whose data arrives ASYNCHRONOUSLY — so when
   themePreinit.js / preinit.js take their synchronous fast path
   (localStorage.getItem('_themeCache'/'_scaleCache')) the cache always reads
   empty and the default theme/scale flashes through before the bundle
   corrects it. This script is inserted at the END of <head> by reinstall.ps1,
   after both preinit scripts: it takes the preinit page hold, waits for the
   shim (a few ms), applies the cached theme via the preinit's own
   __applyTheme, applies the cached scale the way preinit.js does (index.html
   only — the side panel must never be zoomed), and releases. */
(function () {
  'use strict';
  if (!window.__atlasStorageReady) return;

  var held = false;
  if (window.__preinitHold) { window.__preinitHold(); held = true; }
  /* The page's body has a 220ms background-color transition. The theme gets
     stamped dark first and then light while the page is still hidden, but CSS
     transitions run while hidden, so the reveal landed mid-fade (the dark to
     white flash). Kill transitions until a moment after the reveal. */
  var nt = document.createElement('style');
  nt.textContent = '*,*::before,*::after{transition:none !important;}';
  (document.head || document.documentElement).appendChild(nt);
  function release() {
    if (held) {
      held = false;
      window.__preinitRelease();
      setTimeout(function () { if (nt.parentNode) nt.parentNode.removeChild(nt); }, 400);
    }
  }
  /* Safety net: storage must never be able to hold a blank page. */
  var fallback = setTimeout(release, 400);

  window.__atlasStorageReady.then(function () {
    clearTimeout(fallback);
    try {
      var theme = localStorage.getItem('_themeCache');
      if (theme && window.__applyTheme) {
        window.__applyTheme(theme);
        /* themePreinit's fast synchronous cache read ALWAYS misses here: on the
           native setup localStorage is the async shim, so getItem('_themeCache')
           returns null at pre-paint and themePreinit falls to its async path,
           whose 50ms fallback (and a possibly-late IndexedDB read) stamps the
           DEFAULT 'dark' onto data-theme. That can land AFTER this apply, so the
           panel would open dark on a light profile — a per-load race decided by
           which write happens last. Re-assert the cached pref on any deviation
           for a short window after load, then stop (the page's own storage
           watcher owns changes from then on). Mirrors atlas.js §10's approach to
           React re-stamping the browser theme. */
        var root = document.documentElement;
        var want = root.getAttribute('data-theme');
        var obs = new MutationObserver(function () {
          if (root.getAttribute('data-theme') !== want) window.__applyTheme(theme);
        });
        obs.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
        setTimeout(function () { obs.disconnect(); }, 800);
      }

      if (/\/index\.html$/.test(location.pathname)) {
        var scale = parseFloat(localStorage.getItem('_scaleCache'));
        if (!isNaN(scale) && scale !== 1 && !document.getElementById('pre-scale')) {
          var pct = (1 / scale - 1) * 50;
          var s = document.createElement('style');
          s.id = 'pre-scale';
          s.textContent = 'body{zoom:' + scale + ';margin-left:' + pct + 'vw!important;margin-top:' + pct + 'vh!important}';
          document.head.appendChild(s);
        }
      }
    } catch (e) { /* replaying the caches is only a speed-up; the page still loads */ }
    release();
  });
})();
