// Usage totals: the rules (utils/usageLog.js) and the service worker that keeps them
// (background/usageLog.js, answering { action: "recordUsage" } from the page script).
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const esbuild = require("esbuild");

const SRC = path.join(__dirname, "..", "..", "payload", "detractless", "src");
function load(rel) {
  const out = esbuild.buildSync({ entryPoints: [path.join(SRC, rel)], bundle: true, format: "cjs", platform: "node", write: false }).outputFiles[0].text;
  const m = { exports: {} };
  new Function("module", "exports", "require", out)(m, m.exports, require);
  return m.exports;
}
const U = load("utils/usageLog.js");
const at = (y, mo, d, h = 12) => new Date(y, mo - 1, d, h, 30).getTime();
const NOW = at(2026, 10, 15, 4);

test("hours and days are keyed in local time", () => {
  assert.equal(U.hourKey(at(2026, 10, 15, 4)), "2026-10-15T04");
  assert.equal(U.dayKey(at(2026, 1, 2, 23)), "2026-01-02");
  assert.equal(U.keyStart("2026-10-15T04"), new Date(2026, 9, 15, 4).getTime());
  assert.equal(U.keyStart("2026-10-15"), new Date(2026, 9, 15, 0).getTime());
  assert.ok(Number.isNaN(U.keyStart("nope")));
});

test("only a plain host name is accepted, with www dropped", () => {
  assert.equal(U.cleanHost("WWW.YouTube.com"), "youtube.com");
  assert.equal(U.cleanHost("old.reddit.com"), "old.reddit.com");
  for (const bad of ["", "a b.com", "https://x.com/y", "x.com/path", "a..b", "x".repeat(101), null, undefined]) assert.equal(U.cleanHost(bad), "", String(bad));
});

test("a message's numbers are made safe: known fields only, whole, positive, capped", () => {
  const d = U.cleanDelta({ visibleMs: 30000.4, clicks: -3, keys: "7", imagesSeen: 1e9, pageViews: 1, junk: 5, url: "https://x.com/secret", scrollScreens: 12.345 });
  assert.deepEqual(d, { visibleMs: 30000.4, keys: 7, imagesSeen: 2000, pageViews: 1, scrollScreens: 12.35 });
  assert.deepEqual(U.cleanDelta(null), {});
  assert.deepEqual(U.cleanDelta({ visibleMs: NaN }), {});
  assert.equal(U.hasUsage({}), false);
  assert.equal(U.hasUsage({ clicks: 1 }), true);
});

test("deltas add up per site and per hour", () => {
  let s = U.addUsage(null, "youtube.com", { visibleMs: 30000, imagesSeen: 4, pageViews: 1 }, NOW);
  s = U.addUsage(s, "youtube.com", { visibleMs: 20000, imagesSeen: 2 }, NOW + 60000);
  s = U.addUsage(s, "reddit.com", { visibleMs: 5000, clicks: 2 }, NOW);
  s = U.addUsage(s, "youtube.com", { visibleMs: 1000 }, NOW + 3600000);
  assert.equal(s.hours["2026-10-15T04"]["youtube.com"].visibleMs, 50000);
  assert.equal(s.hours["2026-10-15T04"]["youtube.com"].imagesSeen, 6);
  assert.equal(s.hours["2026-10-15T04"]["reddit.com"].clicks, 2);
  assert.equal(s.hours["2026-10-15T05"]["youtube.com"].visibleMs, 1000, "the next hour is its own bucket");
  assert.equal(s.v, 1);
});

test("hours older than 14 days fold into days; days older than 180 are dropped", () => {
  let s = U.addUsage(null, "a.com", { visibleMs: 1000 }, at(2026, 9, 20, 10));
  s = U.addUsage(s, "a.com", { visibleMs: 2000 }, at(2026, 9, 20, 11));
  s = U.addUsage(s, "b.com", { visibleMs: 500 }, at(2026, 9, 20, 11));
  s = U.addUsage(s, "a.com", { visibleMs: 7 }, at(2026, 10, 15, 4));   // 25 days later: the old hours fold
  assert.deepEqual(Object.keys(s.hours), ["2026-10-15T04"]);
  assert.equal(s.days["2026-09-20"]["a.com"].visibleMs, 3000, "two hours folded into the day");
  assert.equal(s.days["2026-09-20"]["b.com"].visibleMs, 500);
  s = U.addUsage(s, "a.com", { visibleMs: 1 }, at(2027, 5, 1, 4));    // 200+ days later
  assert.ok(!("2026-09-20" in s.days), "old days are dropped");
});

test("summaries cover the last N days, today counting as one, biggest first", () => {
  let s = null;
  s = U.addUsage(s, "youtube.com", { visibleMs: 600000, handsOnMs: 60000, imagesSeen: 30, pageViews: 6, scrollScreens: 40, scrollMs: 120000 }, NOW);
  s = U.addUsage(s, "docs.google.com", { visibleMs: 1200000, handsOnMs: 900000 }, NOW - 2 * 86400000);
  s = U.addUsage(s, "old.example.com", { visibleMs: 9999999 }, NOW - 20 * 86400000);
  const today = U.summarize(s, { days: 1, now: NOW });
  assert.deepEqual(today.sites.map((x) => x.host), ["youtube.com"]);
  const week = U.summarize(s, { days: 7, now: NOW });
  assert.deepEqual(week.sites.map((x) => x.host), ["docs.google.com", "youtube.com"], "most time first");
  assert.equal(week.total.visibleMs, 1800000);
  const month = U.summarize(s, { days: 30, now: NOW });
  assert.equal(month.sites[0].host, "old.example.com");
  assert.deepEqual(U.summarize(null, { days: 7, now: NOW }).sites, []);
});

test("the numbers worth reading are worked out from the totals", () => {
  const d = U.derived({ visibleMs: 600000, handsOnMs: 150000, imagesSeen: 30, scrollScreens: 40, scrollMs: 120000, mediaFrontMs: 60000, mediaBackMs: 30000 });
  assert.equal(d.handsOnShare, 0.25);
  assert.equal(d.imagesPerMin, 3);
  assert.equal(d.screensPerMin, 20);
  assert.equal(d.mediaMs, 90000);
  assert.equal(U.derived({ visibleMs: 0, handsOnMs: 0, imagesSeen: 0, scrollScreens: 0, scrollMs: 0, mediaFrontMs: 0, mediaBackMs: 0 }).handsOnShare, 0);
  assert.equal(U.clock(11_520_000), "3h 12m");
  assert.equal(U.clock(2_700_000), "45m");
  assert.equal(U.clock(20_000), "20s");
});
