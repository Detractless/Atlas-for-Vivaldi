// The shipped bundles in payload/detractless/src/dist must be exactly what
// scripts/build.mjs makes from payload/detractless/src. A hand edit to dist, or a
// source edit without `npm run build`, fails here.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { pathToFileURL } = require("url");

const ROOT = path.resolve(__dirname, "..", "..");

test("dist matches a fresh build of src", async () => {
  const { build, DIST } = await import(pathToFileURL(path.join(ROOT, "scripts", "build.mjs")).href);
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-build-"));
  try {
    const files = await build(out);
    assert.ok(files.length >= 5, "all bundles built");
    for (const file of files) {
      const name = path.basename(file);
      const shipped = path.join(DIST, name);
      assert.ok(fs.existsSync(shipped), `${name} is in dist`);
      assert.ok(
        fs.readFileSync(file).equals(fs.readFileSync(shipped)),
        `${name} differs from a fresh build: run npm run build`
      );
    }
    const extra = fs.readdirSync(DIST).filter((n) => !files.some((f) => path.basename(f) === n));
    assert.deepEqual(extra, [], "dist holds only generated bundles");
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test("atlas.js and atlas-spelling.js match a fresh bundle of src/modules", () => {
  const { execFileSync } = require("child_process");
  // --check builds into a temp folder and compares; it never writes to the payload.
  execFileSync("python3", ["scripts/bundle.py", "--check"], { cwd: ROOT, stdio: "pipe" });
});
