/* ── atlas-social-behaviors.js: small helpers the social media filter's site tables use for the few parts that
   are not plain CSS: switching autoplay off, the "(3)" in a tab title, pausing preview videos. Each helper
   returns a function that stops it; the filter calls that when the part is switched off. ── */

(function () {
  'use strict';
  var S = window.__atlasSocial = window.__atlasSocial || {};
  if (S.helpers) return;

  /* Run fn every ms until the returned stopper is called. A throwing fn never stops the page. */
  function every(ms, fn) {
    var id = setInterval(function () { try { fn(); } catch (e) { /* the page keeps working */ } }, ms);
    return function () { clearInterval(id); };
  }

  /* While `isOn(el)` is true for the element `selector` finds, click it once per second at most. Used for
     switches the site keeps turning back on (YouTube's autoplay toggle). The site remembers the switch (YouTube
     keeps it on the account), so when the part is switched off, a switch we turned off is turned back on. */
  function keepOff(selector, isOn) {
    var lastClick = 0, turnedOff = false;
    var stop = every(700, function () {
      var el = document.querySelector(selector);
      if (!el || !isOn(el) || Date.now() - lastClick < 1000) return;
      lastClick = Date.now();
      turnedOff = true;
      el.click();
    });
    return function () {
      stop();
      var el = document.querySelector(selector);
      if (turnedOff && el && !isOn(el)) el.click();
    };
  }

  /* "(3) Inbox" becomes "Inbox": the count of new things that pulls you back into a tab. */
  function stripTitleCount() {
    var re = /^\(\d+\+?\)\s*/;
    function fix() { if (re.test(document.title)) document.title = document.title.replace(re, ''); }
    fix();
    return every(400, fix);
  }

  /* Pause (and mute) every playing video matching `selector`, e.g. a feed's autoplaying previews, while
     `applies()` (optional: say which pages) is true. The videos it muted are unmuted when it is stopped. */
  function pauseVideos(selector, applies) {
    var muted = [];
    var stop = every(400, function () {
      if (applies && !applies()) return;
      var list = document.querySelectorAll(selector);
      for (var i = 0; i < list.length; i++) {
        var v = list[i];
        if (v.tagName !== 'VIDEO' || v.paused) continue;
        if (!v.muted) muted.push(v);
        v.muted = true;
        v.pause();
      }
    });
    return function () {
      stop();
      muted.forEach(function (v) { v.muted = false; });
    };
  }

  S.helpers = { every: every, keepOff: keepOff, stripTitleCount: stripTitleCount, pauseVideos: pauseVideos };
})();
