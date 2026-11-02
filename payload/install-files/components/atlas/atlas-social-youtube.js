/* ── atlas-social-youtube.js: what hides each part of YouTube (the social media filter's site table; see
   docs/specs/006-social-filter-blocking/design.md for the format). Reviewed against the real, signed-out site with
   scripts/social_live_check.mjs youtube; notes per part in docs/specs/006-social-filter-blocking/review-youtube.md.
   Selectors are facts about YouTube's markup, found in these projects and rewritten here (nothing is pasted):
   - lawrencehook/remove-youtube-suggestions "RYS" (MPL-2.0): main.css, main.js (autoplay toggle, Shorts shelves, chat, end screen)
   - bpavlina/ublock-hide-yt-shorts (MIT): Shorts shelves/rows/tabs, comments, the Shorts comment button
   - insin/control-panel-for-youtube (unlicensed, reference only): live, share, chat, end cards, related, Shorts buttons
   - userstyles.world "YouTube Tweaks" style 9174 (MIT): share button, live badges
   - johnny-official/YouTube-uBlock-Origin-Filters: inline preview player, live/Shorts shelves ── */

(function () {
  'use strict';
  var S = window.__atlasSocial;
  if (!S || !S.run) return;

  /* YouTube's own switch: the autoplay toggle in the player says aria-checked="true" while autoplay is on. */
  function autoplayIsOn(el) { return el.getAttribute('aria-checked') === 'true'; }

  /* A channel's trailer starts playing by itself. Pause it once; if the person then presses play, leave it alone. */
  function pauseTrailerOnce(ctx) {
    return ctx.helpers.every(500, function () {
      var v = document.querySelector('ytd-channel-video-player-renderer video');
      if (v && !v.paused && !v.atlasPaused) { v.atlasPaused = true; v.pause(); }
    });
  }

  S.run({
    key: 'youtube', name: 'YouTube', live: true,
    hosts: ['youtube.com'],
    /* After a click inside the site, YouTube shows the old page for about 0.8 s: its rules stay on until this event (measured). */
    settle: { events: ['yt-navigate-finish'], after: 250, max: 5000 },
    route: function (path, search, host) {
      if (!/^(www\.|m\.)?youtube\.com$/.test(host || '')) return 'other';   /* studio., music. and others are other apps */
      if (path === '/') return 'home';
      if (path.indexOf('/watch') === 0 || path.indexOf('/live/') === 0) return 'watch';
      if (path.indexOf('/shorts/') === 0) return 'shorts';
      if (path.indexOf('/results') === 0) return 'search';
      if (/^\/(@|channel\/|c\/|user\/)/.test(path)) return 'channel';
      return 'other';
    },
    landmarks: [
      { sel: 'ytd-app' }, { sel: 'ytd-masthead' }, { sel: 'ytd-page-manager' },
      { sel: 'ytd-watch-flexy', on: ['watch'] }, { sel: '#movie_player', on: ['watch'] }, { sel: 'ytd-shorts', on: ['shorts'] }
    ],
    smoke: ['ytd-masthead input[name="search_query"]'],
    parts: {
      suggested: {
        maxArea: 1,
        css: [
          { sel: 'ytd-browse[page-subtype="home"] ytd-rich-grid-renderer', on: ['home'] },
          { sel: '#related', on: ['watch'] },
          { sel: 'ytd-watch-next-secondary-results-renderer', on: ['watch'] },
          { sel: 'ytd-search ytd-shelf-renderer', on: ['search'] },
          { sel: 'ytd-search ytd-horizontal-card-list-renderer', on: ['search'] },
          { sel: 'ytd-search ytd-universal-watch-card-renderer', on: ['search'] },
          { sel: '[is-channel-for-you-section]', on: ['channel'] },
          'ytd-item-section-renderer[is-playlist-suggestions]'
        ]
      },
      shortVideos: {
        maxArea: 1,
        english: true,   /* the Shorts entries in the side menu and the channel tab are found by their English title */
        css: [
          'ytd-reel-shelf-renderer',
          'ytd-rich-shelf-renderer[is-shorts]',
          'ytd-rich-section-renderer:has(ytd-rich-shelf-renderer[is-shorts])',
          'ytd-rich-item-renderer:has(ytm-shorts-lockup-view-model)',
          'ytd-video-renderer:has(a[href^="/shorts/"])',
          'grid-shelf-view-model:has(a[href^="/shorts/"])',
          'ytd-watch-next-secondary-results-renderer yt-lockup-view-model:has(a[href^="/shorts/"])',
          'yt-horizontal-list-renderer ytm-shorts-lockup-view-model-v2',
          'ytd-guide-entry-renderer:has(> a[title="Shorts"])',
          'ytd-mini-guide-entry-renderer:has(> a[title="Shorts"])',
          'ytd-mini-guide-entry-renderer[aria-label="Shorts"]',
          'yt-tab-shape[tab-title="Shorts"]'
        ],
        /* a Short, or a channel's Shorts tab (a list of hundreds of Shorts, too many for one rule per item) */
        redirect: { from: /^\/shorts\/|^\/(@[^\/]+|channel\/[^\/]+|c\/[^\/]+|user\/[^\/]+)\/shorts\/?$/, to: '/' }
      },
      autoplay: {
        act: function (ctx) {
          var stops = [ctx.helpers.keepOff('.ytp-autonav-toggle-button', autoplayIsOn), pauseTrailerOnce(ctx)];
          return function () { stops.forEach(function (stop) { stop(); }); };
        }
      },
      liveStreams: {
        maxArea: 1,
        english: true,   /* the Live entry in the side menu is found by its English title */
        css: [
          { sel: 'ytd-live-chat-frame', on: ['watch'] },
          { sel: '#chat-container', on: ['watch'] },
          { sel: '#teaser-carousel', on: ['watch'] },
          'ytd-rich-item-renderer:has(.ytBadgeShapeThumbnailLive)',
          'ytd-video-renderer:has(ytd-thumbnail[is-live-video])',
          'yt-lockup-view-model:has(.ytBadgeShapeThumbnailLive)',
          'ytd-guide-entry-renderer:has(> a[title="Live"])'
        ]
      },
      upNext: {
        on: ['watch'],
        maxArea: 1,   /* at the end of a video its countdown or tiles cover the whole player */
        css: [
          '.html5-endscreen', '.ytp-endscreen-content', '.ytp-ce-element', '.ytp-autonav-endscreen-countdown-overlay',
          '.ytp-cards-teaser', '.ytp-cards-button', '.ytp-pause-overlay', '.ytp-fullscreen-grid-stills-container'
        ]
      },
      hoverPreviews: {
        css: ['#video-preview', 'ytd-video-preview-loader', 'ytd-video-preview', 'ytd-thumbnail-overlay-loading-preview-renderer'],
        act: function (ctx) { return ctx.helpers.pauseVideos('ytd-video-preview video'); }
      },
      likes: {
        css: [
          'segmented-like-dislike-button-view-model', 'like-button-view-model', 'dislike-button-view-model', 'ytd-sentiment-bar-renderer',
          'ytd-comment-engagement-bar ytd-toggle-button-renderer', 'ytd-comment-engagement-bar #creator-heart'
        ]
      },
      follow: {
        css: [
          'ytd-subscribe-button-renderer', 'yt-subscribe-button-view-model',
          'ytd-subscription-notification-toggle-button-renderer-next',
          { sel: 'ytd-channel-renderer #subscribe-button', on: ['search'] },
          { sel: 'ytd-tabbed-page-header yt-flexible-actions-view-model', on: ['channel'] },
          { sel: 'yt-reel-channel-bar-view-model .ytReelChannelBarViewModelReelSubscribeButton', on: ['shorts'] }
        ]
      },
      comments: {
        maxArea: 1,
        css: [
          'ytd-comments#comments', '#comment-teaser',
          'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-comments-section"]',
          { sel: 'reel-action-bar-view-model > button-view-model:nth-of-type(1)', on: ['shorts'] }
        ]
      },
      share: {
        css: [
          { sel: 'ytd-watch-metadata #top-level-buttons-computed > yt-button-view-model:first-of-type', on: ['watch'] },   /* Share is the first of these; Save, Clip and Download follow it and stay */
          { sel: 'reel-action-bar-view-model > button-view-model:nth-of-type(2)', on: ['shorts'] },
          '.ytp-copylink-button', '.ytp-share-button'
        ]
      },
      counts: {
        css: [
          'like-button-view-model .ytSpecButtonShapeNextButtonTextContent',
          'like-button-view-model .ytSpecButtonShapeWithLabelLabel',
          { sel: 'reel-action-bar-view-model > button-view-model:nth-of-type(1) .ytSpecButtonShapeWithLabelLabel', on: ['shorts'] },
          'ytd-watch-info-text #info > span:first-child', 'ytd-watch-info-text #view-count',   /* a live stream's "N watching now" is the second */
          'ytd-comments-header-renderer #count', 'ytd-comment-engagement-bar #vote-count-middle',
          'yt-lockup-view-model .ytContentMetadataViewModelLeadingIcon',
          'yt-lockup-view-model .ytContentMetadataViewModelLeadingIcon + .ytContentMetadataViewModelMetadataText',
          'yt-lockup-view-model .ytContentMetadataViewModelLeadingIcon + .ytContentMetadataViewModelMetadataText + .ytContentMetadataViewModelDelimiter',
          'ytd-video-meta-block #metadata-line > .inline-metadata-item:first-of-type',
          '.shortsLockupViewModelHostOutsideMetadataSubhead',
          'view-count-factoid-renderer'
        ]
      },
      followers: {
        english: true,   /* the channel header's "N subscribers" is also matched by its English label, as a fallback to its position */
        css: [
          '#owner-sub-count',
          { sel: 'ytd-channel-renderer #metadata', on: ['search'] },
          { sel: 'ytd-tabbed-page-header .ytPageHeaderViewModelContentMetadata .ytContentMetadataViewModelMetadataRow:nth-of-type(2)', on: ['channel'] },
          { sel: 'ytd-tabbed-page-header .ytContentMetadataViewModelMetadataText[aria-label$="subscribers"]', on: ['channel'] },
          { sel: 'ytd-tabbed-page-header .ytPageHeaderViewModelContentMetadata > .ytContentMetadataViewModelDelimiter', on: ['channel'] }
        ]
      }
    },
    todo: []
  });
})();
