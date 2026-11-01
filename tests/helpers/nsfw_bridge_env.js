"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const BRIDGE_PATH = path.join(ROOT, "src", "modules", "04-bridge-messages.js");
const VERDICTS_PATH = path.join(ROOT, "src", "modules", "27-nsfw-verdicts.js");
const RETRY_BRIDGE_PATH = path.join(ROOT, "src", "modules", "28-nsfw-retry-bridge.js");
const PREPARE_BRIDGE_PATH = path.join(ROOT, "src", "modules", "29-nsfw-shield-prepare.js");
const OFFSCREEN_PATH = path.join(ROOT, "payload", "install-files", "components", "atlas", "nsfw", "offscreen.js");
const OFFSCREEN_HTML_PATH = path.join(ROOT, "payload", "install-files", "components", "atlas", "nsfw", "offscreen.html");
const GUARD_PATH = path.join(ROOT, "payload", "install-files", "components", "atlas", "atlas-nsfw-guard.js");

function loadBridge(options) {
  options = options || {};
  const code = fs.readFileSync(BRIDGE_PATH, "utf8") + "\n" + fs.readFileSync(VERDICTS_PATH, "utf8") + "\n" + fs.readFileSync(RETRY_BRIDGE_PATH, "utf8") + "\n" + fs.readFileSync(PREPARE_BRIDGE_PATH, "utf8");
  const frames = [];
  const doc = {
    body: { appendChild(el) { frames.push(el); } },
    getElementById(id) { return frames.find((f) => f.id === id) || null; },
    createElement() { return { id: "", style: {}, src: "" }; },
  };
  const store = {};
  const localStorage = {
    getItem(k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem(k, v) { store[k] = String(v); },
  };
  const calls = [], syncReads = [], stats = { classify: 0, strong: 0 };
  const localData = options.localData || {};
  const local = {
    get(key, cb) {
      const out = {};
      if (typeof key === "string" && Object.prototype.hasOwnProperty.call(localData, key)) out[key] = localData[key];
      if (options.storageDelay) setTimeout(() => cb(out), options.storageDelay); else cb(out);
    },
    set(obj, cb) { Object.assign(localData, obj); if (cb) cb(); },
  };
  const chrome = {
    runtime: {
      lastError: undefined,
      onMessage: { addListener() {} },
      getURL(p) { return "chrome-extension://atlas/" + p; },
      sendMessage(msg, cb) {
        calls.push(msg);
        if (msg.type === "SET_SETTINGS") { if (cb) setTimeout(cb, 0); return; }
        if (msg.type === "RELEASE_SNAPSHOT") { if (cb) setTimeout(() => cb({ ok: true }), 0); return; }
        if (msg.type === "RELEASE_PREPARED") { if (cb) setTimeout(() => cb({ ok: true }), 0); return; }
        if (msg.type === "PREPARE_SHIELD") {
          const result = options.onPrepare ? options.onPrepare(msg) : { preparedId: "prepared-token", shieldPreview: "data:image/webp;base64,blur", shieldWidth: 640, shieldHeight: 360 };
          setTimeout(() => { chrome.runtime.lastError = undefined; cb(result); }, 5);
          return;
        }
        if (msg.type === "RETRY_STRONG") {
          stats.strong++;
          const result = options.onRetry ? options.onRetry(stats.strong, msg) : { stage: "strong", model: "fake-strong", isNsfw: false, score: 0.1 };
          setTimeout(() => { chrome.runtime.lastError = undefined; cb(result); }, 5);
          return;
        }
        if (msg.type !== "CLASSIFY") { if (cb) cb(); return; }
        stats.classify++;
        const result = options.onClassify ? options.onClassify(stats.classify, msg) : { result: false, error: "[object Event]" };
        setTimeout(() => {
          if (result === "retry") {
            chrome.runtime.lastError = { message: "Receiving end does not exist" };
            cb(undefined);
            return;
          }
          chrome.runtime.lastError = undefined;
          cb(result);
        }, 5);
      },
    },
    storage: {
      sync: { get(keys, cb) { syncReads.push([].concat(keys)); cb({ nsfwAction: options.action || "blur", nsfwStrictness: options.strictness || 85 }); } },
      local,
      onChanged: { addListener() {} },
    },
    tabs: { onUpdated: { addListener() {} } },
  };
  const sandbox = new Function(
    "chrome", "document", "localStorage", "setInterval", "setTimeout", "window", "console",
    code + "\nreturn { classifyNsfwImage: classifyNsfwImage, prepareNsfwImage: prepareNsfwImage, retryNsfwImage: retryNsfwImage, releaseNsfwImage: releaseNsfwImage, nsfwThreshold: nsfwThreshold, " +
    "nsfwHash: nsfwHash, nsfwCacheSet: nsfwCacheSet, nsfwCacheGet: nsfwCacheGet, nsfwFlushStore: nsfwFlushStore, cachedNsfwImage: cachedNsfwImage, " +
    "NSFW_STORE_KEY: NSFW_STORE_KEY, NSFW_CACHE_MAX: NSFW_CACHE_MAX, firstVersion: NSFW_FIRST_MODEL_VERSION, strongVersion: NSFW_STRONG_MODEL_VERSION };"
  );
  const api = sandbox(chrome, doc, localStorage, () => 0, setTimeout, {}, console);
  return {
    classify: api.classifyNsfwImage, prepare: api.prepareNsfwImage, retry: api.retryNsfwImage, release: api.releaseNsfwImage, threshold: api.nsfwThreshold, hash: api.nsfwHash,
    cacheSet: api.nsfwCacheSet, cacheGet: api.nsfwCacheGet, flush: api.nsfwFlushStore, cached: api.cachedNsfwImage,
    storeKey: api.NSFW_STORE_KEY, cacheMax: api.NSFW_CACHE_MAX,
    calls, syncReads, frames, stats, localData, firstVersion: api.firstVersion, strongVersion: api.strongVersion,
  };
}
module.exports = { loadBridge, OFFSCREEN_PATH, OFFSCREEN_HTML_PATH, GUARD_PATH };
