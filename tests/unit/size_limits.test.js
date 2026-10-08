// Hand-written files stay under 400 lines and functions under 80
// (scripts/size_report.mjs has the counting rules). Generated files, vendored
// code and _old/ are not counted.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const { pathToFileURL } = require("url");

/* Exempt, with the reason. Keep this list short. */
const EXEMPT = {
  "payload/extensions/harper/": "a packaged extension: its files ship next to the pre-signed harper.crx, " +
    "so editing them without re-signing would make the two disagree",
};

test("no file over 400 lines and no function over 80", async () => {
  const { report } = await import(pathToFileURL(path.join(__dirname, "..", "..", "scripts", "size_report.mjs")).href);
  const over = report()
    .filter((r) => !Object.keys(EXEMPT).some((p) => r.rel.startsWith(p)))
    .map((r) => (r.kind === "function" ? `${r.rel}:${r.line} ${r.name || "(anonymous)"} ${r.lines} lines` : `${r.rel} ${r.kind} ${r.lines} lines`));
  assert.deepEqual(over, [], "split these (node scripts/size_report.mjs lists them)");
});
