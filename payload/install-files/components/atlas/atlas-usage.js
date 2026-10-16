/* Usage totals for one web page: how long it is in front of you, and what you do there.
   Injected as a content script on web pages (src/modules/03-bridge-content-scripts.js), top frame
   only, never in a private window. Every 30 seconds, and when you leave the tab, it sends the
   change since the last time to the service worker (background/usageLog.js), which adds it to the
   hourly totals for this site. Only the site's name and numbers go: never the page's address or
   title, and never what is typed (a key press is counted, not read).

   Counted:
   - visibleMs / handsOnMs  time the page is in front of you, and the part of it with scrolling, clicks,
                            keys or the mouse moving in the last 15 seconds (the rest: "just open").
                            In front = the tab is showing AND the window is the one in use (it has the
                            focus, or you touched it in the last 15 seconds). Two windows side by side
                            do not both count at once.
   - mediaFrontMs / mediaBackMs  video or audio playing with the tab showing / hidden, players inside
                             web components (Reddit's) too
   - pageViews              this load, plus every change of address inside the site (video to video)
   - imagesSeen             images and videos that scrolled into view (100px or bigger), once each,
                             inside web components too
   - clicks, keys           how many
   - scrollScreens / scrollMs  distance scrolled in window heights, and the time spent scrolling.
                            A jump of more than two screens in one step (Home, End, a page returning to
                            the top) is not scrolling and is not counted. */
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
  var HANDS_ON_MS = 15000, TICK_MS = 1000, FLUSH_MS = 30000, MIN_IMAGE = 100, JUMP_SCREENS = 2;

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
  /* In front of you: showing, and the window in use. A window that is visible beside another one
     and has no focus and no touch does not count. */
  function inFront(now) { return showing() && (document.hasFocus() || now - lastInput < HANDS_ON_MS); }

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
    checkWaiting(now);
    var seen = showing();
    if (inFront(now)) {
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

  function onMedia(e) {
    var el = e.target;
    if (!el || (el.tagName !== 'VIDEO' && el.tagName !== 'AUDIO')) return;
    if (e.type === 'playing') playing.add(el); else playing.delete(el);
  }
  /* The page, or a web component's shadow root (below): its media events, and what is playing already. */
  function listenWithin(root) {
    ['playing', 'pause', 'ended', 'emptied'].forEach(function (type) { root.addEventListener(type, onMedia, true); });
    Array.prototype.forEach.call(root.querySelectorAll('video, audio'), function (el) {
      if (!el.paused && !el.ended) playing.add(el);
    });
  }
  listenWithin(document);

  /* ── what you do ── */
  document.addEventListener('click', function (e) { if (e.isTrusted) { acc.clicks++; touch(); adoptPath(e); } }, true);
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
    var screens = Math.abs(el.scrollTop - before) / (window.innerHeight || 1);
    if (screens > JUMP_SCREENS) return;   // a jump (Home, End, a page back at its top), not scrolling
    acc.scrollScreens += screens;
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
    nodes.forEach(function (n) {
      if (n.tagName === 'IMG' || n.tagName === 'VIDEO') watch(n); else watchWithin(n);
      findShadows(n);
    });
    if (added.length) batchTimer = setTimeout(takeBatch, 300);
  }
  var mo = typeof MutationObserver === 'function' ? new MutationObserver(function (muts) {
    muts.forEach(function (mu) {
      Array.prototype.forEach.call(mu.addedNodes, function (n) { if (n.nodeType === 1) added.push(n); });
    });
    if (added.length && !batchTimer) batchTimer = setTimeout(takeBatch, 300);
  }) : null;
  if (mo) mo.observe(document.documentElement, { childList: true, subtree: true });

  /* ── web components ──
     A player built as a web component (Reddit's) keeps its <video> in a shadow root: media events stop there and
     never reach the page, and the page's querySelectorAll and MutationObserver do not look inside. So each open
     shadow root found is watched like the page itself. A component whose code loads late gets its shadow root
     after it is already in the page, with no event to say so: those are looked at once a second for 30 seconds,
     and any shadow root a person clicks inside is picked up then. Closed shadow roots cannot be seen. */
  var adopted = new WeakSet(), queued = new WeakSet(), waiting = [], WAIT_MS = 30000;
  function adopt(sr) {
    if (adopted.has(sr)) return;
    adopted.add(sr);
    listenWithin(sr);
    watchWithin(sr);
    if (mo) mo.observe(sr, { childList: true, subtree: true });
    findShadows(sr);
  }
  function look(el, now) {
    if (el.shadowRoot) adopt(el.shadowRoot);
    else if (el.tagName.indexOf('-') > 0 && !queued.has(el)) { queued.add(el); waiting.push({ el: el, since: now }); }
  }
  function findShadows(root) {
    var now = Date.now();
    if (root.nodeType === 1) look(root, now);
    Array.prototype.forEach.call(root.querySelectorAll('*'), function (el) { look(el, now); });
  }
  function checkWaiting(now) {
    if (!waiting.length) return;
    waiting = waiting.filter(function (w) {
      if (w.el.shadowRoot) { adopt(w.el.shadowRoot); return false; }
      return w.el.isConnected && now - w.since < WAIT_MS;
    });
  }
  function adoptPath(e) {
    if (!e.composedPath) return;
    e.composedPath().forEach(function (n) { if (n.nodeType === 11 && n.host) adopt(n); });
  }
  findShadows(document);

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
