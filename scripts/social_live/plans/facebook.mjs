// The review plan for Facebook (signed out). Signed out, Facebook shows the log-in form on / and a public Page's header
// and posts behind a log-in pop-up (the page stays readable behind it; the tool measures elements, not what is on
// top). Nothing of the signed-in app (news feed, story tray, composer, badges) can be seen, so those hooks are
// source-only. The one thing both worlds share is a Page's own timeline (a feed of posts), which proves homeFeed.
// "badges" is a behaviour part, so it is checked with `checks`: the tab title count really is stripped (set here,
// because a signed-out page has none) and a synthetic badge (a bare number in a banner) is hidden.
const BADGE = "new Promise(function (resolve) { var bar = document.createElement('div'); bar.setAttribute('role', 'banner'); bar.style.cssText = 'position:fixed;top:0;left:0;width:200px;height:40px;z-index:1'; var chip = document.createElement('div'); chip.style.cssText = 'width:20px;height:20px;background:red'; var n = document.createElement('span'); n.textContent = '3'; chip.appendChild(n); bar.appendChild(chip); document.body.appendChild(bar); setTimeout(function () { var r = getComputedStyle(chip).display; bar.remove(); resolve(r); }, 1800); })";
const TITLE = "new Promise(function (resolve) { document.title = '(3) Facebook'; setTimeout(function () { resolve(document.title); }, 1500); })";
const badgeChecks = [
  { part: "badges", name: "the (3) is stripped from the tab title", expr: TITLE, expect: "Facebook", waitMs: 500 },
  { part: "badges", name: "synthetic badge (number in a small box in a banner): the box is hidden", expr: BADGE, expect: "none", waitMs: 500 },
];
export default {
  key: "facebook",
  pages: [
    { name: "page", url: "https://www.facebook.com/facebook", settleMs: 6000, parts: ["homeFeed", "stories", "posting", "badges"], checks: badgeChecks },
    { name: "home", url: "https://www.facebook.com/", parts: ["homeFeed", "stories", "posting", "badges"] },
  ],
  redirects: [
    { part: "stories", url: "https://www.facebook.com/stories/", expectNot: "^/stories" },
  ],
};
