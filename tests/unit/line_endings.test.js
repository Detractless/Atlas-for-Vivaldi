// Every tracked text file uses CRLF line endings, as .gitattributes says, except
// shell scripts (LF) and files marked -text (other tools own their format).
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..", "..");
const git = (...args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

test("tracked text files use the line endings .gitattributes asks for", () => {
  const files = git("ls-files", "--cached", "--others", "--exclude-standard").split("\n").filter(Boolean)
    .filter((f) => { try { return fs.statSync(path.join(ROOT, f)).isFile(); } catch (e) { return false; /* deleted since listing */ } });
  // eol/text attributes for every file in one call: "path: attr: value" lines.
  const attrs = {};
  for (const line of execFileSync("git", ["check-attr", "--stdin", "text", "eol"], { cwd: ROOT, input: files.join("\n"), encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).split("\n")) {
    const m = /^(.*): (text|eol): (.*)$/.exec(line);
    if (m) (attrs[m[1]] = attrs[m[1]] || {})[m[2]] = m[3];
  }
  const wrong = [];
  for (const f of files) {
    const a = attrs[f] || {};
    if (a.text === "unset") continue;
    const data = fs.readFileSync(path.join(ROOT, f));
    if (data.includes(0)) continue; // binary
    const text = data.toString("latin1");
    const lf = (text.match(/(?<!\r)\n/g) || []).length;
    const crlf = (text.match(/\r\n/g) || []).length;
    if (a.eol === "lf" ? crlf > 0 : lf > 0) wrong.push(`${f} (${a.eol === "lf" ? "wants LF" : "wants CRLF"})`);
  }
  assert.deepEqual(wrong, [], "run python3 scripts/to_crlf.py on these");
});
