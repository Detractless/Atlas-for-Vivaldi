/* ── 11-theme-sync.js: Detractless extension theme synchronization and chrome class toggling ── */
(function () {
  'use strict';

  var lastCfg = null;
  var wantDark = false;
  var known = false;
  var browser = null;

  var syncSeq = 0;

  function val(v) { return v && v.value !== undefined ? v.value : v; }

  /* A flash of the wrong theme left no trace (2026-10-30). Every switch now goes
     into the shield debug log (event "theme"), so a flash can be matched to its cause. */
  function traceTheme(act, data) {
    try {
      if (typeof saveNsfwDebugEvents !== 'function') return;
      var d = data || {};
      d.act = act;
      saveNsfwDebugEvents([{ event: 'theme', page: 'browser-ui', t: new Date().toISOString(), data: d }]);
    } catch (e) { atlasWarn('theme trace', e); }
  }

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
    if (wantDark !== has) traceTheme('stamp', { dark: wantDark });
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
    /* Each call owns a number. The reads and the write are asynchronous, so an older
       call must not write after a newer one has started: the last request wins. */
    var mine = ++syncSeq;
    try {
      vivaldi.prefs.get('vivaldi.themes.current', function (cur) {
        if (mine !== syncSeq) return;
        vivaldi.prefs.get('vivaldi.themes.user', function (user) {
          if (mine !== syncSeq) return;
          var all = val(user) || [];
          var t = all.filter(function (x) {
            return x && (want.test(x.name || '') || want.test(x.id || ''));
          })[0];
          if (t && t.id !== val(cur)) {
            traceTheme('set', { from: val(cur), to: t.id });
            vivaldi.prefs.set({ path: 'vivaldi.themes.current', value: t.id });
          }
        });
      });
    } catch (e) { atlasWarn('theme sync', e); }
  }

  /* Vivaldi's "website appearance" setting (0 follow the Mac, 1 light, 2 dark) decides whether
     Chromium's own pages (History, Downloads, Bookmarks) and websites render light or dark. It
     follows the Atlas Theme, so those pages match the browser instead of the Mac. */
  var SCHEME_PREF = 'vivaldi.PreferredColorScheme';
  function wantScheme(cfg) {
    var m = (cfg && cfg.Theme) || 'dark';
    return m === 'system' ? 0 : m === 'light' ? 1 : 2;
  }
  var schemeSeq = 0;
  function syncWebScheme(cfg) {
    if (!window.vivaldi || !vivaldi.prefs) return;
    var want = wantScheme(cfg), mine = ++schemeSeq;
    try {
      vivaldi.prefs.get(SCHEME_PREF, function (cur) {
        if (mine !== schemeSeq || val(cur) === want) return;
        traceTheme('scheme', { from: val(cur), to: want });
        vivaldi.prefs.set({ path: SCHEME_PREF, value: want });
      });
    } catch (e) { atlasWarn('scheme sync', e); }
  }

  function applyChromeTheme(cfg) {
    /* A read that comes back empty (a window opened mid-switch, storage not ready)
       means "dark" for a first paint, but must not undo a theme already chosen. */
    if (known && !(cfg && cfg.Theme)) { traceTheme('ignoredEmpty', {}); return; }
    lastCfg = cfg;
    wantDark = resolveDark(cfg);
    known = true;
    stamp();
    syncVivaldiTheme();
    syncWebScheme(cfg);
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

})();
