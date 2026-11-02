/* ── atlas-social-instagram.js: what hides each part of Instagram (the social media filter's site table; see
   docs/specs/006-social-filter-blocking/design.md for the format). Reviewed against the real signed-out site with
   scripts/social_live_check.mjs instagram; per-pair status (verified-live or source-only) in
   docs/specs/006-social-filter-blocking/review-instagram.md.
   Selectors came from these projects (reference only, rewritten here): malekwael229/FocusTube (MIT: reels links, the
   stories tray), InfectedDuck/ReelLess (MIT: /reels and /stories are routes to block), jordwest/news-feed-eradicator
   (AGPL: the suggested-accounts link /explore/people/), sanjeed5/instagram-chats-hider-extension (MIT: the chat
   list), matiso23/untrap-insta (MIT: reels links); gerwld/igplus-extension (CC BY-NC-ND) was consulted for which
   numbers count as "counts" and "followers". Instagram's class names are hashed and change weekly, so none are used
   here: hooks are roles, href shapes, and the plain structure of the signed-out pages (<main role="main">,
   <header>, <section>). ── */

(function () {
  'use strict';
  var S = window.__atlasSocial;
  if (!S || !S.run) return;

  var MARK = 'data-atlas-follow';
  /* Follow buttons have no hook at all (a <div role="button"> holding only the word), so they are found by that word.
     English plus the languages Instagram's own web app uses most; a language not listed here keeps its buttons.
     Only the words that ASK you to follow: the "Following" button, which is how you unfollow, is left alone. */
  var FOLLOW_WORD = /^(follow|follow back|seguir|segui|suivre|s[’']abonner|abonnieren|folgen|volgen|obserwuj|ikuti|takip et|подписаться|フォローする|팔로우|关注|متابعة)$/i;
  var RESERVED = /^(explore|reels?|p|tv|stories|direct|accounts|about|legal|privacy|terms|directory|developer|web|api|challenge|emailsignup|login|oauth)$/;

  /* Mark every follow button so the part's css can hide it; the returned stopper takes the marks off again.
     Instagram reuses page elements as you move around, so a mark is taken off when the word is no longer there. */
  function markFollowButtons(ctx) {
    function scan() {
      var old = document.querySelectorAll('[' + MARK + ']');
      for (var j = 0; j < old.length; j++) {
        if (!FOLLOW_WORD.test((old[j].textContent || '').trim())) old[j].removeAttribute(MARK);
      }
      var list = document.querySelectorAll('[role="button"], button');
      for (var i = 0; i < list.length; i++) {
        var el = list[i];
        if (el.hasAttribute(MARK) || el.childElementCount > 2) continue;
        if (FOLLOW_WORD.test((el.textContent || '').trim())) el.setAttribute(MARK, '');
      }
    }
    scan();
    var stop = ctx.helpers.every(700, scan);
    return function () {
      stop();
      var marked = document.querySelectorAll('[' + MARK + ']');
      for (var i = 0; i < marked.length; i++) marked[i].removeAttribute(MARK);
    };
  }

  S.run({
    key: 'instagram', name: 'Instagram', live: true,
    hosts: ['instagram.com'],
    route: function (path) {
      if (path === '/') return 'home';
      if (/^\/(?:[^/]+\/)?reels?(\/|$)/.test(path)) return 'reels';
      if (/^\/(?:[^/]+\/)?(p|tv)\/[^/]/.test(path)) return 'post';
      if (path.indexOf('/stories/') === 0) return 'stories';
      if (path.indexOf('/direct') === 0) return 'direct';
      if (path.indexOf('/explore') === 0) return 'explore';
      var m = /^\/([A-Za-z0-9._]+)\/?$/.exec(path);
      return m && !RESERVED.test(m[1]) ? 'profile' : 'other';
    },
    /* The app root (div[id^="mount_"]) has no box of its own, so it cannot be checked on screen; <main> can. */
    landmarks: [{ sel: 'main[role="main"]' }],
    smoke: ['main[role="main"]'],
    parts: {
      whoToFollow: {
        css: [
          { sel: 'div:has(> div > a[href$="/related_profiles/"])', on: ['profile'] },   /* "Accounts you might like" on a profile: block with its "See all" link */
          { sel: 'div:has(> div > a[href="/explore/people/"])', on: ['home'] },      /* the same block beside the home feed (news-feed-eradicator) */
          'a[href="/explore/people/"]'
        ]
      },
      stories: {
        css: [
          '[role="menu"]:has(a[href^="/stories/"])',          /* the tray / a profile's highlights: every item links to /stories/ */
          '[role="menu"]:has([aria-label^="Story by"])',      /* the home tray (FocusTube) */
          '[scrollable="true"]:has([aria-label^="Story by"])'
        ],
        redirect: { from: /^\/stories\//, to: '/' }, english: true
      },
      shortVideos: {
        css: ['a[href*="/reel/"]', 'a[href*="/reels/"]', 'a[href$="/reels"]'],   /* grid cells, the nav item, a profile's Reels tab */
        redirect: { from: /^\/(?:[^/]+\/)?reels?(\/|$)/, to: '/' }, maxArea: 1
      },
      likes: {
        css: [
          { sel: 'section > div > span:first-child:has([role="button"])', on: ['home', 'post', 'reels'] },   /* the heart in the row under a post or reel: structure only, so only where those are */
          { sel: '[role="button"]:has(svg[aria-label="Like"])', on: ['home'] },
          { sel: '[role="button"]:has(svg[aria-label="Unlike"])', on: ['home'] }
        ],
        english: true
      },
      follow: { css: ['[' + MARK + ']'], act: markFollowButtons, english: true },
      messages: {
        css: ['a[href^="/direct/"]', 'div[aria-label="Thread list"][role="navigation"]'],
        redirect: { from: /^\/direct(\/|$)/, to: '/' }, english: true
      },
      counts: {
        css: [
          { sel: 'section > div > span[role="button"]', on: ['home', 'post', 'reels'] },   /* the numbers beside the heart and speech bubble (structure only: scoped) */
          'a[href$="/liked_by/"]', 'a[href$="/comments/"]'
        ]
      },
      followers: { css: [{ sel: 'header > section > ul', on: ['profile'] }] }   /* the posts / followers / following row */
    },
    todo: []
  });
})();
