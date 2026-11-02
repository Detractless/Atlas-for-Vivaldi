// The review plan for Instagram (signed out). Signed out, Instagram shows a public profile or post behind a "sign up"
// pop-up (the page stays readable behind it; the tool measures elements, not what is on top) and the home page is a
// log-in form. Nothing of the signed-in app (feed, story tray, messages, home sidebar) can be seen: those hooks are
// source-only. The redirect parts cannot be measured on the page they send away (the page is gone), so they are
// listed under redirects; "follow" is a behaviour part, so it is checked with `checks` (see the control checks).
const VISIBLE_FOLLOW = "Array.from(document.querySelectorAll('[role=\"button\"],button')).filter(function (e) { var b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 && /^follow$/i.test((e.textContent || '').trim()); }).length";
const followChecks = [
  { part: "stories", name: "control: follow buttons are on screen when follow is off", expr: VISIBLE_FOLLOW + " > 0", expect: true, waitMs: 800 },
  { part: "follow", name: "follow on: no follow button left on screen", expr: VISIBLE_FOLLOW, expect: 0, waitMs: 2500 },
];
export default {
  key: "instagram",
  pages: [
    // counts is not listed on a profile page: it has no post row. followers is its stats row.
    { name: "profile", url: "https://www.instagram.com/instagram/", settleMs: 6000, parts: ["followers", "stories", "whoToFollow", "shortVideos", "follow"], checks: followChecks },
    { name: "reel", url: "https://www.instagram.com/instagram/reel/DfISRt1vadT/", settleMs: 6000, parts: ["likes", "counts", "follow"], checks: followChecks },
    { name: "post", url: "https://www.instagram.com/nasa/p/DfIY71Lku89/", settleMs: 6000, parts: ["likes", "counts", "follow"], checks: followChecks },
    { name: "home", url: "https://www.instagram.com/", parts: ["stories", "whoToFollow", "likes", "counts", "messages"] },
  ],
  redirects: [
    { part: "shortVideos", url: "https://www.instagram.com/instagram/reel/DfISRt1vadT/", expectNot: "/reel" },
    { part: "stories", url: "https://www.instagram.com/stories/instagram/", expectNot: "^/stories" },
    { part: "messages", url: "https://www.instagram.com/direct/inbox/", expectNot: "^/direct" },
  ],
};
