/* Usage totals for one web page: how long it is in front of you, and what you do there.
   Injected as a content script on web pages (src/modules/03-bridge-content-scripts.js), top frame
   only, never in a private window. Every 30 seconds, and when you leave the tab, it sends the
   change since the last time to the service worker (background/usageLog.js), which adds it to the
   hourly totals for this site. Only the site's name and numbers go: never the page's address or
   title, and never what is typed (a key press is counted, not read).

   Counted:
   - visibleMs / handsOnMs  time the tab is showing, and the part of it with scrolling, clicks,
                            keys or the mouse moving in the last 15 seconds (the rest: "just open")
   - mediaFrontMs / mediaBackMs  video or audio playing with the tab showing / hidden
   - pageViews              this load, plus every change of address inside the site (video to video)
   - imagesSeen             images and videos that scrolled into view (100px or bigger), once each
   - clicks, keys           how many
   - scrollScreens / scrollMs  distance scrolled in window heights, and the time spent scrolling */
(function () {
  'use strict';
  if (window.top !== window || window.__atlasUsage) return;
  window.__atlasUsage = true;
  try {
    if (chrome.extension && chrome.extension.inIncognitoContext) return;
  } catch (e) { /* chrome.extension is not there in this context, so this is not a private window */ }
  if (!window.chrome || !chrome.runtime || !chrome.runtime.sendMessage) return;

  var HOST = String(location.hostname || '').replace(/^www\./, '');
  if (!HOST) return;
  var HANDS_ON_MS = 15000, TICK_MS = 1000, FLUSH_MS = 30000, MIN_IMAGE = 100;

  function fresh() {
    return { visibleMs: 0, handsOnMs: 0, mediaFrontMs: 0, mediaBackMs: 0, scrollMs: 0,
      pageViews: 0, imagesSeen: 0, clicks: 0, keys: 0, scrollScreens: 0 };
  }
  var acc = fresh();
  acc.pageViews = 1;
  var lastInput = 0, lastTick = Date.now(), lastHref = address(), stopped = false;
  var playing = new Set();

  function address() { return location.href.replace(/#.*$/, ''); }
  function showing() { return document.visibilityState === 'visible'; }
  function touch() { lastInput = Date.now(); }

  /* ── time, media and address changes: once a second ── */
  function mediaPlaying() {
    var any = false;
    playing.forEach(function (el) {
      if (!el.isConnected || el.paused || el.ended) playing.delete(el);
      else any = true;
    });
    return any;
  }

  function tick() {
    var now = Date.now(), dt = now - lastTick;
    lastTick = now;
    if (dt <= 0) return;
    var seen = showing();
    if (seen) {
      var d = Math.min(dt, 5000);   // a sleeping computer does not count
      acc.visibleMs += d;
      if (now - lastInput < HANDS_ON_MS) acc.handsOnMs += d;
    }
    if (mediaPlaying()) {
      var m = Math.min(dt, seen ? 5000 : 70000);   // a hidden tab's timer may run only once a minute
      if (seen) acc.mediaFrontMs += m; else acc.mediaBackMs += m;
    }
    var now2 = address();
    if (now2 !== lastHref) { lastHref = now2; acc.pageViews++; }
  }

  ['playing', 'pause', 'ended', 'emptied'].forEach(function (type) {
    document.addEventListener(type, function (e) {
      var el = e.target;
      if (!el || (el.tagName !== 'VIDEO' && el.tagName !== 'AUDIO')) return;
      if (type === 'playing') playing.add(el); else playing.delete(el);
    }, true);
  });
  Array.prototype.forEach.call(document.querySelectorAll('video, audio'), function (el) {
    if (!el.paused && !el.ended) playing.add(el);
  });

  /* ── what you do ── */
  document.addEventListener('click', function (e) { if (e.isTrusted) { acc.clicks++; touch(); } }, true);
  document.addEventListener('keydown', function (e) { if (e.isTrusted) { acc.keys++; touch(); } }, true);
  window.addEventListener('wheel', touch, { passive: true, capture: true });
  window.addEventListener('pointermove', touch, { passive: true, capture: true });

  /* The page itself starts from where it is now; a box that scrolls on its own starts from its first scroll. */
  var root = document.scrollingElement || document.documentElement;
  var lastTop = new WeakMap(), lastScrollAt = Date.now();
  if (root) lastTop.set(root, root.scrollTop || 0);
  document.addEventListener('scroll', function (e) {
    var el = e.target === document ? root : e.target;
    if (!el || typeof el.scrollTop !== 'number') return;
    var before = lastTop.get(el), now = Date.now(), gap = now - lastScrollAt;
    lastTop.set(el, el.scrollTop);
    lastScrollAt = now;
    touch();
    if (before === undefined) return;
    acc.scrollScreens += Math.abs(el.scrollTop - before) / (window.innerHeight || 1);
    acc.scrollMs += gap < 500 ? gap : 100;   // steady scrolling adds up; a lone flick counts a tenth of a second
  }, { capture: true, passive: true });

  /* ── images and videos that came into view, once each ── */
  var counted = new WeakSet();
  var io = typeof IntersectionObserver === 'function' ? new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      if (!en.isIntersecting || counted.has(en.target)) return;
      var r = en.boundingClientRect;
      if (r.width < MIN_IMAGE || r.height < MIN_IMAGE) return;   // icons, avatars and spacers
      counted.add(en.target);
      acc.imagesSeen++;
      io.unobserve(en.target);
    });
  }, { threshold: 0.5 }) : null;

  function watch(el) { if (io && !counted.has(el)) io.observe(el); }
  function watchWithin(root) {
    if (!root.querySelectorAll) return;
    Array.prototype.forEach.call(root.querySelectorAll('img, video'), watch);
  }
  watchWithin(document);

  /* New content (infinite lists) is looked at in batches, so a busy page is not slowed down. */
  var added = [], batchTimer = 0;
  function takeBatch() {
    batchTimer = 0;
    var nodes = added.splice(0, 300);
    nodes.forEach(function (n) { if (n.tagName === 'IMG' || n.tagName === 'VIDEO') watch(n); else watchWithin(n); });
    if (added.length) batchTimer = setTimeout(takeBatch, 300);
  }
  if (typeof MutationObserver === 'function') {
    new MutationObserver(function (muts) {
      muts.forEach(function (mu) {
        Array.prototype.forEach.call(mu.addedNodes, function (n) { if (n.nodeType === 1) added.push(n); });
      });
      if (added.length && !batchTimer) batchTimer = setTimeout(takeBatch, 300);
    }).observe(document.documentElement, { childList: true, subtree: true });
  }

  /* ── sending ── */
  function stop() {
    stopped = true;
    clearInterval(tickTimer);
    clearInterval(flushTimer);
  }

  function flush() {
    if (stopped) return;
    tick();
    var delta = {}, any = false;
    Object.keys(acc).forEach(function (k) {
      if (acc[k]) { delta[k] = Math.round(acc[k] * 100) / 100; any = true; }
    });
    if (!any) return;
    acc = fresh();
    try {
      chrome.runtime.sendMessage({ action: 'recordUsage', host: HOST, delta: delta }, function () { void chrome.runtime.lastError; });
    } catch (e) {
      stop();   // the extension was reloaded since this page loaded: there is nothing left to send to
    }
  }

  var tickTimer = setInterval(tick, TICK_MS);
  var flushTimer = setInterval(flush, FLUSH_MS);
  document.addEventListener('visibilitychange', function () { if (!showing()) flush(); });
  window.addEventListener('pagehide', flush);
  window.addEventListener('pageshow', function (e) { if (e.persisted) { acc.pageViews++; lastTick = Date.now(); } });
})();
