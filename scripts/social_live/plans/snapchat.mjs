// The review plan for Snapchat (signed out). Spotlight is a page, so the part is a redirect plus the nav tab. The
// Spotlight page itself is not listed under pages: with the part on, opening it sends the browser away, so there is
// nothing left to measure there; the redirect is tested instead (https://www.snapchat.com/spotlight ends up on
// /@someone/spotlight/<id> by itself, and must end up on / with the part on).
export default {
  key: "snapchat",
  pages: [
    { name: "home", url: "https://www.snapchat.com/", parts: ["shortVideos"] },
  ],
  redirects: [
    { part: "shortVideos", url: "https://www.snapchat.com/spotlight", expectNot: "spotlight" },
  ],
};
