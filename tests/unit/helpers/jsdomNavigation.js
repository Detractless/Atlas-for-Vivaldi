// jsdom does not follow links to other pages; it only reports "not implemented".
// To let tests see WHERE the page tried to go, wrap jsdom's internal navigate()
// before jsdom loads (Location-impl.js copies the function at load time).
// Every attempted navigation is pushed onto window.__navigations as a string.
"use strict";

const path = require("path");

const navPath = path.join(path.dirname(require.resolve("jsdom")), "jsdom", "living", "window", "navigation.js");
const whatwgURL = require(require.resolve("whatwg-url", { paths: [path.dirname(navPath)] }));
const navigation = require(navPath);

if (!navigation.__atlasWrapped) {
  const original = navigation.navigate;
  navigation.navigate = (window, newURL, flags) => {
    try {
      (window.__navigations || (window.__navigations = [])).push(whatwgURL.serializeURL(newURL));
    } catch (e) { /* recording is best-effort */ }
    return original(window, newURL, flags);
  };
  navigation.__atlasWrapped = true;
}

module.exports = {};
