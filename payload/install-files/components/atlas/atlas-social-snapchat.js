/* ── atlas-social-snapchat.js: what hides each part of Snapchat (the social media filter's site table; see
   docs/specs/006-social-filter-blocking/design.md for the format). Reviewed against the real signed-out site with
   scripts/social_live_check.mjs snapchat; notes in docs/specs/006-social-filter-blocking/review-snapchat.md.
   Source: InfectedDuck/ReelLess (MIT), which treats Spotlight as a route (/spotlight) rather than as page markup;
   that is the approach taken here too: Spotlight is a page, so the part sends the page away and hides the way in.
   The nav links were read from the signed-out pages. ── */

(function () {
  'use strict';
  var S = window.__atlasSocial;
  if (!S || !S.run) return;

  S.run({
    key: 'snapchat', name: 'Snapchat', live: true,
    hosts: ['snapchat.com'],
    /* Spotlight lives at /spotlight, /spotlight/<id>, /@user/spotlight and /@user/spotlight/<id>. */
    route: function (path) {
      if (path === '/') return 'home';
      if (/^\/(spotlight|@[^/]+\/spotlight)(\/|$)/.test(path)) return 'spotlight';
      return 'other';
    },
    /* The home page and the Spotlight page are built differently, so each landmark is the one both share. */
    landmarks: [{ sel: '[data-testid="page-frame"]' }],
    smoke: ['[data-testid="desktop-nav-search"] input', '[data-testid="searchInputBox"]'],
    parts: {
      shortVideos: {
        css: [
          { sel: 'li:has(> a[href$="/spotlight"])', on: ['home', 'spotlight', 'other'] },   /* the "Spotlight" tab (desktop and mobile bars), with its list slot: in the bar on every page */
          'a[href$="/spotlight"]'              /* the same link where it is not in a list (mobile tab bar) */
        ],
        redirect: { from: /^\/(spotlight|@[^/]+\/spotlight)(\/|$)/, to: '/' }
      }
    },
    todo: []
  });
})();
