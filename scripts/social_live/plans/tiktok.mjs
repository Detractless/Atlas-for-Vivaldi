// The review plan for TikTok (signed out). TikTok shows a "Log in to TikTok" pop-up over every page; the page stays
// readable behind it and the tool measures elements, not what is on top, so the pop-up is left alone.
// Page addresses: a video id comes from the @tiktok profile (any current video of that profile will do).
const VIDEO = "https://www.tiktok.com/@tiktok/video/7702947070604332319";
const ACTION = ["likes", "follow", "share", "counts"];
export default {
  key: "tiktok",
  pages: [
    { name: "home", url: "https://www.tiktok.com/", parts: ["homeFeed", "shortVideos", ...ACTION, "posting"],
      checks: [{ part: "shortVideos", name: "no video keeps playing in the hidden feed", expr: "Array.from(document.querySelectorAll('video')).filter(function (v) { return !v.paused; }).length", expect: 0, waitMs: 2500 }] },
    // shortVideos is not listed on the video page: turning it on there sends the page away (tested under redirects).
    { name: "video", url: VIDEO, parts: [...ACTION] },
    // explore and profile are not scrolled and list counts first: their grids keep loading rows, and the offline fixture must see the same page that was measured.
    { name: "explore", url: "https://www.tiktok.com/explore", settleMs: 7000, scroll: false, parts: ["counts", "homeFeed", "shortVideos"] },
    { name: "profile", url: "https://www.tiktok.com/@tiktok", settleMs: 7000, scroll: false, parts: ["counts", "shortVideos", "follow", "share"] },
  ],
  redirects: [
    { part: "shortVideos", url: VIDEO, expectNot: "/video/" },
    // Signed out, TikTok itself sends these to /login before any script runs, so "pass" only proves the page is not left on the upload route.
    { part: "posting", url: "https://www.tiktok.com/tiktokstudio/upload", expectNot: "^/tiktokstudio" },
    { part: "posting", url: "https://www.tiktok.com/upload", expectNot: "^/upload" },
    { part: "posting", url: "https://www.tiktok.com/creator-center/upload", expectNot: "^/creator-center" },
  ],
};
