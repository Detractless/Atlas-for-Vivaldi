// The review plan for YouTube: which pages to open, and which parts should be visible on each.
//
// Signed out, in a fresh profile, YouTube's home feed is empty ("Try searching to get started") until a few videos
// have been watched, so the watch pages come first and the home page is last. Autoplay is on by default (the player's
// toggle says aria-checked="true"). Comments and the hover preview only exist after the page has been scrolled or
// pointed at, and the review's browser window never has focus (YouTube plays previews only then), so those two are
// proved with `contrast` checks below: the part is on, the page is made to show the thing, and the check reports how
// much of it is visible with the part on (must be 0) and with the part's style switched off for a moment (must be > 0).
//
// The Short and the live stream are real, popular items picked on 2026-11-01: if they are gone, pick another from
// https://www.youtube.com/@YouTube/shorts and https://www.youtube.com/results?search_query=live+news&sp=EgJAAQ%253D%253D
const ZOO = "https://www.youtube.com/watch?v=jNQXAC9IVRw";      // "Me at the zoo": 19 s long, comments, like, subscribe, related
const SHORT = "https://www.youtube.com/shorts/rPj14ToaZSA";     // from @YouTube/shorts
const LIVE = "https://www.youtube.com/watch?v=GotlA1KKWoo";     // CNN Headlines 24/7: a live stream with its chat open signed out

const SLEEP = "var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };";

/** A check for something that only shows after an action. `setup` is a snippet run in the page; then, every half
    second for up to `seconds`, the elements `selectors` are counted when visible: with the part on (0 expected), and
    with the part's style switched off for a moment (more than 0 expected, proof the page really showed them; the
    polling ends then). Also reports guard trips. */
function contrast(part, name, setup, selectors, seconds) {
  const expr = `(async function () { ${SLEEP} ${setup}
    var sels = ${JSON.stringify(selectors)}, on = 0, off = 0;
    function seen() { var n = 0; sels.forEach(function (s) { document.querySelectorAll(s).forEach(function (e) { var b = e.getBoundingClientRect(); if (b.width > 0 && b.height > 0) n++; }); }); return n; }
    var st = document.querySelector('style[data-atlas-social="${part}"]');
    for (var i = 0; i < ${seconds * 2}; i++) {
      await sleep(500);
      on = seen(); if (st) st.disabled = true; await sleep(250); off = seen(); if (st) st.disabled = false;
      if (off > 0) break;
    }
    window.scrollTo(0, 0);
    return { on: on, offSeen: off > 0, trips: document.documentElement.getAttribute('data-atlas-social-trips') || '' };
  })()`;
  return { part, name, expr, expect: { on: 0, offSeen: true, trips: "" }, waitMs: 500 };
}

/** Does the part keep autoplay off? YouTube remembers the toggle between pages, so it may already be off: then the
    check turns it on itself (as the site does when it resets) and waits for the part to switch it off again. Reports
    whether it saw the toggle on, where it ended up (up to 10 s), and the "Up next" countdown (shown only while autoplay
    is on). When the toggle is still on, what the player looked like is added, to see why. */
const AUTOPLAY_STATE = `(async function () { ${SLEEP}
  function toggle() { var el = document.querySelector('.ytp-autonav-toggle-button'); return el && el.getAttribute('aria-checked'); }
  function vis(s) { var e = document.querySelector(s); if (!e) return 'none'; var b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 ? 'visible' : 'hidden'; }
  var sawOn = toggle() === 'true', i, t;
  if (!sawOn && toggle() === 'false') {
    document.querySelector('.ytp-autonav-toggle-button').click();
    for (i = 0; i < 120 && !sawOn; i++) { await sleep(25); sawOn = toggle() === 'true'; }
  }
  for (i = 0; i < 20; i++) { t = toggle(); if (t === 'false') break; await sleep(500); }
  var out = { sawOn: sawOn, toggle: t, countdown: vis('.ytp-autonav-endscreen-countdown-overlay') };
  if (t !== 'false') { var mp = document.querySelector('#movie_player'); out.player = mp && mp.className.replace(/ytp-[a-z-]+/g, '').trim(); out.href = location.search; out.ad = !!document.querySelector('.ad-showing'); }
  return out;
})()`;
const AUTOPLAY_OFF = { sawOn: true, toggle: "false", countdown: "hidden" };

// Jump to the last moment of the video (muted, which the browser always allows): the end screen follows.
const SEEK_END = "var v = document.querySelector('video.html5-main-video'); if (v) { v.muted = true; v.play(); v.currentTime = Math.max(0, v.duration - 0.3); }";
// With autoplay on the end of the video shows a countdown; with it off, tiles of other videos (the second is what shows then).
const UP_NEXT_ELEMENTS = [".html5-endscreen", ".ytp-endscreen-content", ".ytp-ce-element", ".ytp-autonav-endscreen-countdown-overlay", ".ytp-fullscreen-grid-stills-container"];
// Scroll the comments into view and give them time to load (they load only when seen).
const SEE_COMMENTS = "document.querySelector('ytd-comments').scrollIntoView();";
// The first plain video in the home feed: not an ad, a Short or a live stream (those do not play the same preview).
const PLAIN_VIDEO = "ytd-rich-item-renderer:not(:has(ytd-ad-slot-renderer)):not(:has(ytm-shorts-lockup-view-model)):not(:has(.ytBadgeShapeThumbnailLive)) yt-thumbnail-view-model";
// Point at the first thumbnail the way the mouse does. The review's window has no focus, which YouTube checks.
const point = (thumb) => `document.hasFocus = function () { return true; }; (function () {
    var t = document.querySelector(${JSON.stringify(thumb)}); if (!t) return; t.scrollIntoView({ block: 'center' });
    var b = t.getBoundingClientRect(), o = { bubbles: true, view: window, clientX: b.left + b.width / 2, clientY: b.top + b.height / 2 };
    ['mouseover', 'mouseenter', 'mousemove'].forEach(function (n) { t.dispatchEvent(new MouseEvent(n, o)); });
  })();`;

export default {
  key: "youtube",
  pages: [
    // A fresh browser has an empty cache, so the first YouTube page it opens takes 20 s or more to build itself
    // (a skeleton for the video's details and the side bar). This page only pays that price, with no part to check.
    { name: "warmup", url: "https://www.youtube.com/feed/history", parts: [], settleMs: 20000, scroll: false },
    {
      // The comments load some time after the page (when YouTube is idle, or when they are scrolled to), so what the
      // like and count rules match here keeps changing: they are checked on the live page, and on the comments below.
      name: "watch", url: ZOO, settleMs: 9000, scroll: false,    // the comments are loaded by the checks below, not by scrolling
      parts: ["followers", "share", "suggested", "follow", "comments"],
      checks: [
        { part: "autoplay", name: "autoplay toggle off", expr: AUTOPLAY_STATE, expect: AUTOPLAY_OFF, waitMs: 500 },
        contrast("likes", "like buttons on comments", SEE_COMMENTS, ["ytd-comment-engagement-bar ytd-toggle-button-renderer"], 12),
        contrast("counts", "comment counts", SEE_COMMENTS, ["ytd-comments-header-renderer #count", "ytd-comment-engagement-bar #vote-count-middle"], 6),
        contrast("comments", "comment threads", SEE_COMMENTS, ["ytd-comment-thread-renderer"], 12),     // last: the two above have loaded them
        contrast("counts", "views under the video", "", ["ytd-watch-info-text #info > span:first-child"], 6),
      ],
    },
    {
      // The last 2 s of the video: its end screen. With autoplay on (the default) it shows the "Up next" countdown.
      // Whether the video has ended when the page is measured depends on how fast it loaded; the check below does not.
      name: "watch-end", url: ZOO + "&t=17s", parts: ["upNext"], scroll: false, settleMs: 6000,
      checks: [
        contrast("upNext", "end screen at the end of the video", SEEK_END, UP_NEXT_ELEMENTS, 12),    // first: with autoplay off the end screen stays empty
        { part: "autoplay", name: "no up-next countdown", expr: AUTOPLAY_STATE, expect: AUTOPLAY_OFF, waitMs: 500 },
      ],
    },
    { name: "search", url: "https://www.youtube.com/results?search_query=minecraft", parts: ["shortVideos", "suggested", "liveStreams", "counts"], settleMs: 9000, scroll: false },
    {
      name: "search-channel", url: "https://www.youtube.com/results?search_query=mrbeast", parts: ["follow", "followers", "counts"], settleMs: 9000, scroll: false,
      checks: [contrast("hoverPreviews", "hover preview", point("ytd-video-renderer ytd-thumbnail"), ["ytd-video-preview"], 8)],
    },
    { name: "search-live", url: "https://www.youtube.com/results?search_query=live+news&sp=EgJAAQ%253D%253D", parts: ["liveStreams"], settleMs: 9000, scroll: false },
    { name: "channel", url: "https://www.youtube.com/@YouTube", settleMs: 8000, parts: ["follow", "followers", "shortVideos", "liveStreams", "counts"] },
    {
      // No comments here (the chat replaces them), so what the like and count rules match does not change while the
      // page is open; every part on at once, to leave one ALL ON line that covers the whole table.
      name: "live", url: LIVE, settleMs: 9000, scroll: false,
      // (the last five are not on this page: they are listed so that they are on in the ALL ON line)
      parts: ["liveStreams", "likes", "share", "follow", "followers", "counts", "suggested", "comments", "upNext", "shortVideos", "hoverPreviews", "autoplay"],
      checks: [contrast("counts", "viewers watching now", "", ["ytd-watch-info-text #view-count"], 6)],
    },
    { name: "shorts", url: SHORT, parts: ["comments", "share", "follow", "counts", "likes"], settleMs: 20000, scroll: false },
    {
      name: "home", url: "https://www.youtube.com/", settleMs: 15000, parts: ["shortVideos", "liveStreams", "counts", "hoverPreviews", "suggested"],
      hold: { hoverPreviews: PLAIN_VIDEO },
      checks: [contrast("hoverPreviews", "hover preview", point(PLAIN_VIDEO), ["ytd-video-preview"], 8)],
    },
  ],
  redirects: [
    { part: "shortVideos", url: SHORT, expectNot: "^/shorts/" },
    { part: "shortVideos", url: "https://www.youtube.com/@YouTube/shorts", expectNot: "/shorts" },   // the tab lists hundreds of Shorts
  ],
};
