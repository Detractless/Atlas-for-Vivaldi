/* ── atlas-social-reddit.js: what hides each part of Reddit (the social media filter's site table; see
   docs/specs/006-social-filter-blocking/design.md for the format). Reviewed against the real site with
   scripts/social_live_check.mjs reddit; the review notes are in review-reddit.md.
   Selectors are facts about Reddit's markup (the "shreddit" web components); they are rewritten here, from what the
   projects below found and from the real page: fabiomolignoni/FrontFilter (MPL-2.0; selectors.js: posts, suggested
   posts and communities, vote/comment/share signals, main-page links), djm30/Distraction-Free-Reddit (MIT; main
   feed, r/popular, comments, the search box's trending list), joelacus/RedditEnhancer (reference only; recommended
   posts, vote and share buttons), mrandal/unhook-for-reddit (reference only; component names).
   New Reddit only: old.reddit.com has other markup and is not covered. ── */

(function () {
  'use strict';
  var S = window.__atlasSocial;
  if (!S || !S.run) return;

  /* Reddit builds a post's action row (votes, comment count, share) and the search box's drop-down inside shadow
     roots, where no page style reaches: those rules are the parts' `shadow` lists, which the engine puts into each
     host's root (and into the roots of hosts that arrive as the page scrolls). */
  var EVERY_PAGE = ['home', 'popular', 'explore', 'post', 'sub', 'search', 'other'];

  var RECOMMENDED = 'shreddit-post[recommendation-source]:not([recommendation-source=""])';
  var MAIN_LINKS = ['/r/popular', '/r/all', '/explore', '/news'];

  S.run({
    key: 'reddit', name: 'Reddit', live: true,
    hosts: ['reddit.com'],
    route: function (path) {
      if (/^\/(?:(?:best|hot|new|top|rising)\/?)?$/.test(path)) return 'home';
      if (/^\/r\/(?:popular|all)(?:\/|$)/.test(path)) return 'popular';
      if (/^\/(?:explore|news)(?:\/|$)/.test(path)) return 'explore';
      if (/\/comments\//.test(path)) return 'post';
      if (/^\/r\//.test(path)) return 'sub';
      if (/^\/search/.test(path)) return 'search';
      return 'other';
    },
    landmarks: [{ sel: 'shreddit-app' }, { sel: 'reddit-header-large' }, { sel: 'reddit-header-small' }, { sel: 'main#main-content' }],
    smoke: ['reddit-search-large', '#reddit-logo'],
    parts: {
      /* The endless feed of the home page (signed out, the home page is the Popular feed), and its sort bar. */
      homeFeed: {
        css: ['shreddit-feed', 'shreddit-async-loader[bundlename="shreddit_sort_dropdown"]'],
        on: ['home'], maxArea: 1
      },
      /* Recommended posts (signed in: the ones Reddit picks, which carry a recommendation-source; the Popular feed
         is recommendations by design and is left to "Trending"), community suggestions in the right column (Reddit
         shows "Discover communities" or "Popular Communities", both an aside inside the rail's aside), and a post
         page's "People also ask" and "Related posts". */
      suggested: {
        css: [
          { sel: 'shreddit-app:not([pagetype="popular"]) shreddit-feed article:has(> ' + RECOMMENDED + ')', on: ['home', 'sub', 'other'] },
          { sel: 'shreddit-app:not([pagetype="popular"]) shreddit-feed article:has(> ' + RECOMMENDED + ') + hr', on: ['home', 'sub', 'other'] },
          { sel: 'in-feed-community-recommendations', on: ['home', 'popular', 'sub', 'other'] },
          { sel: 'aside:has(> ul > li > community-card)', on: ['home', 'popular', 'sub', 'other'] },
          { sel: '#right-sidebar-contents > aside > aside', on: ['home', 'popular'] },
          { sel: 'aside#answers-suggested-queries-pdp', on: ['post'] },
          { sel: 'aside:has(> pdp-right-rail)', on: ['post'] }
        ],
        maxArea: 1
      },
      /* Popular, All, Explore and News: the pages are sent home; their links and the search box's "trending" list go. */
      trending: {
        css: MAIN_LINKS.map(function (p) { return '#right-sidebar-container li:has(a[href="' + p + '"], a[href="' + p + '/"])'; }),
        redirect: { from: /^\/(?:r\/(?:popular|all)|explore|news)(?:\/|$)/, to: '/' },
        shadow: [
          /* the search box's "trending" list, and the heading just before it */
          { host: 'reddit-search-large', css: ['#reddit-trending-searches-partial-container', '*:has(+ #reddit-trending-searches-partial-container)'], on: EVERY_PAGE },
          { host: 'reddit-search-small', css: ['#reddit-trending-searches-partial-container', '*:has(+ #reddit-trending-searches-partial-container)'], on: EVERY_PAGE },
          { host: 'left-nav-top-section', css: MAIN_LINKS.map(function (p) { return 'li:has(a[href="' + p + '"], a[href="' + p + '/"])'; }), on: EVERY_PAGE }
        ]
      },
      /* Vote arrows (post, comment) and awards. The post's and the comment's vote rows are in shadow roots. */
      likes: {
        css: ['award-button'],
        shadow: [
          { host: 'shreddit-post', css: ['span:has(> shreddit-vote-animations)', 'shreddit-vote-animations', '.rpl-vote-button-group'], on: EVERY_PAGE },
          { host: 'shreddit-comment-action-row', css: ['shreddit-vote-animations'] }
        ]
      },
      /* Reading and writing comments: the comment tree, the "Join the conversation" box with its sort and search,
         and the comment button on posts. */
      comments: {
        css: ['shreddit-comment-tree', 'comment-body-header'],
        maxArea: 1,
        shadow: [{ host: 'shreddit-post', css: ['[data-post-click-location="comments-button"]'] }]
      },
      /* The share button on posts (in a shadow root) and comments. */
      share: {
        css: ['shreddit-comment-share-button', 'rpl-dropdown[slot="ssr-share-button"]'],
        shadow: [{ host: 'shreddit-post', css: ['shreddit-post-share-button'] }]
      },
      /* The numbers: vote scores and comment counts (the buttons stay), and the counts under related posts. */
      counts: {
        css: ['reddit-pdp-right-rail-post div:has(> faceplate-number)'],
        shadow: [
          { host: 'shreddit-post', css: ['button[upvote] ~ span:has(> faceplate-number)', '[data-post-click-location="comments-button"] faceplate-number'] },
          { host: 'shreddit-comment-action-row', css: ['button[upvote] ~ span:has(> faceplate-number)'] }
        ]
      }
    },
    todo: []
  });
})();
