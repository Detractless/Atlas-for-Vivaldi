/* Scroll fade, the counting: how long and how far you scroll, added to one total for every site.
   Injected as a content script on web pages (src/modules/03-bridge-content-scripts.js), top frame only, never in a
   private window. The setting is `scrollFade` in chrome.storage.sync (payload/detractless/src/utils/scrollFade.js,
   Settings > Focus). The dimming is not done here: src/modules/36-scroll-fade-layer.js draws it in the browser window,
   over every page, and keeps the wait. This script can't import the setting's file, so normalize() repeats the fields it
   needs (on, except, restSeconds) in the same words; tests/unit/scroll_fade_rules.test.js feeds both the same values.

   What counts is measured the way Settings > Usage measures scrolling (atlas-usage.js): distance in window heights,
   and the time actually spent scrolling (steady scrolling adds up; a lone flick counts a tenth of a second). A jump of
   more than two screens in one step (Home, End, a page returning to the top) is not scrolling. Endless feeds count the
   same as any page. Scrolling in a box inside the page counts too. Nothing counts on a site the user excepted.

   The total is { ms, screens, last, until } in chrome.storage.local (atlas_scroll_fade), the same for every site and tab.
   It is saved at most once a second, as an addition to what is stored, so two tabs don't overwrite each other. While a
   wait is running (`until` is in the future) scrolling adds nothing: the wait can't be shortened or lengthened. A page
   that has rested longer than the rest, or whose wait is over, starts the total again from nothing. Only numbers are
   kept, never an address. */
(function () {
  'use strict';
  if (window.top !== window || window.__atlasScrollFade) return;
  var F = window.__atlasScrollFade = {};
  try {
    if (chrome.extension && chrome.extension.inIncognitoContext) return;
  } catch (e) { /* chrome.extension is not there in this context, so this is not a private window */ }
  if (!window.chrome || !chrome.storage || !chrome.storage.sync || !chrome.storage.local) return;

  var HOST = String(location.hostname || '').toLowerCase().replace(/^www\./, '');
  if (!HOST) return;
  var KEY = 'scrollFade', STORE = 'atlas_scroll_fade';
  var JUMP_SCREENS = 2, SAVE_MS = 1000;
  var SITE_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

  /* ── the setting (utils/scrollFade.js, in the same words, for the fields this script uses) ── */
  function num(v, lo, hi, fallback) {
    var n = Number(v);
    return isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
  }
  function cleanSite(text) {
    var host = String(text == null ? '' : text).trim().toLowerCase()
      .replace(/^[a-z][a-z0-9+.-]*:\/\//, '').replace(/^www\./, '').replace(/[/?#:].*$/, '').replace(/\.$/, '');
    return SITE_RE.test(host) ? host : null;
  }
  function normalize(value) {
    var v = value && typeof value === 'object' ? value : {}, except = [];
    if (Array.isArray(v.except)) {
      v.except.forEach(function (s) { var c = cleanSite(s); if (c && except.indexOf(c) < 0 && except.length < 60) except.push(c); });
    }
    return { on: v.on === true, restSeconds: num(v.restSeconds, 10, 3600, 60), except: except };
  }
  function clean(raw) {
    var r = raw && typeof raw === 'object' ? raw : {};
    function n(v) { return isFinite(Number(v)) && Number(v) > 0 ? Number(v) : 0; }
    return { ms: n(r.ms), screens: n(r.screens), last: n(r.last), until: n(r.until) };
  }

  /* ── what is counted, and when it is saved ── */
  var st = { cfg: normalize(null), applies: false, ms: 0, screens: 0, last: 0, savedAt: 0, timer: 0 };

  function configure(raw) {
    st.cfg = normalize(raw);
    st.applies = st.cfg.on && !st.cfg.except.some(function (s) { return HOST === s || HOST.slice(-s.length - 1) === '.' + s; });
    if (!st.applies) { st.ms = 0; st.screens = 0; }
  }

  /* Add what was counted since the last save to the stored total (which another tab may have moved on). */
  function save(now) {
    if (st.timer) { clearTimeout(st.timer); st.timer = 0; }
    if (!st.ms && !st.screens) return;
    var add = { ms: st.ms, screens: st.screens }, last = st.last;
    st.ms = 0; st.screens = 0; st.savedAt = now;
    try {
      chrome.storage.local.get([STORE], function (items) {
        var t = clean(items && items[STORE]);
        if (t.until > last) return;   // a wait was running when this was scrolled: it counts for nothing
        if (t.until > 0 || ((t.ms || t.screens) && last - t.last >= st.cfg.restSeconds * 1000)) t = clean(null);   // over: start again
        chrome.storage.local.set({ atlas_scroll_fade: { ms: Math.round(t.ms + add.ms), screens: Math.round((t.screens + add.screens) * 100) / 100, last: Math.max(last, t.last), until: 0 } }, function () { void chrome.runtime.lastError; });
      });
    } catch (e) { /* the extension was reloaded since this page loaded: nowhere to keep the total */ }
  }

  /* ── scrolling ── */
  var lastTop = new WeakMap(), lastScrollAt = Date.now();
  function root() { return document.scrollingElement || document.documentElement; }
  function onScroll(e) {
    var el = e.target === document ? root() : e.target;
    if (!el || typeof el.scrollTop !== 'number') return;
    var before = lastTop.get(el), now = Date.now(), gap = now - lastScrollAt;
    lastTop.set(el, el.scrollTop);
    lastScrollAt = now;
    if (!st.applies || before === undefined) return;
    var screens = Math.abs(el.scrollTop - before) / (window.innerHeight || 1);
    if (screens === 0 || screens > JUMP_SCREENS) return;   // a jump (Home, End, a page back at its top), not scrolling
    st.screens += screens;
    st.ms += gap < 500 ? gap : 100;
    st.last = now;
    if (now - st.savedAt >= SAVE_MS) save(now);
    else if (!st.timer) st.timer = setTimeout(function () { save(Date.now()); }, SAVE_MS - (now - st.savedAt));
  }

  document.addEventListener('scroll', onScroll, { capture: true, passive: true });
  document.addEventListener('visibilitychange', function () { if (document.visibilityState !== 'visible') save(Date.now()); });
  window.addEventListener('pagehide', function () { save(Date.now()); });
  var base = root();
  if (base) lastTop.set(base, base.scrollTop || 0);

  chrome.storage.sync.get([KEY], function (items) { configure(items && items[KEY]); });
  if (chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener(function (changes, area) { if (area === 'sync' && changes[KEY]) configure(changes[KEY].newValue); });
  }

  F.internals = { normalize: normalize, cleanSite: cleanSite, state: st, save: save };
})();
