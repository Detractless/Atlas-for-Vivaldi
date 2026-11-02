/* ── atlas-social-tiktok.js: what hides each part of TikTok (the social media filter's site table; see
   docs/specs/006-social-filter-blocking/design.md for the format). Reviewed against the real signed-out site with
   scripts/social_live_check.mjs tiktok; notes per pair in docs/specs/006-social-filter-blocking/review-tiktok.md.
   Selectors came from these projects (reference only, rewritten here): shbernal/tiktok-feed-blocker (MIT: the feed
   column, the Explore page, the feed arrows); InfectedDuck/ReelLess (MIT: the /upload route is a section to block);
   4tru/bettertiktok (MIT) was consulted. The like, follow, share, count and video-grid hooks were written from the
   signed-out pages: TikTok marks them with data-e2e, which is stable and not language-dependent, unlike its hashed
   class names. ── */

(function () {
  'use strict';
  var S = window.__atlasSocial;
  if (!S || !S.run) return;

  /* A feed that was hidden before it could play must not keep playing sound behind the hiding. Only on the pages
     where the part hides it: a video being watched on its own page (/@user/video/<id>) is left playing. */
  var FEED_VIDEOS = '#column-list-container video, [data-e2e="explore-item"] video, [data-e2e="user-post-item"] video';
  function keepFeedQuiet(routes) {
    return function (ctx) { return ctx.helpers.pauseVideos(FEED_VIDEOS, function () { return routes.indexOf(ctx.route()) >= 0; }); };
  }

  S.run({
    key: 'tiktok', name: 'TikTok', live: true,
    hosts: ['tiktok.com'],
    /* A language prefix (/en, /de-DE) is ignored; the For You feed may put /@user/video/<id> in the address as it scrolls. */
    route: function (path) {
      var p = path.replace(/^\/[a-z]{2}(-[A-Za-z]{2,4})?(?=\/|$)/, '') || '/';
      if (p === '/' || /^\/(foryou|following|friends)\/?$/.test(p)) return 'home';
      if (p.indexOf('/explore') === 0) return 'explore';
      if (/^\/@[^/]+\/(video|photo)\//.test(p)) return 'video';
      if (p.indexOf('/@') === 0) return 'profile';
      if (/^\/(upload|creator-center|tiktokstudio)(\/|$)/.test(p)) return 'upload';
      if (p.indexOf('/search') === 0) return 'search';
      return 'other';
    },
    landmarks: [{ sel: '#app' }, { sel: '[data-e2e="nav-foryou"]' }],
    smoke: ['[data-e2e="nav-search"]'],
    parts: {
      homeFeed: {
        css: [
          { sel: '[data-e2e="anchoring-player-column"]', on: ['home'] },   /* the 2026 feed: video column, buttons, arrows */
          { sel: '#column-list-container', on: ['home'] },                 /* the older feed, and the column inside the new one (tiktok-feed-blocker) */
          { sel: '[class*="DivFeedNavigationContainer"]', on: ['home'] },   /* the up/down arrows (tiktok-feed-blocker) */
          { sel: '#main-content-explore_page', on: ['explore'] }           /* the Explore grid (tiktok-feed-blocker) */
        ],
        maxArea: 1, act: keepFeedQuiet(['home', 'explore'])
      },
      shortVideos: {
        css: [
          { sel: '[data-e2e="anchoring-player-column"]', on: ['home'] },
          { sel: '#column-list-container', on: ['home', 'video'] },
          '[data-e2e="user-post-item-list"]',                              /* a profile's video grid */
          '[data-e2e="explore-item-list"]',                                /* the Explore grid */
          '[data-e2e="video-detail-related-video"]',                       /* "You may like" beside a video */
          { sel: 'a[href*="/playlist/"]', on: ['profile'] }                /* a profile's playlists */
        ],
        redirect: { from: /^\/(?:[a-z]{2}(?:-[A-Za-z]{2,4})?\/)?@[^/]+\/(video|photo)\//, to: '/' },
        maxArea: 1, act: keepFeedQuiet(['home', 'video', 'explore', 'profile'])
      },
      likes: { css: ['[data-e2e="like-icon"]', '[data-e2e="browse-like-icon"]', '[data-e2e="comment-like-icon"]'] },
      /* TikTok's button boxes carry the colour, so the box goes too, or an empty red pill stays behind. */
      follow: {
        css: [
          '[data-testid="tux-web-button-container"]:has(> [data-e2e="follow-button"])',
          '[data-testid="tux-web-button-container"]:has(> [data-e2e="cinema-video-info-follow"])',
          '[data-e2e="follow-button"]', '[data-e2e="feed-follow"]', '[data-e2e="cinema-video-info-follow"]'
        ]
      },
      share: {
        css: ['[data-testid="tux-web-button-container"]:has(> [data-e2e="share-btn"])', '[data-e2e="share-icon"]', '[data-e2e="share-btn"]']
      },
      posting: {
        css: ['[data-e2e="nav-upload"]', '[data-e2e="upload-icon"]', 'a[href*="/tiktokstudio/upload"]', 'a[href*="/creator-center/upload"]'],
        redirect: { from: /^\/(?:[a-z]{2}(?:-[A-Za-z]{2,4})?\/)?(upload|creator-center|tiktokstudio)(\/|$)/, to: '/' }
      },
      counts: {
        css: [
          '[data-e2e="like-count"]', '[data-e2e="comment-count"]', '[data-e2e="favorite-count"]', '[data-e2e="share-count"]',
          '[data-e2e="video-views"]',                                      /* views on a profile's video grid */
          '[data-e2e="explore-card-like-container"]',                      /* likes on an Explore card */
          { sel: '[data-e2e="likes-count"]', on: ['profile'] },            /* a profile's total likes... */
          { sel: '[data-e2e="likes"]', on: ['profile'] }                    /* ...and its "Likes" label */
        ]
      }
    },
    todo: []
  });
})();
