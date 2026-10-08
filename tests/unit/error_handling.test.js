// No silent failures: a JS `catch {}`, a `.catch(() => {})` or a Python
// `except: pass` must either
// report the error or carry a comment saying why ignoring it is right.
// Not checked: generated files (dist/, atlas.js, atlas-spelling.js), vendored
// code, _old/, tests, and the Harper extension (a separate extension).
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const acorn = require("acorn");
const walk = require("acorn-walk");

const ROOT = path.resolve(__dirname, "..", "..");
const SKIP = /(^|\/)(_old|dist|vendor|node_modules|tests)\/|^payload\/extensions\/|^payload\/install-files\/atlas\.js$|atlas-spelling\.js$/;

function files(ext) {
  return execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { cwd: ROOT, encoding: "utf8" })
    .split("\n").filter((f) => ext.test(f) && !SKIP.test(f) && fs.existsSync(path.join(ROOT, f)));
}

function silentJsCatches(rel) {
  const text = fs.readFileSync(path.join(ROOT, rel), "utf8");
  const comments = [];
  let ast = null;
  for (const sourceType of ["module", "script"]) {
    try { comments.length = 0; ast = acorn.parse(text, { ecmaVersion: "latest", sourceType, locations: true, onComment: comments }); break; } catch (e) { ast = null; }
  }
  assert.ok(ast, `${rel} parses`);
  const out = [];
  const silent = (block) => block.type === "BlockStatement" && !block.body.length &&
    !comments.some((c) => c.start >= block.start && c.end <= block.end);
  walk.simple(ast, {
    CatchClause(n) {
      if (silent(n.body)) out.push(`${rel}:${n.loc.start.line}`);
    },
    // promise.catch(() => {}) swallows just the same
    CallExpression(n) {
      const fn = n.arguments[0];
      if (n.callee.type === "MemberExpression" && n.callee.property.name === "catch" &&
          fn && /Function/.test(fn.type) && silent(fn.body)) out.push(`${rel}:${n.loc.start.line} (.catch)`);
    },
  });
  return out;
}

test("no JS catch block or .catch handler swallows an error without a reason", () => {
  const silent = files(/\.(m?js)$/).flatMap(silentJsCatches);
  assert.deepEqual(silent, [], "log it (warn / atlasWarn / console.warn) or say in a comment why it is ignored");
});

test("no Python except: pass without a reason", () => {
  const script = `
import ast, sys
for f in sys.argv[1:]:
    lines = open(f, encoding="utf-8").read().split("\\n")
    for n in ast.walk(ast.parse("\\n".join(lines))):
        if isinstance(n, ast.ExceptHandler) and len(n.body) == 1 and isinstance(n.body[0], ast.Pass):
            if "#" not in lines[n.body[0].lineno - 1] and "#" not in lines[n.lineno - 1]:
                print(f"{f}:{n.lineno}")
`;
  const out = execFileSync("python3", ["-c", script, ...files(/\.py$/)], { cwd: ROOT, encoding: "utf8" }).trim();
  assert.equal(out, "", "report the error or add a # comment saying why passing is right");
});
