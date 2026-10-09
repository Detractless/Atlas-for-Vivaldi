// Unit tests for payload/detractless/src/pages/newtab/profilesCore.js against an
// in-memory chrome.storage. Run: node --test tests/unit/profiles_core.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const SRC = path.join(__dirname, "..", "..", "payload", "detractless", "src", "pages", "newtab", "profilesCore.js");
const clone = (o) => (o === undefined ? undefined : JSON.parse(JSON.stringify(o)));

/* Fresh module + fresh storage per test. */
function boot(seed) {
  const areas = { sync: {}, local: {} }, listeners = [];
  const area = (name) => ({
    get(keys, cb) {
      const d = areas[name], out = {};
      (keys === null ? Object.keys(d) : [].concat(keys)).forEach((k) => { if (k in d) out[k] = clone(d[k]); });
      cb(out);
    },
    set(obj, cb) {
      const ch = {};
      Object.keys(obj).forEach((k) => { ch[k] = { oldValue: clone(areas[name][k]), newValue: clone(obj[k]) }; areas[name][k] = clone(obj[k]); });
      listeners.slice().forEach((fn) => fn(ch, name));
      cb && cb();
    },
    remove(keys, cb) {
      const ch = {};
      [].concat(keys).forEach((k) => { if (k in areas[name]) { ch[k] = { oldValue: clone(areas[name][k]) }; delete areas[name][k]; } });
      listeners.slice().forEach((fn) => fn(ch, name));
      cb && cb();
    }
  });
  Object.assign(areas.sync, clone((seed || {}).sync));
  Object.assign(areas.local, clone((seed || {}).local));
  global.window = global;
  delete global.AtlasProfiles;
  global.location = { pathname: "/window.html" };
  global.chrome = { storage: { sync: area("sync"), local: area("local"), onChanged: { addListener: (fn) => listeners.push(fn) } } };
  delete require.cache[SRC];
  require(SRC);
  return { AP: global.AtlasProfiles, areas };
}

/* Stand-in for BookmarkDB: one object per database name. */
function fakeBDB(dbs) {
  return {
    dbName: "DetractlessBookmarks", db: null,
    async init() { this.db = { close() {} }; dbs[this.dbName] = dbs[this.dbName] || {}; },
    async getAllBookmarks() { if (!this.db) await this.init(); return clone(dbs[this.dbName]); },
    async importAllBookmarks(d) { if (!this.db) await this.init(); Object.assign(dbs[this.dbName], clone(d)); }
  };
}

test("first run starts from two default profiles, everything shared", async () => {
  const { AP, areas } = boot();
  const s = await AP.ready;
  assert.equal(s.list.length, 2);
  assert.equal(s.active, "personal");
  assert.ok(AP.CATS.every((c) => s.share[c.id] === true));
  assert.ok(areas.local.atlasProfilesV2, "state is stored");
});

test("the old localStorage-shim profile list migrates (plan becomes label)", async () => {
  const old = { active: "b", list: [{ id: "a", name: "Ann", plan: "Work", color: 2 }, { id: "b", name: "Bo", plan: "", color: 3 }] };
  const { AP } = boot({ local: { __atlas_localstorage__: { atlasProfiles: JSON.stringify(old) } } });
  const s = await AP.ready;
  assert.deepEqual(s.list.map((p) => [p.id, p.name, p.label]), [["a", "Ann", "Work"], ["b", "Bo", ""]]);
  assert.equal(s.active, "b");
  assert.equal(s.owner, "b");
});

test("switching with everything shared leaves the live settings alone", async () => {
  const { AP, areas } = boot({ sync: { Theme: { Theme: "light" }, tabLimit: 4 } });
  await AP.ready;
  await AP.switchTo("school");
  assert.equal(AP.get().active, "school");
  assert.deepEqual(areas.sync, { Theme: { Theme: "light" }, tabLimit: 4 });
});

test("an unshared category is per profile and swaps on switch", async () => {
  const { AP, areas } = boot({ sync: { Theme: { Theme: "dark" }, tabLimit: 4 } });
  await AP.ready;
  await AP.setShare("theme", false);
  // both profiles got a copy, so nothing moved yet
  assert.deepEqual(areas.sync.Theme, { Theme: "dark" });
  areas.sync.Theme = { Theme: "light" };                 // personal picks light
  await AP.switchTo("school");
  assert.deepEqual(areas.sync.Theme, { Theme: "dark" }); // school still has the copy
  assert.equal(areas.sync.tabLimit, 4, "shared Focus untouched");
  assert.equal(areas.local.__atlas_localstorage__._themeCache, "dark", "first-paint cache follows");
  areas.sync.Theme = { Theme: "system" };
  await AP.switchTo("personal");
  assert.deepEqual(areas.sync.Theme, { Theme: "light" });
  assert.equal(areas.local.__atlas_localstorage__._themeCache, "light");
  await AP.switchTo("school");
  assert.deepEqual(areas.sync.Theme, { Theme: "system" });
});

test("a new profile starts with defaults for unshared categories", async () => {
  const { AP, areas } = boot({ sync: { tabLimit: 3, managementMethod: "block", uiScale: 1.25 } });
  await AP.ready;
  await AP.setShare("focus", false);
  await AP.setShare("appearance", false);
  const p = await AP.add({ name: "Fresh" });
  await AP.switchTo(p.id);
  assert.equal(areas.sync.tabLimit, undefined);
  assert.equal(areas.sync.managementMethod, undefined);
  assert.equal(areas.sync.uiScale, undefined);
  assert.equal(areas.local.__atlas_localstorage__._scaleCache, "1");
  await AP.switchTo("personal");
  assert.equal(areas.sync.tabLimit, 3);
  assert.equal(areas.sync.uiScale, 1.25);
  assert.equal(areas.local.__atlas_localstorage__._scaleCache, "1.25");
});

test("turning sharing back on keeps the current profile's values", async () => {
  const { AP, areas } = boot({ sync: { tabLimit: 3 } });
  await AP.ready;
  await AP.setShare("focus", false);
  areas.sync.tabLimit = 5;
  await AP.setShare("focus", true);
  await AP.switchTo("school");
  assert.equal(areas.sync.tabLimit, 5);
  assert.ok(AP.get().list.every((p) => p.settings.tabLimit === undefined));
});

test("the last profile cannot be removed; removing the active one switches first", async () => {
  const { AP } = boot();
  await AP.ready;
  assert.equal(await AP.remove("personal"), true);
  assert.equal(AP.get().list.length, 1);
  assert.equal(AP.get().active, "school");
  assert.equal(await AP.remove("school"), false);
  assert.equal(AP.get().list.length, 1);
});

test("rename, label and icon edits; bad icons are dropped", async () => {
  const { AP } = boot();
  await AP.ready;
  const ok = "data:image/png;base64,iVBORw0KGgo=";
  await AP.update("school", { name: "  ", label: "Uni", icon: ok });
  let p = AP.get().list.find((q) => q.id === "school");
  assert.equal(p.name, "Profile");
  assert.equal(p.label, "Uni");
  assert.equal(p.icon, ok);
  await AP.update("school", { icon: 'x");background:url(evil)' });
  assert.equal(AP.get().list.find((q) => q.id === "school").icon, ok, "an invalid icon is ignored");
  await AP.update("school", { icon: "" });
  assert.equal(AP.get().list.find((q) => q.id === "school").icon, "", "empty clears the image");
  // a hand-edited backup cannot smuggle markup into a style attribute
  const bundle = { state: { active: "x", list: [{ id: "x", name: "X", icon: 'a");background:url(evil)' }] }, dbs: {} };
  await AP.importAll(fakeBDB({}), bundle);
  assert.equal(AP.get().list[0].icon, "");
});

test("a profile keeps a linked Google account email; anything else is dropped", async () => {
  const { AP, areas } = boot();
  await AP.ready;
  const google = (id) => clone(AP.get().list.find((q) => q.id === id).google);
  assert.equal(google("school"), null, "no account until one is linked");
  await AP.update("school", { google: { email: "  student@ksu.edu " } });
  assert.deepEqual(google("school"), { email: "student@ksu.edu" });
  assert.deepEqual(areas.local.atlasProfilesV2.list.find((q) => q.id === "school").google, { email: "student@ksu.edu" }, "saved");
  await AP.update("school", { google: { email: "not an email" } });
  assert.deepEqual(google("school"), { email: "student@ksu.edu" }, "an invalid email is ignored");
  await AP.update("school", { google: null });
  assert.equal(google("school"), null, "null unlinks");
  const bundle = { state: { active: "x", list: [
    { id: "x", name: "X", google: { email: "a@b.co" } },
    { id: "y", name: "Y", google: { email: '"><img src=x>' } }] }, dbs: {} };
  await AP.importAll(fakeBDB({}), bundle);
  assert.deepEqual(google("x"), { email: "a@b.co" }, "a backup keeps it");
  assert.equal(google("y"), null, "a hand-edited backup can't smuggle markup in");
});

test("per-profile bookmarks: the current profile keeps the main database", async () => {
  const { AP } = boot();
  await AP.ready;
  assert.equal(AP.dbName(), "DetractlessBookmarks");
  await AP.switchTo("school");
  await AP.setShare("bookmarks", false);
  assert.equal(AP.dbName(), "DetractlessBookmarks", "school (current) keeps the data");
  await AP.switchTo("personal");
  assert.match(AP.dbName(), /^DetractlessBookmarks-personal$/);
  const p = await AP.add({ name: "Third" });
  assert.equal(AP.get().list.find((q) => q.id === p.id).db, "DetractlessBookmarks-" + p.id);
  await AP.setShare("bookmarks", true);
  assert.equal(AP.dbName(), "DetractlessBookmarks");
});

test("backup round trip restores every profile, its settings, share toggles and databases", async () => {
  const src = boot({ sync: { Theme: { Theme: "dark" }, tabLimit: 2, activeTabs: [{ id: 1 }] } });
  await src.AP.ready;
  await src.AP.setShare("theme", false);
  await src.AP.setShare("bookmarks", false);
  src.areas.sync.Theme = { Theme: "light" };
  await src.AP.update("school", { name: "School!", label: "Uni" });
  const dbs = { DetractlessBookmarks: { page1: ["a"] }, "DetractlessBookmarks-school": { page1: ["b"], page2: ["c"] } };
  const bundle = clone(await src.AP.exportAll(fakeBDB(dbs)));
  assert.equal(bundle.state.list.find((p) => p.id === "personal").settings.Theme.Theme, "light", "live values are captured");
  assert.deepEqual(Object.keys(bundle.dbs).sort(), ["personal", "school"]);

  const dst = boot();
  await dst.AP.ready;
  const dstDbs = {};
  const bdb = fakeBDB(dstDbs);
  await dst.AP.importAll(bdb, bundle);
  const s = dst.AP.get();
  assert.deepEqual(s.list.map((p) => p.name), ["Christian Darby-Ward", "School!"]);
  assert.equal(s.list[1].label, "Uni");
  assert.equal(s.share.theme, false);
  assert.equal(s.share.bookmarks, false);
  assert.deepEqual(dstDbs["DetractlessBookmarks-school"], { page1: ["b"], page2: ["c"] });
  assert.deepEqual(dstDbs.DetractlessBookmarks, { page1: ["a"] });
  assert.equal(bdb.db, null, "open connection is dropped so the next call reopens the right database");
});

test("reset helper lists every database", async () => {
  const { AP } = boot();
  await AP.ready;
  await AP.setShare("bookmarks", false);
  assert.deepEqual(AP.allDbNames().sort(), ["DetractlessBookmarks", "DetractlessBookmarks-school"]);
});

test("a switch in one context is seen by another through storage events", async () => {
  const { AP } = boot();
  await AP.ready;
  const seen = [];
  AP.onChange((next, prev) => seen.push([prev && prev.active, next.active]));
  await AP.switchTo("school");
  assert.ok(seen.some(([, n]) => n === "school"));
});
