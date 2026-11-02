/* ── atlas-social-x.js: what hides each part of X (the social media filter's site table; see
   docs/specs/006-social-filter-blocking/design.md for the format). Reviewed as far as a signed-out browser allows
   with scripts/social_live_check.mjs x; the review notes (what was seen live and what is source-only) are in
   review-x.md.
   Selectors are facts about X's markup, rewritten here from what these projects found: insin/control-panel-for-twitter
   (MIT; the sidebar, trends, who-to-follow, follow-button and follower-count rules), typefully/minimal-twitter (MIT;
   sidebar sections, follower counts, sidebar links). The follow button on a signed-out profile was written from the
   real page. X's own markup is data-testid based in the signed-in app; signed out, X serves a different, plainer page
   (no data-testid), so most of this table can only be proven against a signed-in session (health log). ── */

(function () {
  'use strict';
  var S = window.__atlasSocial;
  if (!S || !S.run) return;

  /* First path segments that are X's own pages, not an account name. */
  var RESERVED = /^\/(?:home|explore|search|notifications|messages|i|settings|compose|login|logout|signup|tos|privacy|jobs|lists|bookmarks|communities|premium|account|intent|share|hashtag)(?:\/|$)/;

  S.run({
    key: 'x', name: 'X', live: true,
    hosts: ['x.com', 'twitter.com'],
    route: function (path) {
      if (path === '/' || /^\/home\/?$/.test(path)) return 'home';
      if (/^\/explore(?:\/|$)/.test(path)) return 'explore';
      if (/^\/search(?:\/|$)/.test(path)) return 'search';
      if (/^\/[^\/]+\/status\/\d+\/?$/.test(path)) return 'tweet';   /* not /status/1/likes: those lists are people */
      if (/^\/[^\/]+\/status\//.test(path)) return 'other';
      if (/^\/[^\/]+\/(?:followers|following|verified_followers|followers_you_follow)\/?$/.test(path)) return 'follows';
      if (RESERVED.test(path)) return 'other';
      if (/^\/[A-Za-z0-9_]{1,15}(?:\/(?:with_replies|media|likes|highlights|articles))?\/?$/.test(path)) return 'profile';
      return 'other';
    },
    landmarks: [{ sel: '#react-root' }, { sel: 'main' }, { sel: '[data-testid="primaryColumn"]' }, { sel: 'header[role="banner"]' }],
    smoke: ['main', '[data-testid="AppTabBar_Home_Link"]', 'input[data-testid="SearchBox_Search_Input"]'],
    parts: {
      /* "What's happening" in the right column, trend rows, "Today's News", the Explore link in the left menu, and
         the Explore page itself (sent to Home). */
      trending: {
        css: [
          '[data-testid="sidebarColumn"] div:has(> section[aria-labelledby^="accessible-list-"])',
          '[data-testid="sidebarColumn"] section[aria-labelledby^="accessible-list-"]',
          '[data-testid="sidebarColumn"] div:has(> [data-testid="news_sidebar"])',
          '[data-testid="trend"]',
          'header a[data-testid="AppTabBar_Explore_Link"]',
          { sel: '[data-testid="primaryColumn"] section[aria-labelledby^="accessible-list-"]', on: ['explore'] }
        ],
        redirect: { from: /^\/explore(?:\/|$)/, to: '/home' }
      },
      /* The right column's account box ("Who to follow", "Relevant people") and the suggestion modules inside
         timelines (their heading row stays: it has no stable hook). */
      whoToFollow: {
        css: [
          '[data-testid="sidebarColumn"] aside[role="complementary"]',
          { sel: '[data-testid="cellInnerDiv"]:has([data-testid="UserCell"])', on: ['home', 'tweet', 'profile'] }
        ]
      },
      /* Follow buttons (a "Following" button, which only shows state, stays). The second rule is the signed-out
         profile page, where the button is a plain button with a link laid over it. */
      follow: {
        css: [
          '[role="button"][data-testid$="-follow"]',
          { sel: 'main div:has(> a[aria-label="Follow"])', on: ['profile'] }
        ],
        english: true
      },
      /* The Followers and Following counts on profiles and hover cards (the whole link; tabs on the follower
         lists are role="tab" and stay). */
      followers: {
        css: [
          'a[href$="/verified_followers"]:not([role="tab"])',
          'a[href$="/followers"]:not([role="tab"])',
          'a[href$="/following"]:not([role="tab"])'
        ]
      },
      /* The "Show N posts" bar that appears over the home timeline. The first rule is control-panel-for-twitter's
         (the bar is the one child of the column positioned by an inline transform); the others use the pillLabel
         hook, which is from memory of the page (signed in only: not seen live, the health log will say). */
      newPosts: {
        css: [
          '[data-testid="primaryColumn"] > div > div:first-child > div[style^="transform"]',
          '[data-testid="primaryColumn"] [role="button"]:has([data-testid="pillLabel"])',
          '[data-testid="primaryColumn"] [data-testid="pillLabel"]'
        ],
        on: ['home']
      }
    },
    todo: []
  });
})();
