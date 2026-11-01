"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const LOG_PATH = path.join(ROOT, "payload", "install-files", "components", "atlas", "atlas-nsfw-log.js");
const GUARD_PATH = path.join(ROOT, "payload", "install-files", "components", "atlas", "atlas-nsfw-guard.js");
const SCRIPTS_PATH = path.join(ROOT, "src", "modules", "03-bridge-content-scripts.js");
const KEYS_PATH = path.join(ROOT, "payload", "detractless", "src", "constants", "atlasKeys.json");
const BRIDGE_PATH = path.join(ROOT, "src", "modules", "04-bridge-messages.js");
const VERDICTS_PATH = path.join(ROOT, "src", "modules", "27-nsfw-verdicts.js");

/* Runs the sink in a page-like sandbox and returns { sunk, counters, summary }. */
function loadSink(items, onChanged) {
  const code = fs.readFileSync(LOG_PATH, "utf8");
  const storage = { items: items || {}, local: { get(keys, cb) { cb(storage.items); }, }, };
  const listeners = [];
  const chrome = {
    runtime: { lastError: undefined },
    storage: {
      local: storage.local,
      onChanged: { addListener(fn) { listeners.push(fn); } },
    },
  };
  const sunk = [];
  const consoleApi = { debug(...args) { sunk.push(args); }, warn() {}, log() {} };
  let storageSet = 0;
  chrome.storage.local.set = function () { storageSet++; };   /* must never be called */
  const sent = [];
  chrome.runtime.sendMessage = function (msg, cb) { sent.push(msg); if (cb) cb(); };
  const timers = [];
  const pageEvents = {};
  const sandbox = new Function(
    "chrome", "window", "console", "Date", "Math", "setTimeout",
    code + "\nreturn { enabled: function () { return true; } };"
  );
  const page = {
    location: { hostname: "www.youtube.com" },
    addEventListener(type, fn) { pageEvents[type] = fn; },
  };
  page.top = page;
  sandbox(chrome, page, consoleApi, Date, Math, (fn) => { timers.push(fn); return timers.length; });
  if (onChanged) listeners[0](onChanged, "local");
  return {
    sunk, page, consoleApi, storageSet, sent, timers, pageEvents,
    logargs: () => sunk[sunk.length - 1],
    summary: () => page.__atlasNsfwDebugSummary(),
  };
}

test("ordinary browsing and legacy true are quiet; detailed logs require verbose", () => {
  for (const settings of [{}, { nsfwDebugLog: false }, { nsfwDebugLog: true }]) {
    const env = loadSink(settings); env.page.__atlasNsfwLog("seen", { kind: "img" });
    assert.equal(env.sunk.length, 0); assert.equal(env.timers.length, 0);
    assert.equal(env.summary().events.length, 0);
  }
  const env = loadSink({ nsfwDebugLog: "verbose" }); env.page.__atlasNsfwLog("seen", {});
  assert.equal(env.sunk.length, 1);
});

test("a flipped-on toggle emits atlas-nsfw console lines and rolls up counters", () => {
  const env = loadSink({}, { nsfwDebugLog: { newValue: "verbose" } });
  env.page.__atlasNsfwLog("verdict", { kind: "img", srcKind: "http", isNsfw: true, threshold: 0.27 });
  env.page.__atlasNsfwLog("fail", { kind: "video", reason: "canvasTaint" });
  env.page.__atlasNsfwLog("fail", { kind: "video", reason: "canvasTaint" });
  assert.equal(env.sunk.length, 3, "every event reached the console");
  assert.deepEqual(env.logargs()[0], "[atlas-nsfw]", "the console line is tagged for filtering");
  const sum = env.summary();
  assert.equal(sum.counters.fail["canvasTaint"], 2, "identical reasons are counted, not repeated by hand");
  assert.equal(sum.counters.verdict.http, 1, "http verdicts are counted by srcKind");
  assert.equal(sum.events.length, 3, "the ring keeps the raw events");
});

test("logged URLs are truncated and digested, never stored whole", () => {
  const env = loadSink({}, { nsfwDebugLog: { newValue: "verbose" } });
  const url = "https://very-private.example/long/path/photo-" + "x".repeat(200) + ".jpg";
  env.page.__atlasNsfwLog("seen", { kind: "img", url });
  const logged = env.logargs()[2];
  assert.ok(logged.url.length <= 49, "the URL is cut to a short prefix plus a digest");
  assert.ok(logged.url.includes("#"), "the digest is appended");
  assert.ok(!JSON.stringify(env.summary()).includes("xxxxxxxx"),
    "no untruncated URL body survives anywhere");
  assert.equal(JSON.stringify(env.summary()).length < 100000, true, "the store stays small");
});

test("the ring buffer is capped so a busy page cannot grow it forever", () => {
  const env = loadSink({}, { nsfwDebugLog: { newValue: "verbose" } });
  for (let i = 0; i < 620; i++) env.page.__atlasNsfwLog("seen", { kind: "img" });
  assert.equal(env.summary().events.length, 500, "old events are dropped at the cap");
});

test("events are batched to the bridge with the page host, one timer per batch", () => {
  const env = loadSink({ nsfwDebugLog: "verbose" });
  env.page.__atlasNsfwLog("verdict", { kind: "video", isNsfw: true, score: 0.51, threshold: 0.44, url: "data:image/jpeg;base64," + "A".repeat(300) });
  env.page.__atlasNsfwLog("seen", { kind: "img" });
  assert.equal(env.timers.length, 1, "a burst of events shares one flush");
  assert.equal(env.sent.length, 0, "nothing is sent before the flush");
  env.timers[0]();
  assert.equal(env.sent.length, 1, "one message carries the batch");
  const msg = env.sent[0].atlas;
  assert.equal(msg.act, "nsfw-debug-log");
  assert.equal(msg.events.length, 2);
  assert.equal(msg.events[0].page, "www.youtube.com", "the page is named by host");
  assert.equal(msg.events[0].top, true, "the top frame is marked");
  assert.equal(msg.events[0].data.score, 0.51, "the score travels with the verdict");
  assert.ok(msg.events[0].data.url.length <= 49, "media URLs leave the page truncated");
  assert.equal(env.storageSet, 0, "the page never writes storage itself");
});

test("a page that is going away sends what it has, and an off toggle sends nothing", () => {
  const env = loadSink({ nsfwDebugLog: "verbose" });
  env.page.__atlasNsfwLog("seen", { kind: "img" });
  env.pageEvents.pagehide();
  assert.equal(env.sent.length, 1, "pagehide flushes the batch");
  const off = loadSink({ nsfwDebugLog: false });
  off.page.__atlasNsfwLog("seen", { kind: "img" });
  assert.equal(off.timers.length + off.sent.length, 0, "no batch when logging is off");
});

/* Runs the bridge with a working chrome.storage.local and returns its debug-log writer. */
function loadBridgeLog(localData) {
  const code = fs.readFileSync(BRIDGE_PATH, "utf8") + "\n" + fs.readFileSync(VERDICTS_PATH, "utf8");
  const listeners = [];
  const pick = (keys) => {
    const out = {};
    [].concat(keys).forEach((k) => { if (k in localData) out[k] = localData[k]; });
    return out;
  };
  const chrome = {
    runtime: { lastError: undefined, onMessage: { addListener() {} }, sendMessage() {} },
    storage: {
      sync: { get(keys, cb) { cb({}); } },
      local: {
        get(keys, cb) { setTimeout(() => cb(pick(keys)), 1); },
        set(obj, cb) { setTimeout(() => { Object.assign(localData, obj); if (cb) cb(); }, 1); },
        remove(key, cb) { delete localData[key]; if (cb) cb(); },
      },
      onChanged: { addListener(fn) { listeners.push(fn); } },
    },
    tabs: { onUpdated: { addListener() {} } },
  };
  const sandbox = new Function(
    "chrome", "document", "localStorage", "setInterval", "setTimeout", "window", "console",
    code + "\nreturn { save: saveNsfwDebugEvents, settled: function () { return _nsfwLogChain; } };"
  );
  const api = sandbox(chrome, {}, {}, () => 0, setTimeout, {}, console);
  return { save: api.save, settled: api.settled, listeners, localData };
}

test("the bridge keeps the last 500 events and never loses a batch to a race", async () => {
  const env = loadBridgeLog({ nsfwDebugLog: "verbose" });
  const batch = (n, tag) => Array.from({ length: n }, (_, i) => ({ event: "seen", data: { tag, i } }));
  env.save(batch(200, "a"));
  env.save(batch(200, "b"));
  env.save(batch(200, "c"));
  await env.settled();
  const kept = env.localData.nsfwDebugEvents;
  assert.equal(kept.length, 500, "the on-disk log is capped at 500");
  assert.equal(kept[kept.length - 1].data.tag, "c", "the newest events are kept");
  assert.equal(kept.filter((e) => e.data.tag === "b").length, 200, "concurrent batches all landed");
});

test("turning logging off deletes the saved log and stops new writes", async () => {
  const env = loadBridgeLog({ nsfwDebugEvents: [{ event: "seen" }] });
  env.listeners.forEach((fn) => fn({ nsfwDebugLog: { newValue: false } }, "local"));
  assert.equal(env.localData.nsfwDebugEvents, undefined, "the saved log is removed");
  env.localData.nsfwDebugLog = false;
  env.save([{ event: "seen" }]);
  await env.settled();
  assert.equal(env.localData.nsfwDebugEvents, undefined, "a late batch is not written");
});

const sinkCode = fs.readFileSync(LOG_PATH, "utf8");

test("the realistic traits a page touches are all listed in atlasKeys", () => {
  const keys = JSON.parse(fs.readFileSync(KEYS_PATH, "utf8"));
  assert.ok(keys.local.nsfwDebugLog, "nsfwDebugLog is a declared local key");
  assert.equal(keys.local.nsfwDebugLog.backup, false, "the debug flag is not worth backing up");
  assert.ok(keys.local.nsfwDebugEvents, "nsfwDebugEvents is a declared local key");
  assert.equal(keys.local.nsfwDebugEvents.backup, false, "the debug log is not backed up");
});

test("the sink registers before the guard in the content-script bundle", () => {
  const scripts = fs.readFileSync(SCRIPTS_PATH, "utf8");
  const logAt = scripts.indexOf("components/atlas/atlas-nsfw-log.js");
  const guardAt = scripts.indexOf("components/atlas/atlas-nsfw-guard.js");
  assert.ok(logAt >= 0 && guardAt > logAt, "the trace helpers exist by the time the guard runs");
});

test("the trace surface exposes srcKind, fail reasons and verdict logging", () => {
  const code = fs.readFileSync(GUARD_PATH, "utf8");
  assert.ok(sinkCode.includes("__atlasNsfwTrace"), "the sink defines the trace surface");
  assert.ok(sinkCode.includes("detectorTimeout") && sinkCode.includes("detectorUnavailable"),
    "detector failure reasons are named");
  assert.ok(sinkCode.includes("blobUnfetchable"), "unfetchable blob frames are named");
  assert.ok(code.includes("canvasTaint"), "tainted video frames are tagged by the guard");
  assert.ok(code.includes("_t.verdict("), "the guard runs through the trace surface even when the toggle is off");
});
