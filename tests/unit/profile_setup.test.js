// src/modules/39-profile-setup.js: the first time a Vivaldi profile opens, Atlas's settings are applied to it
// and its window is swapped for a new one (the look is read when a window opens). A stand-in Vivaldi keeps the
// profile's settings in an object and its windows and tabs in a list, so what happened can be read back.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { openWindow } = require("./helpers/windowDom");

const Recipe = {};
new Function("Atlas", fs.readFileSync(path.join(__dirname, "..", "..", "src", "modules", "38-profile-recipe.js"), "utf8"))(Recipe);

const plain = (v) => JSON.parse(JSON.stringify(v === undefined ? null : v));
let open = [];
test.afterEach(() => { for (const w of open) w.window.close(); open = []; });

const FACTS = {
  version: 2,
  cssDir: "/Users/x/Library/Application Support/Vivaldi/Atlas/css-mods",
  newTabUrl: "chrome-extension://abc/index.html",
  downloadsPanel: { id: "WEBPANEL_atlas_downloads", url: "chrome-extension://abc/components/atlas/downloads-panel.html" },
  themes: [{ id: "AtlasLight", name: "Atlas Light" }, { id: "AtlasDark", name: "Atlas Dark" }],
};
const FAST = { start: 20, settle: 20, poll: 15, polls: 2, tries: 6 };
const LOOK = "vivaldi.appearance.css_ui_mods_directory";

/* A profile as Vivaldi makes it. */
const bareStore = () => ({
  [LOOK]: "",
  "vivaldi.toolbars.navigation": ["Back", "Forward", "Reload", "AddressField"],
  "vivaldi.toolbars.tabbar_before": ["WorkspaceButton"],
  "vivaldi.toolbars.tabbar_after": ["NewTab", "TabButton"],
  "vivaldi.toolbars.panel": ["Bookmarks"],
  "vivaldi.panels.web.elements": [],
  "vivaldi.themes.user": [],
  "vivaldi.themes.current": "Vivaldi",
});

function stage({ store = bareStore(), window: winOver = {}, tabs, movesAll = true, growing = false, facts = FACTS, local } = {}) {
  const sets = [], calls = [];
  const win = Object.assign({ id: 1, type: "normal", incognito: false, state: "normal", left: 10, top: 20, width: 1200, height: 800 }, winOver);
  const list = tabs || [{ id: 13, index: 2 }, { id: 11, index: 0 }, { id: 12, index: 1, active: true }];
  let queried = 0;
  const vivaldi = {
    prefs: {
      get: (p, cb) => cb({ store: "user", value: store[p] }),
      set: ({ path, value }) => { store[path] = value; sets.push(path); },
    },
  };
  const chromeApis = {
    windows: {
      // Other Atlas code calls getCurrent(callback); Vivaldi's form with options is getCurrent(options, callback).
      getCurrent: (o, cb) => {
        if (typeof o === "function") { cb = o; o = {}; }
        cb(Object.assign({}, win, o && o.populate ? { tabs: list } : {}));
      },
      create: (spec, cb) => { calls.push(["create", plain(spec)]); cb({ id: 2, tabs: [{ id: spec.tabId }] }); },
      remove: (id, cb) => { calls.push(["remove", id]); if (cb) cb(); },
    },
    tabs: {
      query: (q, cb) => cb(growing ? Array.from({ length: ++queried }, (_, i) => ({ id: i })) : list),
      move: (ids, props, cb) => { calls.push(["move", plain(ids), plain(props)]); cb(movesAll ? ids.map((id) => ({ id })) : []); },
    },
  };
  const fetch = (url) => (facts && url === "atlas-profile.json"
    ? Promise.resolve({ ok: true, json: () => Promise.resolve(facts) })
    : Promise.reject(new Error("offline in tests")));
  return { store, sets, calls, opts: { vivaldi, chromeApis, fetch, local, windowProps: { __atlasProfileSetupTiming: FAST }, settleMs: 450 } };
}

/* A profile with everything the recipe sets already in place. */
function settledStore() {
  const store = bareStore();
  const snap = Object.fromEntries(Recipe.profilePaths().map((p) => [p, store[p]]));
  return Object.assign(store, plain(Recipe.profileRecipe(snap, FACTS)));
}

/* What the profile setup set. Atlas's theme sync also sets the current theme and the web colour scheme as the
   window opens, whatever the profile; those two are not part of the setup. */
const setupSets = (s) => s.sets.filter((p) => p !== "vivaldi.themes.current" && p !== "vivaldi.PreferredColorScheme");

async function run(s) {
  const w = await openWindow(s.opts);
  open.push(w);
  await new Promise((r) => setTimeout(r, 250));          // the swap, if any, takes a few timer ticks
  const mark = await new Promise((r) => w.chrome.storage.local.get("atlas_profile_setup", (v) => r(plain(v.atlas_profile_setup))));
  return { w, mark };
}

test("a new profile gets Atlas's settings, then its window is swapped, the tabs keeping their order", async () => {
  const s = stage();
  const { mark } = await run(s);
  assert.equal(s.store[LOOK], FACTS.cssDir);
  assert.equal(s.store["vivaldi.homepage"], FACTS.newTabUrl);
  assert.deepEqual(plain(s.store["vivaldi.themes.user"]).map((t) => t.id), ["AtlasLight", "AtlasDark"]);
  assert.equal(mark.v, 2);
  assert.equal(mark.applied, true);
  assert.deepEqual(plain(s.store["vivaldi.toolbars.tabbar_before"]), [], "no Workspaces button");
  assert.deepEqual(plain(s.store["vivaldi.toolbars.tabbar_after"]), ["NewTab"], "no tab-list button");
  // The active tab (12) opens the new window; the tab before it goes in at the front, the one after it at the end.
  assert.deepEqual(s.calls, [
    ["create", { tabId: 12, left: 10, top: 20, width: 1200, height: 800 }],
    ["move", [11], { windowId: 2, index: 0 }],
    ["move", [13], { windowId: 2, index: -1 }],
    ["remove", 1],
  ]);
});

test("a maximised window is reopened maximised", async () => {
  const s = stage({ window: { state: "maximized" } });
  await run(s);
  assert.deepEqual(s.calls[0], ["create", { tabId: 12, state: "maximized" }]);
});

test("a profile the installer already set up is only marked, not changed", async () => {
  const s = stage({ store: settledStore() });
  const { mark } = await run(s);
  assert.deepEqual(setupSets(s), []);
  assert.deepEqual(s.calls, []);
  assert.equal(mark.applied, false);
});

test("a profile set up under an older version gets the newer rules, without a new window", async () => {
  const store = settledStore();
  store["vivaldi.toolbars.tabbar_before"] = ["WorkspaceButton"];
  const s = stage({ store, local: { atlas_profile_setup: { v: 1, applied: true, at: 1 } } });
  const { mark } = await run(s);
  assert.deepEqual(setupSets(s), ["vivaldi.toolbars.tabbar_before"]);
  assert.deepEqual(plain(s.store["vivaldi.toolbars.tabbar_before"]), []);
  assert.deepEqual(s.calls, [], "the look folder did not change, so the window stays");
  assert.equal(mark.v, 2);
});

test("a profile that was set up before is left alone", async () => {
  const s = stage({ local: { atlas_profile_setup: { v: 2, applied: true, at: 1 } } });
  await run(s);
  assert.deepEqual(setupSets(s), []);
  assert.deepEqual(s.calls, []);
});

test("a profile whose toolbars cannot be read is left alone and not marked", async () => {
  const store = bareStore();
  delete store["vivaldi.toolbars.navigation"];
  const s = stage({ store });
  const { mark } = await run(s);
  assert.deepEqual(setupSets(s), []);
  assert.equal(mark, null);
});

test("if a tab does not move, the old window is kept", async () => {
  const s = stage({ movesAll: false });
  await run(s);
  assert.equal(s.store[LOOK], FACTS.cssDir, "the settings were still applied");
  assert.ok(!s.calls.some((c) => c[0] === "remove"), "the old window was not closed");
});

test("a private window is set up but never swapped", async () => {
  const s = stage({ window: { incognito: true } });
  await run(s);
  assert.equal(s.store[LOOK], FACTS.cssDir);
  assert.deepEqual(s.calls, []);
});

test("a window whose tabs are still arriving is not swapped", async () => {
  const s = stage({ growing: true });
  await run(s);
  assert.equal(s.store[LOOK], FACTS.cssDir);
  assert.deepEqual(s.calls, []);
});

test("without the installer's facts file nothing happens", async () => {
  const s = stage({ facts: null });
  const { mark } = await run(s);
  assert.deepEqual(setupSets(s), []);
  assert.equal(mark, null);
});
