"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { pathToFileURL } = require("url");

const ROOT = path.resolve(__dirname, "..", "..");
const modPromise = import(pathToFileURL(path.join(ROOT, "scripts", "nsfw_eval_manifest.mjs")).href);

function makeRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "atlas-eval-"));
}

function put(root, rel, bytes = [0xff, 0xd8, 0xff, 0xe0]) {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.from(bytes));
}

function writeManifest(root, images) {
  fs.writeFileSync(path.join(root, "manifest.json"), JSON.stringify({ version: 1, images }, null, 2));
}

function withRoot(fn) {
  const root = makeRoot();
  try {
    return fn(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test("a well-formed set validates with matching stats", async () => {
  const { validateManifest } = await modPromise;
  withRoot((root) => {
    put(root, "benign/beach-01.jpg");
    put(root, "benign/gym-01.png");
    put(root, "leak/known-miss-01.jpg");
    writeManifest(root, [
      { path: "benign/beach-01.jpg", label: "benign", reason: "swimwear" },
      { path: "benign/gym-01.png", label: "benign", reason: "gym" },
      { path: "leak/known-miss-01.jpg", label: "leak", reason: "live miss" },
    ]);
    const result = validateManifest({ root });
    assert.equal(result.ok, true, result.errors.join("; "));
    assert.deepEqual(result.stats, { benign: 2, leak: 1, total: 3 });
  });
});

test("a missing manifest is reported, not thrown", async () => {
  const { validateManifest } = await modPromise;
  withRoot((root) => {
    fs.mkdirSync(path.join(root, "benign"));
    fs.mkdirSync(path.join(root, "leak"));
    const result = validateManifest({ root });
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.includes("manifest.json")), result.errors.join("; "));
  });
});

test("an image on disk that is not in the manifest fails", async () => {
  const { validateManifest } = await modPromise;
  withRoot((root) => {
    put(root, "benign/beach-01.jpg");
    put(root, "benign/unlisted.jpg");
    writeManifest(root, [{ path: "benign/beach-01.jpg", label: "benign", reason: "swimwear" }]);
    put(root, "leak/keep");
    const result = validateManifest({ root });
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.includes("image not in manifest: benign/unlisted.jpg")));
  });
});

test("a manifest entry with no file fails", async () => {
  const { validateManifest } = await modPromise;
  withRoot((root) => {
    put(root, "benign/beach-01.jpg");
    fs.mkdirSync(path.join(root, "leak"));
    writeManifest(root, [
      { path: "benign/beach-01.jpg", label: "benign", reason: "swimwear" },
      { path: "benign/gone.jpg", label: "benign", reason: "deleted" },
    ]);
    const result = validateManifest({ root });
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.includes("file missing: benign/gone.jpg")));
  });
});

test("entry problems are each reported", async () => {
  const { validateManifest } = await modPromise;
  withRoot((root) => {
    fs.mkdirSync(path.join(root, "benign"));
    fs.mkdirSync(path.join(root, "leak"));
    writeManifest(root, [
      { path: "benign/a.jpg", label: "nope", reason: "x" },
      { path: "/abs/path.jpg", label: "benign", reason: "x" },
      { path: "benign/../leak/b.jpg", label: "benign", reason: "x" },
      { path: "benign/c.jpg", label: "leak", reason: "x" },
      { path: "benign/d.jpg", label: "benign", reason: "  " },
      { path: "benign/e.txt", label: "benign", reason: "x" },
      {},
    ]);
    const result = validateManifest({ root });
    assert.equal(result.ok, false);
    const joined = result.errors.join("; ");
    assert.match(joined, /unknown label for benign\/a\.jpg: nope/);
    assert.match(joined, /relative and stay inside: \/abs\/path\.jpg/);
    assert.match(joined, /relative and stay inside: benign\/\.\.\/leak\/b\.jpg/);
    assert.match(joined, /path does not match label for benign\/c\.jpg/);
    assert.match(joined, /needs a reason: benign\/d\.jpg/);
    assert.match(joined, /not an image file: benign\/e\.txt/);
    assert.match(joined, /entry without a path/);
  });
});

test("duplicate entries fail", async () => {
  const { validateManifest } = await modPromise;
  withRoot((root) => {
    put(root, "benign/beach-01.jpg");
    fs.mkdirSync(path.join(root, "leak"));
    writeManifest(root, [
      { path: "benign/beach-01.jpg", label: "benign", reason: "a" },
      { path: "benign/beach-01.jpg", label: "benign", reason: "b" },
    ]);
    const result = validateManifest({ root });
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.includes("duplicate entry: benign/beach-01.jpg")));
  });
});

test("an eval root inside the repository fails", async () => {
  const { validateManifest } = await modPromise;
  const result = validateManifest({ root: path.join(ROOT, "scripts") });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("inside the repository")));
  const atRepo = validateManifest({ root: ROOT });
  assert.ok(atRepo.errors.some((e) => e.includes("is the repository itself")));
});

test("folder scan ignores dot files and non-images", async () => {
  const { validateManifest } = await modPromise;
  withRoot((root) => {
    put(root, "benign/beach-01.jpg");
    put(root, "benign/.DS_Store");
    put(root, "benign/notes.txt");
    fs.mkdirSync(path.join(root, "leak"));
    writeManifest(root, [{ path: "benign/beach-01.jpg", label: "benign", reason: "swimwear" }]);
    const result = validateManifest({ root });
    assert.equal(result.ok, true, result.errors.join("; "));
  });
});
