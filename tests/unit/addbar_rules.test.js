// The address bar's Add flow runs in the browser window, which cannot import the new tab's modules, so it
// holds copies of two rules: how long a page subtitle may be, and the name of the "+ New group" choice.
// These checks fail if the copies drift from the originals.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const esbuild = require("esbuild");

const ROOT = path.join(__dirname, "..", "..");
const SRC = path.join(ROOT, "payload", "detractless", "src");
function load(rel) {
  const out = esbuild.buildSync({ entryPoints: [path.join(SRC, rel)], bundle: true, format: "cjs", platform: "node", write: false }).outputFiles[0].text;
  const m = { exports: {} };
  new Function("module", "exports", "require", out)(m, m.exports, require);
  return m.exports;
}
const core = fs.readFileSync(path.join(ROOT, "src", "modules", "23-addbar-core.js"), "utf8");
const num = (name) => Number(new RegExp(`${name} = (\\d+)`).exec(core)[1]);
const str = (name) => new RegExp(`var ${name} = '([^']*)'`).exec(core)[1];

test("the window's copy of the subtitle rule gives the same answers as services/pageSubtitle.js", () => {
  const original = load("services/pageSubtitle.js");
  assert.deepEqual([num("AB_SUB_MIN"), num("AB_SUB_MAX"), num("AB_SUB_CHARS")], [original.MIN_WORDS, original.MAX_WORDS, original.MAX_CHARS]);
  // Run the window's own function against the original on a spread of subtitles.
  const withVars = new Function("AB_SUB_MIN", "AB_SUB_MAX", "AB_SUB_CHARS",
    `${core.slice(core.indexOf("function abSubCount"), core.indexOf("function abFresh"))}\nreturn abSubProblem;`)(num("AB_SUB_MIN"), num("AB_SUB_MAX"), num("AB_SUB_CHARS"));
  for (const text of ["", "one", "two words", "three little words", "five words in a row here", "six words in a row right here", "x".repeat(40), "a   b   c", "  spaced   out   subtitle  ", "word ".repeat(3) + "y".repeat(30)]) {
    assert.equal(withVars(text), original.subtitleProblem(text), JSON.stringify(text));
  }
});

test("the window's '+ New group' choice is named as in utils/addBookmarkFlow.js", () => {
  assert.equal(str("AB_NEW_GROUP"), load("utils/addBookmarkFlow.js").NEW_GROUP);
});
