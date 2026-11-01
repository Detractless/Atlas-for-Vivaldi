// The browser window's theme sync (src/modules/11-theme-sync.js) must not flash
// the wrong theme: an empty theme read never undoes a chosen theme, and an older
// asynchronous sync never writes after a newer one has started.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..", "..");
const SRC = fs.readFileSync(path.join(ROOT, "src/modules/11-theme-sync.js"), "utf8");

/** Runs the module with fake storage and Vivaldi prefs; `drain()` answers every pending pref read. */
function boot(initialTheme, currentThemeId, initialScheme = 0) {
  const pending = [];
  const sets = [];
  const schemeSets = [];
  const logged = [];
  const listeners = [];
  const prefs = {
    get(p, cb) { pending.push({ p, cb }); },
    set(o) { (o.path === "vivaldi.PreferredColorScheme" ? schemeSets : sets).push(o.value); },
  };
  const values = {
    "vivaldi.PreferredColorScheme": { value: initialScheme },
    "vivaldi.themes.current": { value: currentThemeId },
    "vivaldi.themes.user": { value: [{ id: "AtlasLight", name: "Atlas Light" }, { id: "AtlasDark", name: "Atlas Dark" }] },
  };
  const viv = { prefs };
  const win = { vivaldi: viv, matchMedia: () => ({ matches: false, addEventListener() {} }), addEventListener() {} };
  const ctx = {
    window: win,
    vivaldi: viv,
    document: { getElementById: () => null },
    chrome: {
      storage: {
        sync: { get: (k, cb) => cb({ Theme: initialTheme }) },
        onChanged: { addListener: (fn) => listeners.push(fn) },
      },
    },
    setTimeout: () => 0,
    atlasWarn: (w, e) => { throw e; },
    saveNsfwDebugEvents: (ev) => logged.push(...ev),
  };
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  return {
    sets,
    schemeSets,
    logged,
    change(theme) { listeners[0]({ Theme: { newValue: theme } }, "sync"); },
    drain() { while (pending.length) { const { p, cb } = pending.shift(); cb(values[p]); } },
  };
}

test("an empty theme read after a theme is chosen is ignored", () => {
  const t = boot({ Theme: "light" }, "AtlasLight");
  t.drain();
  t.change(null);
  t.drain();
  assert.deepEqual(t.sets, [], "the browser is not switched to Atlas Dark");
  assert.ok(t.logged.some((e) => e.event === "theme" && e.data.act === "ignoredEmpty"), "the ignored read is logged");
});

test("a first read with no theme still means dark", () => {
  const t = boot(undefined, "AtlasLight");
  t.drain();
  assert.deepEqual(t.sets, ["AtlasDark"]);
});

test("an older sync does not write after a newer one started", () => {
  const t = boot({ Theme: "dark" }, "AtlasLight");
  t.change({ Theme: "light" });
  t.drain();
  assert.deepEqual(t.sets, [], "the stale dark request never reaches the preference");
});

test("a real theme change is written and logged", () => {
  const t = boot({ Theme: "light" }, "AtlasLight");
  t.drain();
  t.change({ Theme: "dark" });
  t.drain();
  assert.deepEqual(t.sets, ["AtlasDark"]);
  assert.ok(t.logged.some((e) => e.data.act === "set" && e.data.to === "AtlasDark"));
});

test("the website appearance follows the Atlas Theme: light is 1, dark is 2, system is 0", () => {
  for (const [theme, want] of [["light", 1], ["dark", 2], ["custom", 2], ["system", 0]]) {
    const t = boot({ Theme: theme }, "AtlasLight", want === 1 ? 2 : 1);
    t.drain();
    assert.deepEqual(t.schemeSets, [want], theme);
  }
});

test("the website appearance is left alone when it already matches", () => {
  const t = boot({ Theme: "light" }, "AtlasLight", 1);
  t.drain();
  assert.deepEqual(t.schemeSets, []);
});

test("a theme change rewrites the website appearance, and an older read never lands after a newer one", () => {
  const t = boot({ Theme: "light" }, "AtlasLight", 1);
  t.drain();
  t.change({ Theme: "dark" });
  t.change({ Theme: "system" });
  t.drain();
  assert.deepEqual(t.schemeSets, [0], "only the latest request reaches the preference");
});

test("an empty theme read does not touch the website appearance", () => {
  const t = boot({ Theme: "light" }, "AtlasLight", 1);
  t.drain();
  t.change(null);
  t.drain();
  assert.deepEqual(t.schemeSets, []);
});
