// src/modules/38-profile-recipe.js: the settings Atlas gives a Vivaldi profile, as a pure function of what the
// profile has now. Loaded on its own (no window), so these are plain data in, plain data out.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const SOURCE = fs.readFileSync(path.join(__dirname, "..", "..", "src", "modules", "38-profile-recipe.js"), "utf8");
function loadRecipe() {
  const Atlas = {};
  new Function("Atlas", SOURCE)(Atlas);
  return Atlas;
}
const { profileRecipe, profilePaths } = loadRecipe();

const FACTS = {
  version: 2,
  cssDir: "/Users/x/Library/Application Support/Vivaldi/Atlas/css-mods",
  newTabUrl: "chrome-extension://abc/index.html",
  downloadsPanel: { id: "WEBPANEL_atlas_downloads", url: "chrome-extension://abc/components/atlas/downloads-panel.html" },
  themes: [{ id: "AtlasLight", name: "Atlas Light" }, { id: "AtlasDark", name: "Atlas Dark" }],
};

/* A profile as Vivaldi makes it: every list present, nothing of Atlas's in it. */
function bareProfile() {
  const snap = {};
  for (const p of profilePaths()) snap[p] = undefined;
  Object.assign(snap, {
    "vivaldi.appearance.css_ui_mods_directory": "",
    "vivaldi.toolbars.navigation": ["Back", "Forward", "Reload", "Spacer", "AddressField", "Spacer", "Notes"],
    "vivaldi.toolbars.tabbar_before": ["WorkspaceButton"],
    "vivaldi.toolbars.tabbar_after": ["NewTab", "FlexibleSpacer", "TabButton"],
    "vivaldi.toolbars.panel": ["Bookmarks", "Extensions", "History"],
    "vivaldi.panels.web.elements": [],
    "vivaldi.themes.user": [],
    "vivaldi.themes.current": "Vivaldi",
  });
  return snap;
}
const apply = (snap, changes) => Object.assign({}, snap, JSON.parse(JSON.stringify(changes)));
const plain = (v) => JSON.parse(JSON.stringify(v));

test("a bare profile gets the look folder, the new tab, the themes and the Downloads panel", () => {
  const changes = plain(profileRecipe(bareProfile(), FACTS));
  assert.equal(changes["vivaldi.appearance.css_ui_mods_directory"], FACTS.cssDir);
  assert.equal(changes["vivaldi.homepage"], FACTS.newTabUrl);
  assert.equal(changes["vivaldi.tabs.new_page.custom_url"], FACTS.newTabUrl);
  assert.equal(changes["vivaldi.tabs.new_page.link"], 4);
  assert.deepEqual(changes["vivaldi.themes.user"].map((t) => t.id), ["AtlasLight", "AtlasDark"]);
  assert.equal(changes["vivaldi.themes.current"], "AtlasLight");
  assert.deepEqual(changes["vivaldi.panels.web.elements"].map((e) => e.id), ["WEBPANEL_atlas_downloads"]);
  assert.deepEqual(changes["vivaldi.toolbars.panel"], ["Bookmarks", "History", "WEBPANEL_atlas_downloads"]);
  assert.equal(changes["vivaldi.address_bar.omnibox.enabled"], false);
  assert.equal(changes["vivaldi.theme.schedule.enabled"], "off");
});

test("the mainbar gets Back, Forward, Home and Extensions where Atlas expects them, and keeps the profile's own buttons", () => {
  const changes = plain(profileRecipe(bareProfile(), FACTS));
  const nav = changes["vivaldi.toolbars.navigation"];
  assert.ok(nav.indexOf("Home") === nav.indexOf("Reload") + 1, "Home sits right after Reload");
  assert.ok(nav.indexOf("Extensions") === nav.indexOf("AddressField") + 1, "Extensions sits right after the address field");
  assert.ok(nav.includes("Notes") && nav.includes("AccountButton"), "the profile's own button stays; the account button is added");
  assert.equal(nav.filter((b) => b === "Back").length, 1);
});

test("Back and Forward leave the tab bar's own toolbars", () => {
  const snap = bareProfile();
  snap["vivaldi.toolbars.tabbar_before"] = ["Back", "Forward", "TabSearch"];
  snap["vivaldi.toolbars.tabbar_after"] = ["NewTab", "FlexibleSpacer"];
  const changes = plain(profileRecipe(snap, FACTS));
  assert.deepEqual(changes["vivaldi.toolbars.tabbar_before"], ["TabSearch"]);
  assert.equal("vivaldi.toolbars.tabbar_after" in changes, false, "a toolbar without them is not touched");
});

test("a bare profile loses Vivaldi's Workspaces button and tab-list button, and keeps the rest of the tab bar", () => {
  const changes = plain(profileRecipe(bareProfile(), FACTS));
  assert.deepEqual(changes["vivaldi.toolbars.tabbar_before"], []);
  assert.deepEqual(changes["vivaldi.toolbars.tabbar_after"], ["NewTab", "FlexibleSpacer"]);
  const own = bareProfile();
  own["vivaldi.toolbars.tabbar_before"] = ["WorkspaceButton", "TabSearch"];
  assert.deepEqual(plain(profileRecipe(own, FACTS))["vivaldi.toolbars.tabbar_before"], ["TabSearch"]);
});

test("running it again on what it already produced changes nothing", () => {
  const first = profileRecipe(bareProfile(), FACTS);
  const again = profileRecipe(apply(bareProfile(), first), FACTS);
  assert.deepEqual(plain(again), {});
});

test("a theme the profile already has stays, and an Atlas theme already chosen is not swapped back", () => {
  const snap = bareProfile();
  snap["vivaldi.themes.user"] = [{ id: "Mine", name: "Mine" }, { id: "AtlasDark", name: "Atlas Dark" }];
  snap["vivaldi.themes.current"] = "AtlasDark";
  const changes = plain(profileRecipe(snap, FACTS));
  assert.deepEqual(changes["vivaldi.themes.user"].map((t) => t.id), ["Mine", "AtlasDark", "AtlasLight"]);
  assert.equal("vivaldi.themes.current" in changes, false);
});

test("the old Tools panel is removed and the Downloads panel is added only once", () => {
  const snap = bareProfile();
  snap["vivaldi.panels.web.elements"] = [
    { id: "WEBPANEL_atlas_sidebar", url: "x" },
    { id: "keep", url: "https://example.com" },
    { id: "other", url: "chrome-extension://abc/sidepanel.html" },
  ];
  snap["vivaldi.toolbars.panel"] = ["WEBPANEL_atlas_sidebar", "WEBPANEL_atlas_downloads"];
  const changes = plain(profileRecipe(snap, FACTS));
  assert.deepEqual(changes["vivaldi.panels.web.elements"].map((e) => e.id), ["keep", "WEBPANEL_atlas_downloads"]);
  assert.deepEqual(changes["vivaldi.toolbars.panel"], ["WEBPANEL_atlas_downloads"]);
});
