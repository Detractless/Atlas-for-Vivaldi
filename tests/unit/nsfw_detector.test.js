"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { loadBridge, OFFSCREEN_PATH, OFFSCREEN_HTML_PATH, GUARD_PATH } = require("../helpers/nsfw_bridge_env.js");

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test("bridge hosts the detector in an iframe when chrome.offscreen is missing", async () => {
  const env = loadBridge({
    onClassify: (n) => (n < 3 ? "retry" : { result: false, error: "[object Event]" }),
  });
  const responses = [];
  env.classify({ url: "https://encrypted-tbn0.gstatic.com/images?q=tbn:a" }, (r) => responses.push(r));

  await wait(900);

  assert.equal(responses.length, 1, "answers once, after the retries");
  assert.equal(responses[0].isNsfw, false);
  assert.equal(responses[0].error, "[object Event]", "passes the detector error through for the unknown verdict");
  assert.equal(env.frames.length, 1, "creates one hidden detector iframe");
  assert.ok(env.frames[0].src.endsWith("components/atlas/nsfw/offscreen.html"), "iframe loads the detector page");
  const sets = env.calls.filter((c) => c.type === "SET_SETTINGS");
  assert.equal(sets.length, 1, "sends settings once, not per retry");
  assert.equal(sets[0].filterThreshold, 0.889871, "uses the fixed, locally evaluated threshold");
  assert.equal(sets[0].filterStrictness, undefined, "does not forward a sensitivity preference");
  assert.ok(!env.syncReads.flat().includes("nsfwStrictness"), "the detector ignores the old saved sensitivity value");
  assert.equal(env.calls.filter((c) => c.type === "CLASSIFY").length, 3, "retries while the frame is still loading");
});

test("identical in-flight URLs share one prediction, and the score is cached", async () => {
  const env = loadBridge({ strictness: 85, onClassify: () => ({ result: true, score: 0.9 }) });
  const first = [], second = [];
  env.classify({ url: "https://example.test/one.jpg" }, (r) => first.push(r));
  env.classify({ url: "https://example.test/one.jpg" }, (r) => second.push(r));
  assert.equal(env.stats.classify, 1, "the second caller joins the first prediction");

  await wait(30);
  assert.deepEqual(first, [{ isNsfw: true, score: 0.9, source: "detector", threshold: 0.889871 }]);
  assert.deepEqual(second, [{ isNsfw: true, score: 0.9, source: "detector", threshold: 0.889871 }], "both callers get the same answer");

  const cached = [];
  env.classify({ url: "https://example.test/one.jpg" }, (r) => cached.push(r));
  assert.equal(cached.length, 1, "a cached score answers synchronously");
  assert.equal(cached[0].isNsfw, true);
  assert.equal(cached[0].score, 0.9);
  assert.equal(cached[0].source, "cache", "the answer names where the score came from");
  assert.equal(cached[0].threshold, 0.889871, "the answer carries the threshold it was judged on");
  assert.equal(env.stats.classify, 1, "no new prediction for the cached URL");
});

test("shield classifications return their own preview token and refresh cached flagged URLs", async () => {
  let predictions = 0;
  const env = loadBridge({ onClassify: () => {
    predictions++;
    return {
      result: true, score: predictions === 1 ? 0.91 : 0.88,
      shieldPreview: "data:image/webp;base64,blur", shieldWidth: 640, shieldHeight: 360,
      snapshotId: "snapshot-" + predictions,
    };
  } });
  const first = [];
  env.classify({ url: "https://example.test/flagged.jpg", shield: true, requestId: "image-one" }, (r) => first.push(r));
  await wait(30);
  assert.equal(first[0].isNsfw, true);
  assert.equal(first[0].shieldPreview, "data:image/webp;base64,blur");
  assert.equal(first[0].snapshotId, "snapshot-1");
  assert.equal(env.calls.find((call) => call.type === "CLASSIFY").shield, true);

  const second = [];
  env.classify({ url: "https://example.test/flagged.jpg", shield: true, requestId: "image-two" }, (r) => second.push(r));
  await wait(30);
  assert.equal(predictions, 2, "a cached flagged URL is reclassified against the current bytes");
  assert.equal(second[0].snapshotId, "snapshot-2", "each image receives an independent one-use retry token");
});

test("shield preparation returns the blur before classification and forwards its token for byte reuse", async () => {
  const env = loadBridge({
    onPrepare: () => ({ preparedId: "prepared-123", shieldPreview: "data:image/webp;base64,blur", shieldWidth: 640, shieldHeight: 360 }),
    onClassify: (n, message) => ({ result: true, score: 0.91, shieldPreview: "data:image/webp;base64,blur", snapshotId: "snapshot-123", preparedId: message.preparedId }),
  });
  const prepared = [];
  env.prepare({ url: "https://example.test/flagged.jpg", page: "https://example.test/", requestId: "image-one" }, (r) => prepared.push(r));
  await wait(20);
  assert.equal(prepared[0].preparedId, "prepared-123");
  assert.equal(prepared[0].shieldWidth, 640);

  const classified = [];
  env.classify({ url: "https://example.test/flagged.jpg", shield: true, requestId: "image-one", preparedId: prepared[0].preparedId }, (r) => classified.push(r));
  await wait(20);
  assert.equal(env.calls.find((call) => call.type === "CLASSIFY").preparedId, "prepared-123");
  assert.equal(classified[0].isNsfw, true);
  assert.equal(classified[0].snapshotId, "snapshot-123");
});

test("stronger retry bypasses the first-model cache, coalesces duplicate clicks, and preserves its score", async () => {
  const env = loadBridge({
    onClassify: () => ({ result: true, score: 0.91 }),
    onRetry: () => ({ stage: "strong", model: "fake-strong", isNsfw: false, score: 0.12, threshold: 0.72 }),
  });
  await new Promise((resolve) => env.classify({ url: "https://example.test/flagged.jpg" }, resolve));
  const first = [], second = [];
  env.retry({ snapshotId: "snapshot-token" }, (r) => first.push(r));
  env.retry({ snapshotId: "snapshot-token" }, (r) => second.push(r));
  await wait(30);
  assert.equal(env.stats.strong, 1);
  assert.equal(first[0].model, "fake-strong");
  assert.deepEqual(second, first);

  const cached = [];
  env.classify({ url: "https://example.test/flagged.jpg" }, (r) => cached.push(r));
  assert.equal(cached[0].score, 0.91);
  assert.equal(cached[0].source, "cache");
  assert.equal(env.stats.classify, 1, "the stronger score did not overwrite the first-model cache entry");

  let released;
  env.release({ snapshotId: "snapshot-token" }, (r) => { released = r; });
  assert.deepEqual(released, { ok: true });
  assert.equal(env.calls.some((call) => call.type === "RELEASE_SNAPSHOT" && call.snapshotId === "snapshot-token"), true);
});

test("a persisted score answers after a restart without the detector", async () => {
  const localData = {};
  const url = "https://example.test/kept.jpg";
  const first = loadBridge({ localData, onClassify: () => ({ result: true, score: 0.9 }) });
  await new Promise((resolve) => first.classify({ url }, resolve));
  first.flush();
  const saved = localData[first.storeKey];
  assert.ok(saved, "the score was written under the listed key");
  const keys = Object.keys(saved);
  assert.deepEqual(keys, [first.hash(url)], "keyed by a 16-char digest, not the URL");
  assert.equal(keys[0].length, 16);
  assert.ok(!JSON.stringify(saved).includes("example.test"), "no URL text is stored");
  assert.deepEqual(saved[keys[0]].slice(0, 1), [0.9]);
  assert.ok(Date.now() - saved[keys[0]][1] < 5000, "timestamps the score");

  const second = loadBridge({ localData, onClassify: () => { throw new Error("should not run"); } });
  const got = [];
  second.classify({ url }, (r) => got.push(r));
  assert.deepEqual(got, [{ isNsfw: true, score: 0.9, source: "cache", threshold: second.threshold() }], "answers from the persisted score");
  assert.equal(second.stats.classify, 0, "no detector call after the restart");
});

test("the persisted score map is capped and stays small", () => {
  const localData = {};
  const env = loadBridge({ localData });
  for (let i = 0; i < 5100; i++) env.cacheSet("https://example.test/photo-" + i + ".jpg", 0.5);
  env.flush();
  const saved = localData[env.storeKey];
  const keys = Object.keys(saved);
  assert.equal(keys.length, env.cacheMax, "the oldest scores are dropped at the cap");
  assert.equal(keys.length, 5000);
  assert.ok(!(env.hash("https://example.test/photo-0.jpg") in saved), "the first score was evicted");
  assert.ok(env.hash("https://example.test/photo-5099.jpg") in saved, "the newest score was kept");
  assert.ok(JSON.stringify(saved).length < 1024 * 1024, "the whole store is under 1 MB");
  assert.ok(!JSON.stringify(saved).includes("example.test"), "only digests are stored");
});

test("ephemeral data: canvases and non-web URLs never land in the persistent cache", async () => {
  const localData = {};
  const env = loadBridge({
    localData,
    onClassify: () => ({ result: true, score: 0.9 }),
  });
  env.cacheSet("data:image/jpeg;base64,AAAA", 0.9);
  env.cacheSet("blob:https://example.test/canvas-frame", 0.5);
  env.cacheSet("", 0.5);
  env.flush();
  assert.equal(localData[env.storeKey], undefined, "the store was never written");

  const frame = "data:image/jpeg;base64,BBBB";   /* what captureFrame hands back for a video */
  const got = [];
  env.classify({ url: frame }, (r) => got.push(r));
  await wait(30);
  assert.deepEqual(got, [{ isNsfw: true, score: 0.9, source: "detector", threshold: env.threshold() }], "the frame is still judged on the verdict");
  assert.equal(env.stats.classify, 1, "not from the detector yet");
  const again = [];
  env.classify({ url: frame }, (r) => again.push(r));
  await wait(30);
  assert.equal(env.stats.classify, 2, "no cache hit for a data: URL: it is re-judged, not stored");
});

test("an expired persisted score is not reused", async () => {
  const url = "https://example.test/old.jpg";
  const probe = loadBridge({ localData: {} });
  const digest = probe.hash(url);
  const localData = { [probe.storeKey]: { [digest]: [0.9, Date.now() - 8 * 24 * 60 * 60 * 1000, probe.firstVersion] } };
  const env = loadBridge({ localData, onClassify: () => ({ result: false, score: 0.1 }) });
  const got = [];
  env.classify({ url }, (r) => got.push(r));
  assert.equal(env.stats.classify, 1, "an eight-day-old score is not reused");
  await wait(30);
  assert.deepEqual(got, [{ isNsfw: false, score: 0.1, source: "detector", threshold: env.threshold() }]);
});

test("words in an address or in picture data never decide a verdict; only the detector does", async () => {
  const env = loadBridge({ onClassify: () => ({ result: false, score: 0.1 }) });
  const got = [];
  env.classify({ url: "https://example.porn/essex-adult-cover.jpg" }, (r) => got.push(r));
  env.classify({ url: "data:image/jpeg;base64,/9j/4AAQSxxxsexnudeAAA" }, (r) => got.push(r));
  await wait(30);
  assert.equal(env.stats.classify, 2, "both went to the detector");
  assert.deepEqual(got.map((r) => r.source), ["detector", "detector"], "no keyword verdicts exist");
  assert.deepEqual(got.map((r) => r.isNsfw), [false, false], "the detector's score decides");
});

test("old sensitivity values no longer change the fixed detector threshold", async () => {
  const at = (strictness) => loadBridge({ strictness, onClassify: () => ({ result: true, score: 0.3 }) });
  const oldLow = at(1), oldHigh = at(100);
  const got = [];
  oldLow.classify({ url: "https://example.test/two.jpg" }, (r) => got.push(["old 1", r]));
  oldHigh.classify({ url: "https://example.test/three.jpg" }, (r) => got.push(["old 100", r]));
  await wait(30);
  assert.deepEqual(got, [
    ["old 1", { isNsfw: false, score: 0.3, source: "detector", threshold: 0.889871 }],
    ["old 100", { isNsfw: false, score: 0.3, source: "detector", threshold: 0.889871 }],
  ]);
});

test("the one fixed threshold is the detector's evaluated operating point", () => {
  const env = loadBridge();
  assert.equal(env.threshold(), 0.889871);
  assert.equal(env.threshold(1), env.threshold(100), "arguments cannot create another sensitivity mode");
  const code = fs.readFileSync(OFFSCREEN_PATH, "utf8");
  assert.ok(code.includes("var _threshold = 0.889871"), "offscreen inference starts at the fixed threshold");
  assert.ok(code.includes("msg.filterThreshold"), "the bridge and offscreen inference share the same fixed value");
  assert.ok(!code.includes("filterStrictness"), "the old adjustable threshold path is removed");
});

test("offscreen image loading reads bytes instead of a CORS-restricted img", () => {
  const code = fs.readFileSync(OFFSCREEN_PATH, "utf8");
  assert.ok(code.includes("credentials: 'omit'"), "fetches with host permission");
  assert.ok(code.includes("credentials: 'include', referrer: page"), "retries once with page cookies and referrer");
  assert.ok(code.includes("createImageBitmap(blob)"), "decodes the fetched blob");
  assert.ok(!code.includes("crossOrigin"), "no anonymous img request");
  assert.ok(code.includes("Math.round(sexy * 10000) / 10000"), "scores come back as 0.0-1.0 floats");
  assert.ok(fs.readFileSync(path.join(path.dirname(OFFSCREEN_PATH), "offscreen-work.js"), "utf8").includes("status: error.status"), "failures report the HTTP status");
  assert.ok(code.includes("msg.type === 'PREPARE_SHIELD'"), "can create a blurred checking image before classification");
  assert.ok(code.includes("classifyUrl(msg.url, msg.page, msg.shield === true, msg.preparedId, msg.forceFresh === true)"), "classification consumes the preview's saved fetch token");
  assert.ok(code.includes("Math.max(20, Math.round(width / 18))"), "preview blur is intentionally stronger than the previous 8px/width÷36 setting");
});

test("offscreen loads the on-demand Freepik retry runtime and bounds its snapshots", () => {
  const html = fs.readFileSync(OFFSCREEN_HTML_PATH, "utf8");
  const code = fs.readFileSync(OFFSCREEN_PATH, "utf8");
  assert.ok(html.indexOf('src="ort.min.js"') < html.indexOf('src="offscreen.js"'), "ORT is available before retry code runs");
  assert.ok(code.includes("freepik-eva02-448-fp16.onnx"), "uses the evaluated FP16 retry model");
  assert.ok(code.includes("msg.type === 'RETRY_STRONG'"), "strong-model inference is a separate message stage");
  assert.ok(code.includes("makeStrongSnapshot(bitmap)"), "the retry is bound to the first-stage decoded image");
  assert.ok(code.includes("SNAPSHOT_MAX_BYTES = 1024 * 1024"), "retained source snapshots have a byte cap");
  assert.ok(code.includes("var SNAPSHOT_MAX = 8"), "retained source snapshots have an entry cap");
  assert.ok(code.includes("var STRONG_RETRY_CAP = 4"), "strong inference has a bounded queue");
  assert.ok(code.includes("_strongRetryTail = run.catch"), "strong inference is serialized to bound model memory");
  assert.ok(code.includes("STRONG_THRESHOLD = 0.729"), "the explicit-score decision uses the measured Freepik operating point");
});

test("guard sends currentSrc and skips tiny data placeholders", () => {
  const code = fs.readFileSync(GUARD_PATH, "utf8") + fs.readFileSync(path.join(path.dirname(GUARD_PATH), "atlas-nsfw-guard-watch.js"), "utf8");
  assert.ok(code.includes("img.currentSrc || img.src"), "classifies the displayed candidate");
  assert.ok(code.includes("src.startsWith('data:') && img.naturalWidth <= 1"), "skips 1x1 placeholders");
  assert.ok(code.includes("addEventListener('load'"), "re-checks images when a lazy candidate arrives");
  assert.ok(code.includes("delete target.dataset.nsfwFilterStatus"), "clears the placeholder verdict on load");
  assert.ok(code.includes("classify(src,"), "classifies the resolved source");
});
