/* Atlas internal pages — theme + UI-scale sync with the Detractless new tab.

   Mirrors the extension's own mechanisms exactly (newtab.bundle.js):
   - Theme: sync key "Theme" is a config object { Theme: 'light'|'dark'|
     'system'|'custom', CustomColors: {...} }. 'system' resolves through
     prefers-color-scheme; 'custom' stamps data-theme="dark" and writes the
     CustomColors onto the same --surface-* / --text-* variables these pages
     already style through.
   - Scale: sync key "uiScale" applies as document.body.style.zoom plus the
     (1/v - 1) * 50 vw/vh margin compensation.
   Both live-update via storage.onChanged and the matchMedia listener. */
(function () {
  'use strict';

  /* Pre-paint hold, the extension's themePreinit contract: this script runs
     in <head>, so hiding the root here beats first paint. The page reveals
     when the sync-storage read lands (a few ms); the timeout is the safety
     net so a storage failure can never leave a blank page. */
  var revealed = false;
  function reveal() {
    if (revealed) return;
    revealed = true;
    document.documentElement.style.visibility = '';
    /* Transitions stayed off through the hold so the first theme apply is a
       cut, not a 220ms light→dark fade; re-arm them one frame later. */
    setTimeout(function () {
      var s = document.getElementById('atlas-hold-trans');
      if (s) s.remove();
    }, 50);
  }
  document.documentElement.style.visibility = 'hidden';
  (function () {
    var s = document.createElement('style');
    s.id = 'atlas-hold-trans';
    s.textContent = '* { transition: none !important; }';
    document.head.appendChild(s);
  })();
  setTimeout(reveal, 400);

  var CUSTOM_VARS = [
    '--surface-canvas', '--surface-card', '--surface-muted',
    '--hover-on-card', '--hover-on-canvas', '--line-hairline',
    '--text-primary', '--text-secondary', '--text-tertiary',
    '--accent', '--accent-text'
  ];

  /* ── color helpers, ported from the extension ── */
  function formatColorForWeb(hex) {
    if (typeof hex === 'string' && hex.length === 9 && hex.charAt(0) === '#') {
      return '#' + hex.substring(3, 9) + hex.substring(1, 3);
    }
    return hex;
  }
  function hexMix(a, b, t) {
    var parse = function (h) {
      h = String(h).replace('#', '');
      return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    };
    var ca = parse(a), cb = parse(b);
    if (ca.some(isNaN) || cb.some(isNaN)) return a;
    return '#' + ca.map(function (v, i) {
      var m = Math.round(v + (cb[i] - v) * t);
      return Math.max(0, Math.min(255, m)).toString(16).padStart(2, '0');
    }).join('');
  }

  var themeConfig = null;

  function resolveActive(cfg) {
    var active = (cfg && cfg.Theme) || 'dark';
    if (active === 'system') {
      active = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark' : 'light';
    }
    return active;
  }

  function applyTheme(cfg) {
    themeConfig = cfg;
    var root = document.documentElement;
    var active = resolveActive(cfg);
    CUSTOM_VARS.forEach(function (v) { root.style.removeProperty(v); });

    if (active === 'custom' && cfg && cfg.CustomColors) {
      var c = cfg.CustomColors, f = formatColorForWeb;
      root.dataset.theme = 'dark';
      var canvas = f(c.WindowBackground);
      var card = f(c.ControlBackground);
      root.style.setProperty('--surface-canvas', canvas);
      root.style.setProperty('--surface-card', card);
      root.style.setProperty('--surface-muted', hexMix(card, canvas, 0.5));
      root.style.setProperty('--hover-on-card', f(c.ControlHover));
      root.style.setProperty('--hover-on-canvas', hexMix(canvas, card, 0.35));
      root.style.setProperty('--line-hairline', f(c.BorderColor));
      root.style.setProperty('--text-primary', f(c.TextPrimary));
      root.style.setProperty('--text-secondary', f(c.TextSecondary));
      root.style.setProperty('--text-tertiary', hexMix(f(c.TextSecondary), canvas, 0.45));
      root.style.setProperty('--accent', f(c.TextPrimary));
      root.style.setProperty('--accent-text', canvas);
    } else {
      root.dataset.theme = active; /* 'light' | 'dark' */
    }
  }

  /* UI scale. The extension's newtab uses zoom + a negative-vw/vh margin trick
     built for a FULL-BLEED layout; on our centered fixed-width column that
     trick shifted the column left and let the fixed-height card overflow the
     viewport bottom. Instead: zoom the body but shrink it to exactly the
     viewport at that zoom (width 100vw/v, height 100vh/v), so the centered
     column stays centered and nothing is clamped; and expose --atlas-z so the
     card's fit-to-viewport height can divide by the zoom and still fit. */
  function applyScale(v) {
    v = (v !== undefined && v !== null && isFinite(v)) ? Number(v) : 1;
    var b = document.body, root = document.documentElement;
    if (v === 1) {
      b.style.zoom = ''; b.style.width = ''; b.style.height = '';
      b.style.marginLeft = ''; b.style.marginTop = '';
      root.style.removeProperty('--atlas-z');
    } else {
      b.style.zoom = v;
      b.style.width = (100 / v) + 'vw';
      b.style.height = (100 / v) + 'vh';
      b.style.marginLeft = '0'; b.style.marginTop = '0';
      root.style.setProperty('--atlas-z', String(v));
    }
  }

  function init() {
    chrome.storage.sync.get(['Theme', 'uiScale'], function (r) {
      applyTheme(r.Theme || null);
      applyScale(r.uiScale);
      reveal();
    });
  }

  if (chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area !== 'sync') return;
      if (changes.Theme) applyTheme(changes.Theme.newValue || null);
      if (changes.uiScale) applyScale(changes.uiScale.newValue);
    });
  }
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () {
      if (themeConfig && themeConfig.Theme === 'system') applyTheme(themeConfig);
    });
  }

  /* ── scroll affordance (R-010): hidden scrollbars owe the fade-and-count
        substitute. The scroller is the list card's WELL (.list-scroller),
        not the page; fades and pills sit at the well's edges inside
        .list-shell, and the pills are WORDED: "3 above", "9 below". ── */
  function initScrollAffordance() {
    var scroller = document.querySelector('.list-scroller');
    var shell = document.querySelector('.list-shell');
    if (!scroller || !shell) return;
    var els = {};
    ['top', 'bot'].forEach(function (side) {
      var fade = document.createElement('div');
      fade.className = 'scroll-fade scroll-fade-' + side + ' hidden';
      shell.appendChild(fade);
      var count = document.createElement('div');
      count.className = 'scroll-count scroll-count-' + side + ' hidden';
      var num = document.createElement('span');
      var chev = document.createElement('span');
      chev.className = 'scroll-count-chev';
      count.appendChild(num);
      count.appendChild(chev);
      shell.appendChild(count);
      els[side] = { fade: fade, count: count, num: num };
    });

    var raf = null;
    function update() {
      raf = null;
      var rows = scroller.querySelectorAll('.row');
      var sr = scroller.getBoundingClientRect();
      var above = 0, below = 0;
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i].getBoundingClientRect();
        if (r.bottom < sr.top + 4) above++;
        else if (r.top > sr.bottom - 4) below++;
      }
      els.top.fade.classList.toggle('hidden', above === 0);
      els.top.count.classList.toggle('hidden', above === 0);
      els.top.num.textContent = above + ' above';
      els.bot.fade.classList.toggle('hidden', below === 0);
      els.bot.count.classList.toggle('hidden', below === 0);
      els.bot.num.textContent = below + ' below';
    }
    /* rAF never fires in a hidden tab, so counts would freeze until the
       next frame after the tab fronts; a timeout keeps them honest. */
    function schedule() {
      if (raf) return;
      if (document.hidden) { raf = 1; setTimeout(update, 120); }
      else raf = requestAnimationFrame(update);
    }

    scroller.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    var list = document.getElementById('list');
    if (list) new MutationObserver(schedule).observe(list, { childList: true, subtree: true });
    update();
  }

  function boot() { init(); initScrollAffordance(); }
  if (document.body) boot();
  else document.addEventListener('DOMContentLoaded', boot);
})();
