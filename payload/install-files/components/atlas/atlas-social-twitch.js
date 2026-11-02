/* ── atlas-social-twitch.js: what hides each part of Twitch (the social media filter's site table; see
   docs/specs/006-social-filter-blocking/design.md for the format). Reviewed against the real site (signed out) with
   scripts/social_live_check.mjs twitch; the review notes are in review-twitch.md.
   Selectors are facts about Twitch's markup, rewritten here from what these projects found: FrankerFaceZ/FrankerFaceZ
   (Apache-2.0; css_tweaks: side-nav live channels, whispers pill, notification badge class), BevizLaszlo/UBlock-Filters-
   for-Social-Media (MIT; the recommended/live shelves), potrepka/simple-twitch (the front-page carousel). The live-stream
   cards, shelves, player and chat hooks were written from the real pages (liveStreams has no source). Twitch's own
   class names are generated (Layout-sc-...), so the hooks used are data-a-target / data-test-selector attributes, ids
   and the few plain classes Twitch keeps (tw-tower, tw-number-badge, find-me). ── */

(function () {
  'use strict';
  var S = window.__atlasSocial;
  if (!S || !S.run) return;

  /* First path segments that are Twitch's own pages, not a channel name. */
  var RESERVED = /^(?:directory|videos|clips|clip|p|settings|downloads|jobs|turbo|subscriptions|drops|wallet|friends|inventory|prime|search|popout|moderator|embed|store|login|signup|team|dashboard|broadcast|payments|legal|u|user|bits|gift|following|annual-recap)$/i;

  /* A live stream card: its image link has this target on the front page, in the directory and on category pages. */
  var CARD_LINK = 'a[data-a-target="preview-card-image-link"]';

  S.run({
    key: 'twitch', name: 'Twitch', live: true,
    hosts: ['twitch.tv'],
    route: function (path) {
      if (path === '/') return 'home';
      if (/^\/directory(?:\/|$)/.test(path)) return 'directory';
      var m = /^\/([A-Za-z0-9_]{3,25})(?:\/(?:home|about|schedule|videos|clips|chat))?\/?$/.exec(path);
      if (m && !RESERVED.test(m[1])) return 'channel';
      return 'other';
    },
    landmarks: [{ sel: '#root' }, { sel: 'main' }, { sel: '[data-a-target="top-nav-container"]' }, { sel: '[data-a-target="side-nav-bar"]' }],
    smoke: ['[data-a-target="nav-search-box"]', '[data-a-target="home-link"]'],
    parts: {
      /* Live video and its chat: the player and chat on a channel page, the front-page carousel and live shelves, every
         grid of live-stream cards (directory, categories), and the live channels in the left menu. */
      liveStreams: {
        css: [
          { sel: '[data-a-target="front-page-carousel"]', on: ['home'] },
          { sel: '.find-me:has(' + CARD_LINK + ')', on: ['home'] },
          { sel: '.tw-tower:has(' + CARD_LINK + ')', on: ['home', 'directory'] },   /* a channel's Videos and Clips grids use the same card link: not those */
          '[data-test-selector="recommended-channel"]',
          '[data-test-selector="similarity-channel"]',
          '[data-test-selector="followed-channel"]:has([data-a-target="side-nav-live-status"])',
          { sel: '.persistent-player', on: ['channel'] },
          { sel: '.right-column', on: ['channel'] }
        ],
        maxArea: 1
      },
      /* The red number badges (notifications, Prime Gaming offers, whispers), the bell, and the "(3)" in the tab title. */
      badges: {
        css: ['.tw-number-badge', '.tw-badge--notification', '.whispers__pill', '[data-a-target="notifications-toggle"]'],
        act: function (ctx) { return ctx.helpers.stripTitleCount(); }
      }
    },
    todo: []
  });
})();
