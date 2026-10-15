/* ── 22-page-saturation.js: the Focus colour filter, drawn on the tab's page
   container instead of inside each web page. ──
   A filter added by a script inside the page arrived after the page's first
   frames (the saved level is read asynchronously, and every navigation is a new
   document), so each load flashed in colour. A filter on the page's <webview> in
   this window is already there when the next page starts, and stays through every
   navigation. Pages of the browser itself (Atlas's new tab and settings, Vivaldi's
   own) are marked and left in full colour.
   The level is the Color saturation slider (Settings > Focus): 100 is full color and draws no filter.
   Older settings had a Grayscale on/off switch beside it; effectiveLevel() reads both until the
   service worker has folded the switch into the slider. */
(function () {
  'use strict';

  var STYLE_ID = 'atlas-page-filter';
  var CACHE_KEY = 'atlas-page-saturation';   // last level, so a restart paints before storage answers
  var NOFILTER = 'data-atlas-nofilter';
  var STACK = '#webpage-stack';
  var INTERNAL = /^(chrome|chrome-extension|vivaldi|devtools|about):/i;

  var level = null;   // null = filter off; otherwise 0..100
  var urls = {};      // tab id -> last known address

  function isInternal(url) { return !url || INTERNAL.test(url); }

  function paint() {
    var el = document.getElementById(STYLE_ID);
    if (level === null) { if (el) el.remove(); return; }
    var css = STACK + ' .webpageview webview:not([' + NOFILTER + ']) { filter: saturate(' + level + '%); }';
    if (!el) {
      el = document.createElement('style');
      el.id = STYLE_ID;
      (document.head || document.documentElement).appendChild(el);
    }
    if (el.textContent !== css) el.textContent = css;
  }

  /* The level that is showing, from what is saved: the slider, or the old switch plus its level. */
  function effectiveLevel(r) {
    r = r || {};
    var sat = typeof r.saturation === 'number' ? r.saturation : undefined;
    if (r.grayscale === true) return sat !== undefined ? sat : 0;
    if (r.grayscale === false) return 100;
    return sat !== undefined ? sat : 100;
  }

  function setLevel(n) {
    level = n >= 100 || isNaN(n) ? null : Math.max(0, n);
    try { localStorage.setItem(CACHE_KEY, level === null ? '' : String(level)); } catch (e) { void e; }
    paint();
  }

  /* Whether this page's container carries the filter follows the tab's address. A tab
     whose address is not known yet counts as internal: a new tab must never paint grey. */
  function mark(wv) {
    var exempt = isInternal(urls[wv.getAttribute('tab_id')]);
    if (wv.hasAttribute(NOFILTER) !== exempt) wv.toggleAttribute(NOFILTER, exempt);
  }

  function remember(id, url) {
    if (url) urls[id] = url;
    var wv = document.querySelector(STACK + ' webview[tab_id="' + id + '"]');
    if (wv) mark(wv);
  }

  function markAll() {
    var wvs = document.querySelectorAll(STACK + ' webview[tab_id]');
    for (var i = 0; i < wvs.length; i++) {
      var id = wvs[i].getAttribute('tab_id');
      if (!(id in urls)) learn(id);
      mark(wvs[i]);
    }
  }

  function learn(id) {
    urls[id] = '';   // asked once; the answer marks it
    if (!chrome.tabs || !chrome.tabs.get) return;
    chrome.tabs.get(parseInt(id, 10), function (t) {
      void chrome.runtime.lastError;
      if (t) remember(id, t.url || t.pendingUrl);
    });
  }

  function readSettings() {
    chrome.storage.sync.get(['grayscale', 'saturation'], function (r) {
      void chrome.runtime.lastError;
      setLevel(effectiveLevel(r));
    });
  }

  /* New pages appear in the stack as tabs open or restore: mark them in the same task,
     before the window next paints (an observer callback runs ahead of the redraw). */
  function watchStack() {
    var stack = document.querySelector(STACK);
    if (!stack) { var t = setTimeout(watchStack, 200); if (t && typeof t.unref === 'function') t.unref(); return; }
    markAll();
    if (typeof MutationObserver !== 'undefined') {
      new MutationObserver(onStackChange).observe(stack, { childList: true, subtree: true });
    }
  }

  /* Vivaldi's own pages redraw inside the stack all the time: only a new <webview> matters. */
  function onStackChange(muts) {
    for (var i = 0; i < muts.length; i++) {
      for (var j = 0; j < muts[i].addedNodes.length; j++) {
        var n = muts[i].addedNodes[j];
        if (n.nodeType === 1 && (n.tagName === 'WEBVIEW' || (n.querySelector && n.querySelector('webview')))) { markAll(); return; }
      }
    }
  }

  if (typeof document === 'undefined' || !document.querySelector) return;

  try {
    var cached = localStorage.getItem(CACHE_KEY);
    if (cached) setLevel(parseInt(cached, 10));
  } catch (e) { void e; }

  if (chrome.storage && chrome.storage.sync && chrome.storage.sync.get) readSettings();
  if (chrome.storage && chrome.storage.onChanged && chrome.storage.onChanged.addListener) {
    chrome.storage.onChanged.addListener(function (ch, area) {
      if (area === 'sync' && (ch.grayscale || ch.saturation)) readSettings();
    });
  }
  if (chrome.tabs) {
    if (chrome.tabs.onCreated) chrome.tabs.onCreated.addListener(function (t) { remember(t.id, t.url || t.pendingUrl); });
    if (chrome.tabs.onUpdated) chrome.tabs.onUpdated.addListener(function (id, info, t) { remember(id, (info && info.url) || (t && t.url)); });
    if (chrome.tabs.onRemoved) chrome.tabs.onRemoved.addListener(function (id) { delete urls[id]; });
    if (chrome.tabs.query) chrome.tabs.query({}, function (tabs) {
      (tabs || []).forEach(function (t) { remember(t.id, t.url || t.pendingUrl); });
    });
  }
  watchStack();

})();
