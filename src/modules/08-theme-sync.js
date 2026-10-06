/* ── 08-theme-sync.js: Detractless extension theme synchronization and chrome class toggling ── */
(function () {
  'use strict';

  var lastCfg = null;
  var wantDark = false;
  var known = false;
  var browser = null;

  function val(v) { return v && v.value !== undefined ? v.value : v; }

  function resolveDark(cfg) {
    var m = (cfg && cfg.Theme) || 'dark';
    if (m === 'system') {
      m = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark' : 'light';
    }
    if (m === 'custom') m = 'dark';
    return m === 'dark';
  }

  function stamp() {
    if (!browser && typeof document !== 'undefined' && document.getElementById) browser = document.getElementById('browser');
    if (!browser) return;
    var has = browser.classList.contains('theme-dark');
    if (wantDark && !has) {
      browser.classList.add('theme-dark');
      browser.classList.remove('theme-light');
    } else if (!wantDark && has) {
      browser.classList.remove('theme-dark');
      browser.classList.add('theme-light');
    }
  }

  function syncVivaldiTheme() {
    if (!window.vivaldi || !vivaldi.prefs) return;
    var want = wantDark ? /atlas\s*dark/i : /atlas\s*light/i;
    try {
      vivaldi.prefs.get('vivaldi.themes.current', function (cur) {
        vivaldi.prefs.get('vivaldi.themes.user', function (user) {
          var all = val(user) || [];
          var t = all.filter(function (x) {
            return x && (want.test(x.name || '') || want.test(x.id || ''));
          })[0];
          if (t && t.id !== val(cur)) {
            vivaldi.prefs.set({ path: 'vivaldi.themes.current', value: t.id });
          }
        });
      });
    } catch (e) { void e; }
  }

  function applyChromeTheme(cfg) {
    lastCfg = cfg;
    wantDark = resolveDark(cfg);
    known = true;
    stamp();
    syncVivaldiTheme();
  }

  /* Re-read the saved theme and apply it. The chrome only changes on storage
     events, so after a missed one (a window opened mid-switch, Vivaldi restamping
     its own classes) it would stay on the wrong theme until the next change. */
  var lastRecon = 0;
  function reconcile() {
    var now = Date.now();
    if (now - lastRecon < 500) return;
    lastRecon = now;
    if (chrome.storage && chrome.storage.sync && chrome.storage.sync.get) {
      chrome.storage.sync.get('Theme', function (r) { applyChromeTheme((r && r.Theme) || null); });
    }
  }

  function watchClass() {
    if (typeof document === 'undefined' || !document.getElementById) return;
    browser = document.getElementById('browser');
    if (!browser) { var _t08 = setTimeout(watchClass, 200); if (_t08 && typeof _t08.unref === 'function') _t08.unref(); return; }
    stamp();
    /* If Vivaldi restamps the class away from the chosen theme, put it back in the
       same task: an observer callback runs before the next style recalc, so the
       wrong theme never paints. A 300ms debounce here showed the other theme's
       colors on every window focus change (measured: tab strip rgb(17,17,16)
       while the theme was light). stamp() writes only when the class is wrong.
       If something keeps flipping it back (>20 times in 1s), fall back to the
       debounce so the UI can't spin. */
    if (typeof MutationObserver !== 'undefined' && !browser.__atlasThemeWatch) {
      browser.__atlasThemeWatch = true;
      var fix = 0, burst = 0, burstAt = 0;
      new MutationObserver(function () {
        if (!known) return;
        var now = Date.now();
        if (now - burstAt > 1000) { burstAt = now; burst = 0; }
        if (++burst > 20) { clearTimeout(fix); fix = setTimeout(stamp, 300); return; }
        stamp();
      }).observe(browser, { attributes: true, attributeFilter: ['class'] });
    }
  }
  watchClass();

  if (chrome.storage && chrome.storage.sync && chrome.storage.sync.get) {
    chrome.storage.sync.get('Theme', function (r) { applyChromeTheme((r && r.Theme) || null); });
  }
  if (chrome.storage && chrome.storage.onChanged && chrome.storage.onChanged.addListener) {
    chrome.storage.onChanged.addListener(function (ch, area) {
      if (area === 'sync' && ch.Theme) applyChromeTheme(ch.Theme.newValue || null);
      if (area === 'local' && ch._themeCache) {
        applyChromeTheme({ Theme: ch._themeCache.newValue || null });
      }
    });
  }
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () {
      if (lastCfg && lastCfg.Theme === 'system') applyChromeTheme(lastCfg);
    });
  }

  if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('focus', reconcile);
  if (window.AtlasProfiles && window.AtlasProfiles.onChange) window.AtlasProfiles.onChange(reconcile);

  Atlas.resolveDark = resolveDark;
  Atlas.applyChromeTheme = applyChromeTheme;
})();
