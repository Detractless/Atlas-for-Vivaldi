// The browser restyling (payload/css-mods) takes its colours and sizes from
// --atlas-* tokens. Every token a stylesheet uses without a fallback must be
// defined somewhere in css-mods, or the rule silently does nothing.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const DIR = path.join(__dirname, "..", "..", "payload", "css-mods");
const sheets = fs.readdirSync(DIR).filter((f) => f.endsWith(".css")).sort();
const text = Object.fromEntries(sheets.map((f) => [f, fs.readFileSync(path.join(DIR, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "")]));

test("00-tokens.css defines the --atlas-* tokens", () => {
  const defined = new Set([...text["00-tokens.css"].matchAll(/(--atlas-[\w-]+)\s*:/g)].map((m) => m[1]));
  assert.ok(defined.size >= 15, `only ${defined.size} tokens`);
});

test("no stylesheet uses an --atlas-* token that nothing defines", () => {
  const defined = new Set(sheets.flatMap((f) => [...text[f].matchAll(/(--atlas-[\w-]+)\s*:/g)].map((m) => m[1])));
  const missing = [];
  for (const f of sheets) {
    for (const m of text[f].matchAll(/var\(\s*(--atlas-[\w-]+)\s*(,)?/g)) {
      if (!m[2] && !defined.has(m[1])) missing.push(`${f}: ${m[1]}`);
    }
  }
  assert.deepEqual([...new Set(missing)], []);
});
