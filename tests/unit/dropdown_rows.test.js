// Drop-down lists: the chosen row shows only its tick, and only the row under the mouse goes grey.
// A grey chosen row beside a hovered row put two highlighted rows on screen at once.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "..");
const LISTS = [
  ["the address bar's Add flow", "payload/css-mods/08-addbar.css", ".atlas-addrow"],
  ["the new tab's add popup", "payload/detractless/src/components/addPopup/addPopup.css", ".ap-dd-item"],
];

for (const [name, file, row] of LISTS) {
  test(`${name}: the chosen row is not given the hover background`, () => {
    const css = fs.readFileSync(path.join(ROOT, file), "utf8");
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selector: m[1].trim(), body: m[2] }));
    const chosen = rules.filter((r) => r.selector.includes(row) && /aria-selected/.test(r.selector) && /background\s*:/.test(r.body));
    assert.deepEqual(chosen.map((r) => r.selector), [], "a chosen row must have only its tick");
    assert.ok(rules.some((r) => r.selector.split(",").some((s) => s.trim().endsWith(row + ":hover"))), "the row under the mouse still goes grey");
  });
}
