/* ── 36-scroll-fade-layer.js: Scroll fade's dimming, drawn over the page area of this window. ──
   Scroll fade (Settings > Focus) dims every page the longer or farther you scroll, on any site, and holds it fully dim
   for a wait you can't shorten. components/atlas/atlas-scroll-fade.js counts the scrolling on pages and adds it to one
   total (chrome.storage.local atlas_scroll_fade: { ms, screens, last, until }). This module reads that total, draws
   the dimming and keeps the wait: it decides when the page is fully dim, and when a rest or a wait is over.
   The layer is drawn here, like the Focus colour filter (22-page-saturation.js), not inside each page, so it reaches
   pages no script can run in (the Web Store), it is already there when the next page starts, and one layer serves every
   tab. It shows only while the tab you are on is a web page that is not on the excepted list: Atlas's own pages and
   Vivaldi's stay clear, so Settings can always be read. It never takes a click.
   utils/scrollFade.js has the same rules in tested form; normalize(), progress() and settle() here repeat it, and
   tests/unit/scroll_fade_rules.test.js feeds both the same values. Keep them the same. */
(function () {
  'use strict';

  var KEY = 'scrollFade', STORE = 'atlas_scroll_fade', STACK = '#webpage-stack';
  var INTERNAL = /^(chrome|chrome-extension|vivaldi|devtools|about):/i;
  var SITE_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;
  var TICK_MS = 1000, FADE_MS = 1200, SHOW_PILL_AT = 0.5;

  /* ── the setting and its rules (utils/scrollFade.js, in the same words) ── */
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
    return {
      on: v.on === true,
      by: ['either', 'time', 'distance'].indexOf(v.by) >= 0 ? v.by : 'either',
      minutes: num(v.minutes, 1, 240, 5),
      screens: num(v.screens, 5, 5000, 150),
      darkest: num(v.darkest, 10, 90, 70),
      restSeconds: num(v.restSeconds, 10, 3600, 60),
      waitMinutes: num(v.waitMinutes, 1, 240, 10),
      except: except
    };
  }
  function progress(c, ms, screens) {
    var t = c.by === 'distance' ? 0 : ms / (c.minutes * 60000);
    var d = c.by === 'time' ? 0 : screens / c.screens;
    return Math.min(1, Math.max(0, t, d));
  }
  function clean(raw) {
    var r = raw && typeof raw === 'object' ? raw : {};
    function n(v) { return isFinite(Number(v)) && Number(v) > 0 ? Number(v) : 0; }
    return { ms: n(r.ms), screens: n(r.screens), last: n(r.last), until: n(r.until) };
  }
  /* The total at `now`: a wait holds until it ends, a page not fully dim clears after the rest, full dark starts the wait. */
  function settle(c, raw, now) {
    var t = clean(raw);
    if (t.until > 0) return now >= t.until ? clean(null) : t;
    if ((t.ms || t.screens) && now - t.last >= c.restSeconds * 1000) return clean(null);
    if (progress(c, t.ms, t.screens) >= 1) { t.until = now + c.waitMinutes * 60000; }
    return t;
  }
  function excepted(c, host) {
    return c.except.some(function (s) { return host === s || host.slice(-s.length - 1) === '.' + s; });
  }

  /* ── what is on screen ── */
  var cfg = normalize(null);   // the setting
  var tot = clean(null);       // the total
  var url = '';                // the address of the tab you are on in this window; '' until it is known, which counts as clear
  var el = null, dimEl = null, pillEl = null, timer = 0, drawn = -1, text = '', pillOn = false;

  function hostOf(address) {
    try { return new URL(address).hostname.toLowerCase().replace(/^www\./, ''); } catch (e) { return ''; }
  }
  /* Whether the tab you are on is dimmed: a web page, and not one the user excepted. */
  function dimmed() {
    if (!cfg.on || !url || INTERNAL.test(url)) return false;
    var host = hostOf(url);
    return !!host && !excepted(cfg, host);
  }
  function clock(seconds) { return Math.floor(seconds / 60) + ':' + ('0' + (seconds % 60)).slice(-2); }

  function build() {
    el = document.createElement('div');
    el.id = 'atlas-scroll-fade-layer';
    el.setAttribute('style', 'position:absolute;left:0;top:0;right:0;bottom:0;pointer-events:none;');
    dimEl = document.createElement('div');
    dimEl.setAttribute('style', 'position:absolute;left:0;top:0;right:0;bottom:0;background:#000;opacity:0;pointer-events:none;transition:opacity ' + FADE_MS + 'ms ease;');
    pillEl = document.createElement('div');
    pillEl.setAttribute('style', 'position:absolute;right:16px;bottom:16px;padding:6px 12px;border-radius:9999px;background:rgba(24,24,24,.92);color:#fff;font:600 12px/16px system-ui,-apple-system,sans-serif;font-variant-numeric:tabular-nums;opacity:0;pointer-events:none;transition:opacity .4s ease;');
    el.appendChild(dimEl); el.appendChild(pillEl);
    drawn = -1; text = ''; pillOn = false;
  }

  /* The layer goes after the page stack in its container, so it is over every page and under Vivaldi's own popups. */
  function attach() {
    var stack = document.querySelector(STACK), parent = stack && stack.parentNode;
    if (!parent) return false;
    if (!el) build();
    if (el.parentNode !== parent) parent.appendChild(el);
    return true;
  }
  function detach() {
    if (el && el.parentNode) el.parentNode.removeChild(el);
    el = dimEl = pillEl = null;
  }

  function paint(now) {
    if (!cfg.on) { detach(); return; }
    now = now || Date.now();
    var waiting = tot.until > now;
    var shade = dimmed() ? (cfg.darkest / 100) * (waiting ? 1 : progress(cfg, tot.ms, tot.screens)) : 0;
    if (!el && shade === 0) return;
    if (!attach()) return;
    shade = Math.round(shade * 1000) / 1000;
    if (shade !== drawn) { dimEl.style.opacity = String(shade); drawn = shade; }
    var show = shade > 0 && (waiting || shade >= (cfg.darkest / 100) * SHOW_PILL_AT);
    var idle = Math.floor((now - tot.last) / 1000);
    var label = waiting ? 'Back in ' + clock(Math.ceil((tot.until - now) / 1000))
      : idle >= 2 ? 'Clearing in ' + clock(Math.max(0, cfg.restSeconds - idle)) : 'Rest ' + clock(cfg.restSeconds) + ' to clear';
    if (label !== text) { pillEl.textContent = label; text = label; }
    if (show !== pillOn) { pillEl.style.opacity = show ? '1' : '0'; pillOn = show; }
  }

  function save() {
    try { chrome.storage.local.set({ atlas_scroll_fade: tot }, function () { void chrome.runtime.lastError; }); } catch (e) { void e; }
  }

  /* Once a second, and whenever the total or the setting changes: a rest or wait that is over clears the total, full dark
     starts the wait, and the layer follows. */
  function step() {
    var now = Date.now();
    if (cfg.on) {
      var next = settle(cfg, tot, now);
      if (next.ms !== tot.ms || next.screens !== tot.screens || next.last !== tot.last || next.until !== tot.until) { tot = next; save(); }
    }
    paint(now);
  }

  function startTimer() { if (!timer) timer = setInterval(step, TICK_MS); }
  function stopTimer() { if (timer) { clearInterval(timer); timer = 0; } }
  function configure(raw) {
    cfg = normalize(raw);
    if (cfg.on) startTimer(); else stopTimer();
    step();
  }

  /* The address of the tab you are on, asked again whenever the tab or its address changes. */
  function learn() {
    if (!chrome.tabs || !chrome.tabs.query) return;
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      void chrome.runtime.lastError;
      url = tabs && tabs[0] ? (tabs[0].url || tabs[0].pendingUrl || '') : '';
      paint();
    });
  }

  if (typeof document === 'undefined' || !document.querySelector) return;
  if (!chrome.storage || !chrome.storage.sync || !chrome.storage.local) return;

  chrome.storage.sync.get([KEY], function (r) { void chrome.runtime.lastError; configure(r && r[KEY]); });
  chrome.storage.local.get([STORE], function (r) { void chrome.runtime.lastError; tot = clean(r && r[STORE]); step(); });
  if (chrome.storage.onChanged && chrome.storage.onChanged.addListener) {
    chrome.storage.onChanged.addListener(function (ch, area) {
      if (area === 'sync' && ch[KEY]) configure(ch[KEY].newValue);
      else if (area === 'local' && ch[STORE]) { tot = clean(ch[STORE].newValue); step(); }
    });
  }
  if (chrome.tabs) {
    if (chrome.tabs.onActivated) chrome.tabs.onActivated.addListener(learn);
    if (chrome.tabs.onUpdated) chrome.tabs.onUpdated.addListener(function (id, info) { if (info && (info.url || info.status)) learn(); });
    learn();
  }

  Atlas.scrollFade = { normalize: normalize, progress: progress, settle: settle, clean: clean };
})();
