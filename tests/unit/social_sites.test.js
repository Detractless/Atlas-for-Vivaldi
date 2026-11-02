// The social media filter's site tables (components/atlas/atlas-social-<site>.js): their shape, the safety lint
// that keeps a selector from hiding more than its part, and the contract with what Settings promises.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { JSDOM } = require("jsdom");
const { DIR, ROOT } = require("../helpers/social_env");

const SF = path.join(ROOT, "payload", "detractless", "src", "utils", "socialFilter.js");
const REGISTER = path.join(ROOT, "src", "modules", "03-bridge-content-scripts.js");
const PART_KEYS = new Set(["css", "on", "hide", "maxArea", "maxMatches", "redirect", "act", "shadow", "english"]);
const TABLE_KEYS = new Set(["key", "name", "live", "hosts", "route", "landmarks", "smoke", "parts", "todo", "settle"]);
const is = (v, tag) => Object.prototype.toString.call(v) === `[object ${tag}]`;

/** Run a site file with a stand-in engine and return the table it hands to run(). */
function loadTable(key) {
  let table = null;
  const sandbox = { window: { __atlasSocial: { run: (t) => { table = t; return null; } } } };
  vm.runInNewContext(fs.readFileSync(path.join(DIR, `atlas-social-${key}.js`), "utf8"), sandbox);
  return table;
}

/** Split a selector at top-level commas (not inside brackets, parentheses or quotes). */
function topLevelCommas(sel) {
  let depth = 0, quote = "", n = 0;
  for (const ch of sel) {
    if (quote) { if (ch === quote) quote = ""; continue; }
    if (ch === '"' || ch === "'") quote = ch;
    else if ("([".includes(ch)) depth++;
    else if (")]".includes(ch)) depth--;
    else if (ch === "," && depth === 0) n++;
  }
  return n;
}

const TOO_BROAD = new Set(["html", "body", "main", "header", "footer", "nav", "aside", "section", "article", "div", "span",
  "a", "button", "ul", "li", "img", "video", "form", "input", "*", ":root", '[role="main"]', "[role=main]"]);
const PROCEDURAL = /:(contains|has-text|-abp-[a-z-]+|xpath|matches-path|upward|nth-ancestor|min-text-length|watch-attr|remove)\(|\+js\(|##/;
const ENGLISH = /\[\s*(aria-label|title|alt|placeholder|aria-description|data-tooltip|aria-roledescription)\s*[~|^$*]?=\s*["'][^"']*[A-Za-z]{3,}/i;

/** What is wrong with one selector, as a list of reasons (empty when it is fine). */
function problems(sel, table, part, scoped) {
  const out = [];
  const s = String(sel).trim();
  if (!s || s.length > 400) out.push("empty or very long");
  if (topLevelCommas(s)) out.push("a comma: give each selector its own entry");
  if (TOO_BROAD.has(s) || /^[a-z]+$/.test(s)) out.push("too broad");
  if (/^(html|body|:root)(?![\w-])/.test(s)) out.push("starts at the page root");
  if (PROCEDURAL.test(s)) out.push("uBlock-only syntax, not CSS");
  if (/\[\s*(src|srcset)\b/.test(s)) out.push("depends on an attribute the offline snapshots strip");
  if (ENGLISH.test(s) && part.english !== true) out.push("matches English text: mark the part english: true, or find another hook");
  if ((table.landmarks || []).some((l) => l.sel === s)) out.push("is a landmark");
  if ((table.smoke || []).includes(s)) out.push("is a smoke selector");
  // Structure only (no attribute, id, class or custom element outside :has()/:not()): it would match on any page, so it must name its pages.
  const outside = s.replace(/:(has|not|is|where)\((?:[^()]|\([^()]*\))*\)/g, "");
  if (!scoped && !/[\[#.]|[a-z]+-[a-z0-9-]+/.test(outside)) out.push("structure only: give it a route scope (on: [...])");
  try { new JSDOM("").window.document.querySelector(s); } catch (e) { out.push("not a valid selector"); }
  return out;
}

test("every site has a table that follows the format", async () => {
  const { SITES: sites, PART_IDS } = await import(SF);
  for (const site of sites) {
    const t = loadTable(site.key);
    assert.ok(t, `${site.key}: the file did not call run()`);
    assert.deepEqual(Object.keys(t).filter((k) => !TABLE_KEYS.has(k)), [], `${site.key}: unknown table keys`);
    if (t.settle) assert.ok(Array.isArray(t.settle.events) && t.settle.events.length && t.settle.events.every((e) => typeof e === "string" && e), `${site.key}: settle.events is a list of event names`);
    assert.equal(t.key, site.key);
    assert.equal(t.name, site.name);
    assert.deepEqual(Array.from(t.hosts), site.hosts, `${site.key}: hosts differ from utils/socialFilter.js SITES`);
    assert.equal(typeof t.live, "boolean");
    assert.equal(typeof t.route, "function");
    assert.ok(Array.isArray(t.landmarks) && t.landmarks.length > 0, `${site.key}: needs landmarks`);
    for (const l of t.landmarks) assert.equal(typeof l.sel, "string");
    assert.ok(Array.isArray(t.smoke), `${site.key}: smoke is a list`);
    for (const [id, part] of Object.entries(t.parts)) {
      assert.ok(PART_IDS.includes(id), `${site.key}: ${id} is not a part`);
      assert.deepEqual(Object.keys(part).filter((k) => !PART_KEYS.has(k)), [], `${site.key}.${id}: unknown keys`);
      assert.ok((part.css && part.css.length) || part.redirect || part.act || part.shadow, `${site.key}.${id}: does nothing`);
      for (const rule of part.shadow || []) {
        assert.match(rule.host, /^[a-z]+-[a-z0-9-]+$/, `${site.key}.${id}: a shadow host is a custom element name`);
        assert.ok(Array.isArray(rule.css) && rule.css.length, `${site.key}.${id}: shadow rule has css`);
      }
      if (part.redirect) {
        assert.ok(is(part.redirect.from, "RegExp"), `${site.key}.${id}: redirect.from is a RegExp`);
        assert.match(part.redirect.to, /^\//, `${site.key}.${id}: redirect.to is a path on the site`);
      }
    }
    for (const id of t.todo || []) {
      assert.ok(PART_IDS.includes(id) && !t.parts[id], `${site.key}: todo ${id} is a known part not yet built`);
    }
  }
});

test("safety lint: no selector can hide more than its part", async () => {
  const { SITES: sites } = await import(SF);
  const found = [];
  for (const site of sites) {
    const t = loadTable(site.key);
    for (const l of t.landmarks) { try { new JSDOM("").window.document.querySelector(l.sel); } catch (e) { found.push(`${site.key} landmark ${l.sel}: not valid`); } }
    for (const [id, part] of Object.entries(t.parts)) {
      for (const c of part.css || []) {
        const sel = typeof c === "string" ? c : c.sel;
        const scoped = !!(typeof c === "string" ? part.on : c.on || part.on);
        for (const why of problems(sel, t, part, scoped)) found.push(`${site.key}.${id} ${JSON.stringify(sel)}: ${why}`);
      }
      for (const rule of part.shadow || []) {
        for (const sel of rule.css) for (const why of problems(sel, t, part, !!rule.on)) found.push(`${site.key}.${id} shadow ${rule.host} ${JSON.stringify(sel)}: ${why}`);
      }
      assert.ok((part.css || []).length <= 60, `${site.key}.${id}: more than 60 selectors`);
    }
  }
  assert.deepEqual(found, []);
});

test("a redirect never sends a page to an address another redirect sends away", async () => {
  const { SITES: sites } = await import(SF);
  for (const site of sites) {
    const t = loadTable(site.key);
    const redirects = Object.entries(t.parts).filter(([, p]) => p.redirect);
    for (const [id, p] of redirects) {
      for (const [other, q] of redirects) {
        assert.equal(q.redirect.from.test(p.redirect.to), false, `${site.key}: ${id} sends to a path that ${other} sends away`);
      }
    }
  }
});

test("contract: every part Settings says works on a site has a table entry, or an acknowledged todo", async () => {
  const { SITES: sites, PARTS } = await import(SF);
  const names = new Set(sites.map((s) => s.name));
  const missing = [];
  for (const part of PARTS) {
    for (const siteName of part.sites) {
      assert.ok(names.has(siteName), `${part.id}: "${siteName}" is not a known site`);
      const t = loadTable(sites.find((s) => s.name === siteName).key);
      if (!t.parts[part.id] && !(t.todo || []).includes(part.id)) missing.push(`${siteName}/${part.id}`);
    }
  }
  assert.deepEqual(missing, [], "Settings promises these pairs, but the site table neither builds nor lists them as todo");
});

test("LIVE_SITES lists exactly the sites whose table says live: true", async () => {
  const { SITES: sites, LIVE_SITES, partsLive } = await import(SF);
  const live = sites.filter((s) => loadTable(s.key).live).map((s) => s.name);
  assert.deepEqual([...LIVE_SITES].sort(), live.sort());
  assert.equal(partsLive(), LIVE_SITES.length === 0 ? "none" : LIVE_SITES.length === sites.length ? "all" : "some");
});

test("registration: every site's page scripts are registered for its hosts", async () => {
  const { SITES: sites } = await import(SF);
  const code = fs.readFileSync(REGISTER, "utf8");
  for (const site of sites) {
    assert.ok(code.includes(`atlas-social-${site.key}.js`), `${site.key}: its table is not registered in 03-bridge-content-scripts.js`);
    for (const host of site.hosts) assert.ok(code.includes(`*://*.${host}/*`), `${site.key}: ${host} is not in its matches`);
    assert.ok(fs.existsSync(path.join(DIR, `atlas-social-${site.key}.js`)));
  }
  for (const f of ["atlas-social-behaviors.js", "atlas-social-guard.js", "atlas-social-core.js"]) assert.ok(code.includes(f), f);
});

test("siteOf matches a site's own pages and its subdomains, not look-alikes or links", async () => {
  const { siteOf } = await import(SF);
  assert.equal(siteOf("https://www.youtube.com/watch?v=1").key, "youtube");
  assert.equal(siteOf("https://old.reddit.com/r/x").key, "reddit");
  assert.equal(siteOf("https://twitter.com/home").key, "x");
  assert.equal(siteOf("https://x.com/").key, "x");
  assert.equal(siteOf("https://notyoutube.com/"), null);
  assert.equal(siteOf("https://example.com/?u=https://youtube.com/"), null);
  assert.equal(siteOf("https://youtube.com.evil.test/"), null);
  assert.equal(siteOf("not a url"), null);
});
