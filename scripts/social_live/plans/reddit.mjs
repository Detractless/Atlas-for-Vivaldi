// The review plan for Reddit (new Reddit, signed out). Home shows the Popular feed with its action rows; a post page shows
// comments, related posts and "People also ask". Many parts live in shadow roots (a post's action row, the comment vote
// row, the search box's list), so the page selectors find nothing there and `checks` prove them instead.
const q = JSON.stringify;

// In every `host`'s shadow root: is `target` there, is it hidden (not visible), and is `sibling` still shown?
const shadow = (host, target, sibling) => `(function () {
  var ex = 0, vis = 0, sib = 0;
  function shown(e) { var b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0; }
  document.querySelectorAll(${q(host)}).forEach(function (h) {
    var r = h.shadowRoot; if (!r) return;
    var t = r.querySelector(${q(target)}); if (t) { ex++; if (shown(t)) vis++; }
    var s = r.querySelector(${q(sibling)}); if (s && shown(s)) sib++;
  });
  return { exists: ex > 0, hidden: vis === 0, restStillShown: sib > 0 };
})()`;
const SHADOW_OK = { exists: true, hidden: true, restStillShown: true };

// The search box's "trending" list is only drawn after a real click: force it to display inline and see our rule win.
const TRENDING_LIST = `(function () {
  var s = document.querySelector('reddit-search-large'), t = s && s.shadowRoot && s.shadowRoot.querySelector('#reddit-trending-searches-partial-container');
  if (!t) return 'missing';
  t.style.display = 'block';
  var d = getComputedStyle(t).display;
  t.style.display = '';
  return d;
})()`;

// Recommended posts are left alone on the Popular feed (signed out, that is every post); flip the page type to "home" to see the rule.
const RECOMMENDED = `(async function () {
  var app = document.querySelector('shreddit-app'), old = app.getAttribute('pagetype');
  function vis() { var n = 0; document.querySelectorAll('shreddit-post[recommendation-source]').forEach(function (e) { var b = e.getBoundingClientRect(); if (b.width > 0 && b.height > 0) n++; }); return n; }
  var kept = vis();
  app.setAttribute('pagetype', 'home');
  await new Promise(function (r) { setTimeout(r, 400); });
  var hidden = vis();
  app.setAttribute('pagetype', old);
  return { popularFeedKept: kept > 0, homeFeedHidden: hidden === 0 };
})()`;

const POST_CHECKS = [
  { part: "likes", name: "post vote row hidden, comment button still shown", expr: shadow("shreddit-post", ".rpl-vote-button-group", '[data-post-click-location="comments-button"]'), expect: SHADOW_OK },
  { part: "comments", name: "post comment button hidden, vote row still shown", expr: shadow("shreddit-post", '[data-post-click-location="comments-button"]', ".rpl-vote-button-group"), expect: SHADOW_OK },
  { part: "share", name: "post share button hidden, vote row still shown", expr: shadow("shreddit-post", "shreddit-post-share-button", ".rpl-vote-button-group"), expect: SHADOW_OK },
  { part: "counts", name: "post vote count hidden, arrows still shown", expr: shadow("shreddit-post", "button[upvote] ~ span:has(> faceplate-number)", "button[upvote]"), expect: SHADOW_OK },
  { part: "likes", name: "comment vote buttons hidden", expr: shadow("shreddit-comment-action-row", "shreddit-vote-animations", "div"), expect: SHADOW_OK },
  { part: "counts", name: "comment vote count hidden, arrows still shown", expr: shadow("shreddit-comment-action-row", "button[upvote] ~ span:has(> faceplate-number)", "button[upvote]"), expect: SHADOW_OK },
];

export default {
  key: "reddit",
  pages: [
    {
      name: "home", url: "https://www.reddit.com/", settleMs: 7000,
      parts: ["homeFeed", "suggested", "trending", "likes", "comments", "share", "counts"],
      checks: [
        { part: "likes", name: "post vote row hidden, comment button still shown", expr: shadow("shreddit-post", ".rpl-vote-button-group", '[data-post-click-location="comments-button"]'), expect: SHADOW_OK },
        { part: "counts", name: "vote count hidden, vote arrows still shown", expr: shadow("shreddit-post", "button[upvote] ~ span:has(> faceplate-number)", "button[upvote]"), expect: SHADOW_OK },
        { part: "comments", name: "comment button hidden, vote row still shown", expr: shadow("shreddit-post", '[data-post-click-location="comments-button"]', ".rpl-vote-button-group"), expect: SHADOW_OK },
        { part: "share", name: "share button hidden, vote row still shown", expr: shadow("shreddit-post", "shreddit-post-share-button", ".rpl-vote-button-group"), expect: SHADOW_OK },
        { part: "trending", name: "search box trending list stays display:none when forced open", expr: TRENDING_LIST, expect: "none" },
        { part: "suggested", name: "recommended posts hidden on a home-type page, kept on Popular", expr: RECOMMENDED, expect: { popularFeedKept: true, homeFeedHidden: true } },
      ],
    },
    {
      name: "post", url: "https://www.reddit.com/r/AskReddit/comments/1xkbciw/", settleMs: 7000,
      parts: ["comments", "likes", "share", "counts", "suggested"],
      checks: POST_CHECKS,
    },
    {
      // An old, archived post with a long comment tree. Reddit's "Prove your humanity" check hits fresh signed-out browsers at random on every Reddit page; just run it again later.
      name: "post-old", url: "https://www.reddit.com/r/IAmA/comments/z1c9z/i_am_barack_obama_president_of_the_united_states/", settleMs: 7000, scroll: false,   // no scrolling: the comment tree is already long, and the fixture snapshot must stay under 600 KB
      parts: ["suggested", "comments", "likes", "share", "counts"],
      checks: POST_CHECKS,
    },
  ],
  redirects: [
    { part: "trending", url: "https://www.reddit.com/r/popular/", expectNot: "^/r/popular" },
  ],
};
