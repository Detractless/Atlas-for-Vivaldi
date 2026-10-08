// constants/atlasKeys.json is the one list of storage keys, databases and ids.
// These checks keep the code and the list in step:
// - every key the code names is in the list, and every listed key is used;
// - profilesCore.js's per-category key lists match the list's "profile" fields;
// - plain scripts that cannot import the list hold the same names.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { scanFile } = require("./helpers/storageKeyScan");

const ROOT = path.resolve(__dirname, "..", "..");
const SRC = path.join(ROOT, "payload", "detractless", "src");
const KEYS = JSON.parse(fs.readFileSync(path.join(SRC, "constants", "atlasKeys.json"), "utf8"));

/* Calls the scanner cannot resolve to literal keys, and why that is fine. */
const DYNAMIC_OK = {
  "payload/detractless/src/settings/registry.js": "keys come from settings/definitions.js, each checked against the list by syncDefault()",
  "payload/detractless/src/services/dataImport.js": "keys come from BACKUP_SYNC_KEYS (the list)",
  "payload/detractless/src/services/dataExport.js": "keys come from BACKUP_SYNC_KEYS (the list)",
  "payload/detractless/src/background/stateSync.js": "SEEDED_KEYS, each checked by syncDefault()",
  "payload/detractless/src/components/tabs/tabs.js": "legacy page<id> key (syncPatterns)",
  "payload/detractless/src/pastekit/services/install.js": "SETTINGS_KEY = 'pastekit.settings' from pastekit/utils/settings.js",
  "src/modules/02-bridge-setup.js": "seeds the service-worker defaults (atlas_window.test.js checks the values)",
};

function sourceFiles() {
  return execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { cwd: ROOT, encoding: "utf8" })
    .split("\n").filter((f) => /\.(m?js)$/.test(f))
    .filter((f) => !/(^|\/)(_old|dist|vendor|node_modules|tests)\//.test(f) && !f.startsWith("tests/"))
    .filter((f) => !f.startsWith("payload/extensions/")) // Harper is a separate extension with its own storage
    .filter((f) => f !== "payload/install-files/atlas.js" && !f.endsWith("atlas-spelling.js")); // generated from src/modules
}

test("every storage key the code names is in atlasKeys.json", () => {
  const unknown = [], dynamic = [];
  for (const rel of sourceFiles()) {
    const found = scanFile(path.join(ROOT, rel));
    for (const area of ["sync", "local", "session"]) {
      for (const key of found[area]) if (!(key in KEYS[area])) unknown.push(`${rel}: ${area}.${key}`);
    }
    if (found.dynamic.length && !DYNAMIC_OK[rel]) dynamic.push(`${rel}: ${found.dynamic.map((d) => d.what).join(", ")}`);
  }
  assert.deepEqual(unknown, [], "add these to atlasKeys.json (or fix the typo)");
  assert.deepEqual(dynamic, [], "storage calls with keys the test cannot read; add a reason to DYNAMIC_OK");
});

test("every key in atlasKeys.json is used somewhere", () => {
  const code = sourceFiles().map((f) => fs.readFileSync(path.join(ROOT, f), "utf8")).join("\n");
  const unused = [];
  for (const area of ["sync", "local", "session"]) {
    for (const key of Object.keys(KEYS[area])) {
      if (!code.includes(`'${key}'`) && !code.includes(`"${key}"`)) unused.push(`${area}.${key}`);
    }
  }
  assert.deepEqual(unused, []);
});

function loadProfilesCore() {
  const vm = require("vm");
  const ctx = { console, Promise, setTimeout, location: { pathname: "/window.html" } };
  ctx.window = ctx;
  const area = { get: (k, cb) => cb({}), set: (o, cb) => cb && cb(), remove: (k, cb) => cb && cb() };
  ctx.chrome = { storage: { sync: area, local: area, onChanged: { addListener() {} } } };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(SRC, "pages", "newtab", "profilesCore.js"), "utf8"), ctx);
  return ctx.AtlasProfiles;
}

test("profile categories in profilesCore.js match the list's profile fields", () => {
  const AP = loadProfilesCore();
  const fromCore = {}, fromList = {};
  for (const c of AP.CATS) fromCore[c.id] = [...c.keys].sort();
  for (const [key, entry] of Object.entries(KEYS.sync)) {
    if (entry.profile) (fromList[entry.profile] = fromList[entry.profile] || []).push(key);
  }
  for (const id of Object.keys(fromList)) fromList[id].sort();
  assert.deepEqual(JSON.parse(JSON.stringify(fromCore)), fromList);
  assert.equal(AP.MAIN_DB, KEYS.databases.bookmarks);
});

test("plain scripts use the listed database name", () => {
  for (const rel of ["pages/newtab/preinit.js", "pages/shared/themePreinit.js"]) {
    const text = fs.readFileSync(path.join(SRC, rel), "utf8");
    const opened = [...text.matchAll(/indexedDB\.open\('([^']+)'/g)].map((m) => m[1]);
    assert.deepEqual(opened, [KEYS.databases.bookmarks], rel);
  }
});

test("the installer points the new tab at the listed extension id", () => {
  const out = execFileSync("python3", ["-c", "from installer.paths import newtab_url; print(newtab_url())"], { cwd: ROOT, encoding: "utf8" }).trim();
  assert.equal(out, `chrome-extension://${KEYS.extensionId}/${KEYS.newTabPath}`);
});
