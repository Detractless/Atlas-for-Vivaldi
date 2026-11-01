"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const { pathToFileURL } = require("url");

const ROOT = path.resolve(__dirname, "..", "..");
const modPromise = import(pathToFileURL(path.join(ROOT, "scripts", "nsfw_eval_metrics.mjs")).href);

const ITEMS = [
  { label: "benign", score: 0.1 },
  { label: "benign", score: 0.4 },
  { label: "benign", score: 0.9 },
  { label: "leak", score: 0.8 },
  { label: "leak", score: 0.5 },
  { label: "leak", score: 0.2 },
];

test("percentile uses nearest rank", async () => {
  const { percentile } = await modPromise;
  assert.equal(percentile([10, 20, 30, 40], 50), 20);
  assert.equal(percentile([10, 20, 30, 40], 95), 40);
  assert.equal(percentile([10, 20, 30, 40], 100), 40);
  assert.equal(percentile([10, 20, 30, 40], 1), 10);
  assert.equal(percentile([], 50), 0);
});

test("catch and false-block rates count what crosses the threshold", async () => {
  const { catchRate, falseBlockRate } = await modPromise;
  assert.equal(catchRate(ITEMS, 0.5), 2 / 3);
  assert.equal(falseBlockRate(ITEMS, 0.5), 1 / 3);
  assert.equal(catchRate(ITEMS, 0.9), 0);
  assert.equal(falseBlockRate(ITEMS, 0.9), 1 / 3);
  assert.equal(catchRate([], 0.5), 0);
  assert.equal(falseBlockRate([], 0.5), 0);
});

test("matchedFp finds the lowest threshold inside the false-block budget", async () => {
  const { matchedFp } = await modPromise;
  const best = matchedFp(ITEMS, 1 / 3);
  assert.equal(best.threshold, 0.401);
  assert.ok(Math.abs(best.catch - 2 / 3) < 1e-9);
  const strict = matchedFp(ITEMS, 0);
  assert.equal(strict.threshold, 0.901);
  assert.equal(strict.catch, 0);
  const loose = matchedFp(ITEMS, 1);
  assert.equal(loose.threshold, 0);
  assert.equal(loose.catch, 1);
});

test("summarize is deterministic and complete", async () => {
  const { summarize } = await modPromise;
  const items = ITEMS.map((it, i) => ({ ...it, ms: (i + 1) * 10 }));
  const a = summarize(items);
  const b = summarize(items);
  assert.deepEqual(a, b);
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  assert.deepEqual(a.counts, { benign: 3, leak: 3, total: 6 });
  assert.deepEqual(a.latency, { p50: 30, p95: 60 });
  assert.equal(a.matchedFp.maxFp, 0.02);
  assert.equal(a.matchedFp.threshold, 0.901);
  assert.equal(a.matchedFp.catch, 0);
  assert.equal(a.points["0.50"].catch, 0.6667);
  assert.equal(a.points["0.50"].falseBlock, 0.3333);
  assert.equal(Object.keys(a.points).length, 5);
});

test("summarize tolerates missing latencies", async () => {
  const { summarize } = await modPromise;
  const s = summarize([{ label: "benign", score: 0.2 }]);
  assert.equal(s.latency.p50, 0);
  assert.equal(s.counts.total, 1);
});

test("softmax and explicitScore behave on the harness side", async () => {
  const harness = await import(pathToFileURL(path.join(ROOT, "scripts", "nsfw_eval.mjs")).href).catch(() => null);
  if (!harness) return;
  const { softmax, explicitScore, toTensor } = harness;
  const probs = softmax([1, 1]);
  assert.deepEqual(probs, [0.5, 0.5]);
  assert.ok(Math.abs(explicitScore([0, 0, 0, 0], [2, 3]) - 0.5) < 1e-9);
  const skewed = softmax([1, 1, 0, 0]);
  assert.ok(Math.abs(explicitScore([1, 1, 0, 0], [2, 3]) - (skewed[2] + skewed[3])) < 1e-12);
  const t = toTensor(Buffer.from([255, 0, 128]), 1, [0.5, 0.5, 0.5], [0.5, 0.5, 0.5]);
  assert.equal(t.length, 3);
  assert.ok(Math.abs(t[0] - 1) < 1e-6);
  assert.ok(Math.abs(t[1] + 1) < 1e-6);
});
