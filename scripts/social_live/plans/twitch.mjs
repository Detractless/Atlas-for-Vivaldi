// The review plan for Twitch, signed out. The front page shows the carousel, live shelves, the live channels in the left
// menu and a red number badge (Prime offers); a live channel page shows the player and chat; the directory shows grids of
// live-stream cards. Pick a channel that is always on air for the channel page (theburntpeanut streams 24/7).
const TITLE = `(async function () {
  document.title = '(3) Twitch';
  await new Promise(function (r) { setTimeout(r, 900); });
  return document.title;
})()`;

export default {
  key: "twitch",
  pages: [
    {
      name: "home", url: "https://www.twitch.tv/", settleMs: 8000,
      parts: ["liveStreams", "badges"],
      checks: [{ part: "badges", name: "(3) is stripped from the tab title", expr: TITLE, expect: "Twitch", waitMs: 1500 }],
    },
    { name: "channel", url: "https://www.twitch.tv/theburntpeanut", settleMs: 9000, parts: ["liveStreams", "badges"] },
    { name: "directory", url: "https://www.twitch.tv/directory/all", settleMs: 8000, parts: ["liveStreams"] },
  ],
  redirects: [],
};
