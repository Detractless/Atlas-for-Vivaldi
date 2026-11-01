// The pictures in the card under a social media filter chip (constants/socialSlides.js, assets/social/): every slide's
// file exists and is installed, every picture is used, every slide belongs to a part of the filter, and the sites a part
// says it is planned for are the ones its slides show.
// The card around them: settings_social_filter.test.js. Bundled to CommonJS and run as plain code.
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

const { SLIDES, SLIDE_DIR, slidesOf } = load("constants/socialSlides.js");
const { PART_IDS, partOf } = load("utils/socialFilter.js");
const dir = path.join(SRC, "assets", "social");

test("every slide is for a real part, names its site, and points at a picture that is there", () => {
  for (const [id, slides] of Object.entries(SLIDES)) {
    assert.ok(PART_IDS.includes(id), `${id} is a part of the filter`);
    assert.ok(slides.length > 0, `${id} has slides`);
    for (const s of slides) {
      assert.ok(s.site, `${id}: a slide names its site`);
      assert.ok(fs.existsSync(path.join(dir, s.img + ".jpg")), `${id}: ${s.img}.jpg is in assets/social`);
      assert.equal(s.img, `${id}-${s.site.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`, `${id}: the file is named <part>-<site>`);
      assert.ok(partOf(id).sites.includes(s.site.split(" ")[0]), `${id}: ${s.site} is among the sites the part is planned for`);
    }
  }
});

test("only New-posts banners has no picture yet, and no picture sits unused", () => {
  assert.deepEqual(PART_IDS.filter((id) => !slidesOf(id).length), ["newPosts"]);
  assert.deepEqual(slidesOf("nope"), []);
  const used = new Set(Object.values(SLIDES).flat().map((s) => s.img + ".jpg"));
  assert.deepEqual(fs.readdirSync(dir).filter((f) => !used.has(f)), [], "every file in assets/social is on a slide");
});

test("every picture is the same 16:10 shape, so the card never jumps between slides", () => {
  const sharp = require("sharp");
  return Promise.all(fs.readdirSync(dir).map(async (f) => {
    const m = await sharp(path.join(dir, f)).metadata();
    assert.equal(m.width / m.height, 1.6, `${f} is ${m.width}x${m.height}`);
  }));
});

test("the pictures are installed with the new tab, and stay small enough to be", () => {
  assert.equal(SLIDE_DIR, "src/assets/social/");
  assert.match(fs.readFileSync(path.join(ROOT, "installer", "files.py"), "utf8"), /DETRACTLESS_DIRS = \([^)]*"src\/assets"/, "install.py copies src/assets");
  const bytes = fs.readdirSync(dir).reduce((n, f) => n + fs.statSync(path.join(dir, f)).size, 0);
  assert.ok(bytes < 2.5 * 1024 * 1024, `the pictures are ${(bytes / 1048576).toFixed(1)} MB`);
});
