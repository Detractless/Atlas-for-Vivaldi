// The review plan for X, signed out. X shows a login wall on / and /explore, and serves public profiles and posts as a
// plain page without the data-testid markup of the signed-in app. So only the parts that have a signed-out counterpart
// can pass here (followers, follow); trending, whoToFollow and newPosts are listed so the report says "not-visible"
// honestly, and are proven only by the health log in a signed-in session.
export default {
  key: "x",
  pages: [
    { name: "profile", url: "https://x.com/NASA", settleMs: 8000, parts: ["followers", "follow", "whoToFollow", "trending", "newPosts"] },
    { name: "post", url: "https://x.com/NASA/status/2116263878807998722", settleMs: 8000, parts: ["followers", "follow", "whoToFollow", "trending"] },
  ],
  redirects: [],
};
