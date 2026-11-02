// The installer (installer/preferences.py) sets up one profile; src/modules/38-profile-recipe.js sets up every
// other one. A profile must end up the same either way, so run both on the same starting profile and compare
// every setting the recipe knows about.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..", "..");
const SOURCE = fs.readFileSync(path.join(ROOT, "src", "modules", "38-profile-recipe.js"), "utf8");
const Atlas = {};
new Function("Atlas", SOURCE)(Atlas);

/* What preferences.py leaves in a profile, and the facts file it writes for the other profiles. */
const PYTHON = `
import json, sys
from pathlib import Path
sys.path.insert(0, sys.argv[1])
from installer import preferences as P
from installer.profile_facts import profile_facts
root = Path(sys.argv[1]); payload = root / "payload"; css = Path("/tmp/atlas-css-mods")
prefs = json.load(sys.stdin)
v = prefs.setdefault("vivaldi", {})
P._prefs_appearance(v, css); P._prefs_remove_tools_panel(v); P._prefs_downloads_panel(v)
P._prefs_address_bar(prefs, v); P._prefs_navigation_toolbar(v); P._prefs_new_tab(v)
P._prefs_themes(v, payload); P._prefs_startup(prefs)
print(json.dumps({"prefs": prefs, "facts": profile_facts(payload, css)}))
`;
function installer(prefs) {
  const out = execFileSync("python3", ["-I", "-c", PYTHON, ROOT], { input: JSON.stringify(prefs), encoding: "utf8" });
  return JSON.parse(out);
}

const at = (obj, dotted) => dotted.split(".").reduce((o, k) => (o && typeof o === "object" ? o[k] : undefined), obj);
function setAt(obj, dotted, value) {
  const keys = dotted.split(".");
  const last = keys.pop();
  const parent = keys.reduce((o, k) => (o[k] = o[k] && typeof o[k] === "object" ? o[k] : {}), obj);
  parent[last] = value;
}
const snapshotOf = (prefs) => Object.fromEntries(Atlas.profilePaths().map((p) => [p, at(prefs, p)]));

/* Starting profiles: empty, the kind of profile Vivaldi makes, one the user has arranged, and one already set up. */
const STARTS = {
  "an empty profile": {},
  "a stock Vivaldi profile": {
    vivaldi: {
      toolbars: {
        navigation: ["Back", "Forward", "Reload", "Spacer", "AddressField", "Spacer", "Extensions", "Spacer", "AccountButton"],
        tabbar_before: ["WorkspaceButton"], tabbar_after: ["NewTab", "FlexibleSpacer", "TabButton"], panel: ["Bookmarks", "Extensions", "History"],
      },
      panels: { web: { elements: [] } },
      themes: { current: "Vivaldi", user: [] },
    },
  },
  "a profile the user has arranged": {
    vivaldi: {
      toolbars: {
        navigation: ["Reload", "AddressField", "Notes"], tabbar_before: ["Back", "Forward", "TabSearch", "WorkspaceButton"],
        panel: ["Bookmarks", "Extensions", "WEBPANEL_atlas_sidebar"],
      },
      panels: { web: { elements: [{ id: "WEBPANEL_atlas_sidebar", url: "x" }, { id: "keep", url: "https://example.com" }] } },
      themes: { current: "Dark", user: [{ id: "Mine" }] },
    },
    search: { suggest_enabled: true },
  },
};

for (const [name, start] of Object.entries(STARTS)) {
  test(`the window code and the installer set up ${name} the same way`, () => {
    const { prefs: expected, facts } = installer(start);
    const snap = snapshotOf(start);
    Object.assign(snap, JSON.parse(JSON.stringify(Atlas.profileRecipe(snap, facts))));
    const got = {};
    for (const p of Atlas.profilePaths()) setAt(got, p, snap[p]);
    for (const p of Atlas.profilePaths()) {
      assert.deepEqual(JSON.parse(JSON.stringify(at(got, p) ?? null)), JSON.parse(JSON.stringify(at(expected, p) ?? null)), p);
    }
  });
}
