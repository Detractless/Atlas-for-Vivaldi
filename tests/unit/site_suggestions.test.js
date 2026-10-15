// The sites offered when you type a website to bookmark come from your browser history.
// chrome.history.search hands back the newest pages first and stops at maxResults, so a small
// limit once hid every site you had not opened in the last few days.
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
const { loadSites, matchSites } = load("services/siteSuggestions.js");

// A history like Chrome's: one entry per address, newest first, cut off at maxResults.
function fakeHistory(entries) {
  const sorted = entries.slice().sort((a, b) => b.lastVisitTime - a.lastVisitTime);
  globalThis.chrome = { runtime: {}, history: { search: (q, cb) => cb(sorted.slice(0, q.maxResults || 100)) } };
}

test("a site you visited long ago, behind thousands of newer pages, is still offered", async () => {
  const recent = [];
  for (let i = 0; i < 5000; i++) recent.push({ url: `https://news${i % 40}.example.com/story/${i}`, visitCount: 1, lastVisitTime: 2e12 - i });
  fakeHistory([...recent, { url: "https://discord.com/channels/1", visitCount: 59, lastVisitTime: 1e12 }]);
  const sites = await loadSites();
  assert.deepEqual(matchSites(sites, "dis").map((s) => s.domain), ["discord.com"]);
});

test("the sites you open most come first", async () => {
  fakeHistory([
    { url: "https://mega.nz/folder/a", visitCount: 210, lastVisitTime: 5 },
    { url: "https://mega.nz/folder/b", visitCount: 10, lastVisitTime: 6 },
    { url: "https://music.example.org/", visitCount: 3, lastVisitTime: 9 },
    { url: "https://megabank.com/", visitCount: 40, lastVisitTime: 7 },
  ]);
  assert.deepEqual(matchSites(await loadSites(), "mega").map((s) => s.domain), ["mega.nz", "megabank.com"]);
});
