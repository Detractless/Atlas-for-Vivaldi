"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const { pathToFileURL } = require("url");

const ROOT = path.resolve(__dirname, "..", "..");
const modPromise = import(pathToFileURL(path.join(ROOT, "scripts", "nsfw_eval_fetch.mjs")).href);

test("slug sanitizes category and file titles", async () => {
  const { slug } = await modPromise;
  assert.equal(slug("Foo bar baz"), "Foo-bar-baz");
  assert.equal(slug("A/B: c?d"), "A-B-c-d");
  assert.equal(slug("---x---"), "x");
  assert.equal(slug(""), "image");
  assert.equal(slug("x".repeat(300), 12).length, 12);
});

test("imageName builds a safe manifest path", async () => {
  const { imageName } = await modPromise;
  const p = imageName("leak", "Nude paintings", "File:Some Nude (painting)!!.jpg", "jpg");
  assert.match(p, /^leak\/Nude-paintings-[A-Za-z0-9-]+\.jpg$/);
  assert.ok(p.length <= 160);
  assert.equal(imageName("benign", "Beaches", "x", "png"), imageName("benign", "Beaches", "x", "png"));
  const long = imageName("benign", "Beaches", "t".repeat(400), "webp");
  assert.ok(long.length <= 160);
  assert.ok(long.startsWith("benign/Beaches-"));
});
