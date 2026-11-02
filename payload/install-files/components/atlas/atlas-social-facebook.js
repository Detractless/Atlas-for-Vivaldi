/* ── atlas-social-facebook.js: what hides each part of Facebook (the social media filter's site table; see
   docs/specs/006-social-filter-blocking/design.md for the format). Reviewed against the real signed-out site with
   scripts/social_live_check.mjs facebook; per-pair status (verified-live or source-only) in
   docs/specs/006-social-filter-blocking/review-facebook.md.
   Selectors came from these projects (reference only, rewritten here): scottylad007/zuckless (MIT: the feed, the
   stories tray, the composer), safwat-fathi/facebook-reels-blocker (MIT: the stories pagelet and focus target, feed
   units); malekwael229/FocusTube (MIT) and jordwest/news-feed-eradicator (AGPL; its hashed class names are not
   used) were consulted. Facebook's class names are hashed and change constantly, so none are used here: hooks are
   roles, data-pagelet names and aria labels. The badge part has no source; it was written for this table. ── */

(function () {
  'use strict';
  var S = window.__atlasSocial;
  if (!S || !S.run) return;

  var MARK = 'data-atlas-badge';

  /* A notification badge is a small, bare number ("3", "9+") in the top bar or the side menu, whatever the language,
     and often a coloured box around it. Mark the number, and the little box that holds nothing else, so the part's
     css can hide both; the returned stopper takes the marks off again. */
  function markBadges() {
    function small(el) { var b = el.getBoundingClientRect(); return b.width > 0 && b.width <= 34 && b.height <= 34; }
    function scan() {
      var old = document.querySelectorAll('[' + MARK + ']');   /* Facebook reuses elements: a mark goes when the number does */
      for (var j = 0; j < old.length; j++) {
        if (!/\d/.test(old[j].textContent || '') || old[j].textContent.trim().length > 4) old[j].removeAttribute(MARK);
      }
      var spans = document.querySelectorAll('[role="banner"] span, [role="navigation"] span');
      for (var i = 0; i < spans.length; i++) {
        var el = spans[i], text = (el.textContent || '').trim();
        if (el.childElementCount || !/^\d{1,3}\+?$/.test(text) || !small(el)) continue;
        var top = el;
        while (top.parentElement && top.parentElement.textContent.trim() === text &&
               !top.parentElement.querySelector('svg, img') && small(top.parentElement)) top = top.parentElement;
        top.setAttribute(MARK, '');
      }
    }
    scan();
    return S.helpers.every(700, scan);
  }

  function clearBadgeMarks() {
    var marked = document.querySelectorAll('[' + MARK + ']');
    for (var i = 0; i < marked.length; i++) marked[i].removeAttribute(MARK);
  }

  S.run({
    key: 'facebook', name: 'Facebook', live: true,
    hosts: ['facebook.com'],
    route: function (path) {
      if (path === '/' || path === '/home.php') return 'home';
      if (/^\/stories(\/|$)/.test(path)) return 'stories';
      if (/^\/watch(\/|$)/.test(path)) return 'watch';
      if (/^\/reels?(\/|$)/.test(path)) return 'reels';
      if (/^\/groups(\/|$)/.test(path)) return 'groups';
      return 'other';
    },
    /* The top bar ([role="banner"]) has no box of its own signed out, so it cannot be checked on screen; <main> can. */
    landmarks: [{ sel: '[role="main"]' }],
    smoke: ['[role="main"]'],
    parts: {
      homeFeed: {
        css: [
          'div[role="feed"]',                       /* the news feed, group feeds, page feeds (zuckless) */
          '[data-pagelet^="FeedUnit"]',             /* feed posts (facebook-reels-blocker) */
          '[data-pagelet^="TimelineFeedUnit"]'      /* the posts on a page or profile, as signed-out visitors see them */
        ],
        maxArea: 1
      },
      stories: {
        css: [
          '[data-pagelet="Stories"]', '[data-focus-target="stories_tray"]',   /* facebook-reels-blocker: the tray, whatever the language */
          'div[aria-label="Stories"]', 'div[aria-label="Stories tray"]'        /* zuckless */
        ],
        redirect: { from: /^\/stories(\/|$)/, to: '/' }, english: true
      },
      posting: {
        css: [
          'div[aria-label="Create a post"]',                                  /* the composer (zuckless) */
          '[data-pagelet="FeedComposer"]', '[data-pagelet="ProfileComposer"]', '[data-pagelet="GroupInlineComposer"]'
        ],
        english: true
      },
      badges: {
        css: ['[' + MARK + ']'],
        act: function (ctx) {
          var stopTitle = ctx.helpers.stripTitleCount(), stopBadges = markBadges();
          return function () { stopTitle(); stopBadges(); clearBadgeMarks(); };
        }
      }
    },
    todo: []
  });
})();
