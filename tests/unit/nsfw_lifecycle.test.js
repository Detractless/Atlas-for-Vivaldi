"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { setup, latestRequest, prepareAndClassify, classifyFlagged, PREVIEW } = require("../helpers/nsfw_image_env.js");
const { loadBridge } = require("../helpers/nsfw_bridge_env.js");
const wait = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));
const preparedCalls = (env) => env.requests.filter((r) => r.message.act === "nsfw-prepare-shield");
const classify = (env, message) => new Promise((resolve) => env.classify(message, resolve));
const cached = (env, url) => new Promise((resolve) => env.cached({ url }, resolve));

test("a safe cached result restores the image without a checking UI or model request", (t) => {
  const env = setup(undefined, { cachedVerdict: { isNsfw: false, score: 0.1, source: "cache" } });
  t.after(() => env.dom.window.close());
  env.shield.analyze(env.img, "https://img.test/small.jpg");
  assert.equal(env.img.dataset.nsfwFilterStatus, "sfw");
  assert.equal(env.window.document.querySelector("[data-atlas-nsfw-overlay]"), null);
  assert.equal(preparedCalls(env).length, 0);
  assert.equal(env.requests.some((r) => r.message.act === "nsfw-classify"), false);
  assert.equal(env.logs.some((e) => e.event === "ui.checking"), false);
  env.dom.window.close();
});

test("moving a checking image keeps one request alive", async (t) => {
  const env = setup();
  t.after(() => env.dom.window.close());
  env.shield.analyze(env.img, "https://img.test/small.jpg");
  const wrapper = env.window.document.createElement("div");
  env.window.document.body.appendChild(wrapper);
  wrapper.appendChild(env.img);
  await wait();
  env.shield.analyze(env.img, "https://img.test/small.jpg");
  assert.equal(preparedCalls(env).length, 1);
  latestRequest(env, "nsfw-prepare-shield").callback({ preparedId: "move", shieldPreview: PREVIEW });
  latestRequest(env, "nsfw-classify").callback({ isNsfw: false });
  assert.equal(env.img.dataset.nsfwFilterStatus, "sfw");
  assert.equal(env.logs.some((e) => e.event === "ui.cancelled"), false);
  env.dom.window.close();
});

test("moving a flagged image retains its status and stronger retry snapshot", async (t) => {
  const env = setup(); classifyFlagged(env);
  t.after(() => env.dom.window.close());
  const host = env.window.document.querySelector("[data-atlas-nsfw-overlay]");
  const wrapper = env.window.document.createElement("div");
  env.window.document.body.appendChild(wrapper);
  wrapper.appendChild(env.img);
  await wait();
  env.shield.analyze(env.img, "https://img.test/small.jpg");
  assert.equal(preparedCalls(env).length, 1);
  assert.equal(env.window.document.querySelector("[data-atlas-nsfw-overlay]"), host);
  assert.equal(env.img.dataset.nsfwFlagged, "1");
  assert.equal(env.requests.some((r) => r.message.act === "nsfw-release-snapshot"), false);
  host.shadowRoot.querySelector("button").click();
  assert.equal(latestRequest(env, "nsfw-retry").message.snapshotId, "opaque-snapshot");
  env.dom.window.close();
});

test("actual image removal still releases its retry snapshot", async (t) => {
  const env = setup(); classifyFlagged(env);
  t.after(() => env.dom.window.close());
  env.img.remove();
  await wait();
  assert.equal(env.window.document.querySelector("[data-atlas-nsfw-overlay]"), null);
  assert.ok(env.requests.some((r) => r.message.act === "nsfw-release-snapshot"));
  env.dom.window.close();
});

test("a thumbnail upgrade and its load event start exactly one check for the new URL", async (t) => {
  const env = setup(); classifyFlagged(env);
  t.after(() => env.dom.window.close());
  const next = "https://img.test/larger.jpg";
  env.img.setAttribute("src", next);
  env.shield.sourceChanged(env.img, env.img, "src");
  const prepare = latestRequest(env, "nsfw-prepare-shield", next);
  env.shield.sourceChanged(env.img);
  await wait();
  assert.equal(preparedCalls(env).filter((r) => r.message.url === next).length, 1);
  prepare.callback({ preparedId: "larger", shieldPreview: PREVIEW });
  latestRequest(env, "nsfw-classify", next).callback({ isNsfw: false });
  assert.equal(env.img.getAttribute("src"), next);
  assert.equal(env.img.dataset.nsfwFilterStatus, "sfw");
  env.dom.window.close();
});

test("a stale preparation cannot overwrite or classify a newer source", (t) => {
  const env = setup();
  t.after(() => env.dom.window.close());
  env.shield.analyze(env.img, "https://img.test/small.jpg");
  const stale = latestRequest(env, "nsfw-prepare-shield");
  env.img.setAttribute("src", "https://img.test/next.jpg");
  env.shield.sourceChanged(env.img, env.img, "src");
  stale.callback({ preparedId: "stale-token", shieldPreview: PREVIEW });
  assert.equal(env.img.getAttribute("src"), "https://img.test/next.jpg");
  assert.ok(env.requests.some((r) => r.message.act === "nsfw-release-prepared" && r.message.preparedId === "stale-token"));
  assert.equal(env.requests.some((r) => r.message.act === "nsfw-classify"), false);
  env.dom.window.close();
});

test("saved strong NSFW confirmation keeps its final status without a first-model rerun", (t) => {
  const verdict = { isNsfw: true, confirmed: true, stage: "strong", model: "freepik-448-fp16", source: "confirmation-cache" };
  const env = setup(undefined, { cachedVerdict: verdict });
  t.after(() => env.dom.window.close());
  env.shield.analyze(env.img, "https://img.test/small.jpg");
  latestRequest(env, "nsfw-prepare-shield").callback({ verdict, preparedId: "confirm", shieldPreview: PREVIEW });
  const host = env.window.document.querySelector("[data-atlas-nsfw-overlay]");
  assert.match(host.shadowRoot.textContent, /NSFW confirmed/);
  assert.equal(host.shadowRoot.querySelector("button"), null);
  assert.equal(env.requests.some((r) => r.message.act === "nsfw-classify"), false);
  assert.equal(env.logs.some((e) => e.event === "ui.checking"), false);
  env.dom.window.close();
});

test("strong SFW confirmation survives restart independently of the first-model score", async (t) => {
  const localData = {}, url = "https://img.test/confirmed.jpg";
  let env;
  env = loadBridge({ localData, onClassify: () => ({ result: true, score: 0.91 }), onRetry: () => ({
    stage: "strong", model: "freepik-448-fp16", modelVersion: env.strongVersion,
    score: 0.12, threshold: 0.729, isNsfw: false, sourceUrl: url,
  }) });
  await classify(env, { url });
  const result = await new Promise((resolve) => env.retry({ snapshotId: "exact-snapshot", url: "https://wrong.test/" }, resolve));
  assert.equal(result.sourceUrl, undefined);
  assert.equal(env.cacheGet(url).score, 0.91, "strong score never replaces the first-model score");
  env.flush();
  const restarted = loadBridge({ localData });
  const hit = await cached(restarted, url);
  assert.equal(hit.verdict.isNsfw, false);
  assert.equal(hit.verdict.source, "confirmation-cache");
  assert.equal((await classify(restarted, { url, shield: true })).isNsfw, false);
  assert.equal(restarted.stats.classify, 0);
  assert.equal((await cached(restarted, "https://wrong.test/")).verdict, null);
  assert.equal(JSON.stringify(localData).includes("confirmed.jpg"), false);
});

test("unversioned and mismatched first-model scores are re-evaluated", async (t) => {
  for (const version of [undefined, "another-model"] ) {
    const probe = loadBridge(), url = "https://img.test/old-model.jpg";
    const localData = { [probe.storeKey]: { [probe.hash(url)]: [0.01, Date.now(), version] } };
    const env = loadBridge({ localData, onClassify: () => ({ result: true, score: 0.9 }) });
    assert.equal((await cached(env, url)).verdict, null);
    assert.equal((await classify(env, { url })).source, "detector");
  }
});

test("force-fresh bypasses a valid cache and reaches the detector", async (t) => {
  const env = loadBridge({ onClassify: () => ({ result: true, score: 0.9 }) });
  const url = "https://img.test/force.jpg";
  env.cacheSet(url, 0.01);
  assert.equal((await cached(env, url)).verdict.isNsfw, false);
  const response = await classify(env, { url, forceFresh: true });
  assert.equal(response.source, "detector");
  assert.equal(response.isNsfw, true);
  assert.equal(env.calls.find((c) => c.type === "CLASSIFY").forceFresh, true);
});

test("force-fresh image request bypasses the cache lookup and tags both stages", (t) => {
  const env = setup(undefined, { cachedVerdict: { isNsfw: false } });
  t.after(() => env.dom.window.close());
  env.shield.analyze(env.img, "https://img.test/small.jpg", { forceFresh: true });
  assert.equal(env.requests.some((r) => r.message.act === "nsfw-cached-verdict"), false);
  const prepare = latestRequest(env, "nsfw-prepare-shield");
  assert.equal(prepare.message.forceFresh, true);
  prepare.callback({ preparedId: "fresh", shieldPreview: PREVIEW });
  assert.equal(latestRequest(env, "nsfw-classify").message.forceFresh, true);
  env.dom.window.close();
});

test("a saved strong NSFW verdict prepares blur without rerunning the first model", async () => {
  const localData = {}, url = "https://img.test/strong-blocked.jpg";
  let env;
  env = loadBridge({ localData, onRetry: () => ({ sourceUrl: url, stage: "strong", model: "freepik-448-fp16",
    modelVersion: env.strongVersion, score: 0.95, threshold: 0.729, isNsfw: true }) });
  await new Promise((resolve) => env.retry({ snapshotId: "blocked" }, resolve));
  env.flush();
  const restarted = loadBridge({ localData });
  const response = await new Promise((resolve) => restarted.prepare({ url }, resolve));
  assert.equal(response.verdict.confirmed, true);
  assert.equal(response.verdict.isNsfw, true);
  assert.ok(response.shieldPreview);
  assert.equal(restarted.stats.classify, 0);
  assert.equal(restarted.stats.strong, 0);
});

test("a changed strong-model version cannot reuse a saved safe confirmation", async () => {
  const probe = loadBridge(), url = "https://img.test/outdated-confirmation.jpg";
  const stored = [0.91, Date.now(), probe.firstVersion, [0.01, Date.now(), "old-strong-model", 0.729, false]];
  const env = loadBridge({ localData: { [probe.storeKey]: { [probe.hash(url)]: stored } } });
  assert.equal((await cached(env, url)).verdict, null);
});

test("a cached safe preparation returns its verdict without offscreen work", async () => {
  const env = loadBridge(), url = "https://img.test/known-safe.jpg";
  env.cacheSet(url, 0.01);
  const response = await new Promise((resolve) => env.prepare({ url }, resolve));
  assert.equal(response.verdict.isNsfw, false);
  assert.equal(response.verdict.source, "cache");
  assert.equal(env.calls.length, 0);
});

test("startup cache lookup waits for persisted scores before reporting a miss", async () => {
  const url = "https://img.test/startup.jpg", first = loadBridge({ localData: {} });
  first.cacheSet(url, 0.01); first.flush();
  const env = loadBridge({ localData: first.localData, storageDelay: 20 });
  const response = await cached(env, url);
  assert.equal(response.verdict.isNsfw, false);
  assert.equal(env.calls.length, 0);
});

test("a forced first-model diagnostic cannot erase a stronger confirmation", async () => {
  const url = "https://img.test/confirmed-safe.jpg";
  let env;
  env = loadBridge({ onClassify: () => ({ result: true, score: 0.95 }), onRetry: () => ({
    sourceUrl: url, model: "freepik-448-fp16", modelVersion: env.strongVersion,
    score: 0.1, threshold: 0.729, isNsfw: false, stage: "strong",
  }) });
  await new Promise((resolve) => env.retry({ snapshotId: "safe" }, resolve));
  const diagnostic = await classify(env, { url, forceFresh: true });
  assert.equal(diagnostic.source, "detector");
  assert.equal(diagnostic.isNsfw, true);
  assert.equal((await cached(env, url)).verdict.isNsfw, false);
});
