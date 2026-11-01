/* Versioned first-model scores and independent stronger-model confirmations.
   Persist digests and verdict metadata only; never persist source URLs or pixels. */
var NSFW_CACHE_MAX = 5000;
var NSFW_CACHE_TTL = 7 * 24 * 60 * 60 * 1000;
var NSFW_STORE_KEY = "atlasNsfwScores";
var NSFW_STORE_BYTES = 1024 * 1024;
var NSFW_STORE_FLUSH_MS = 2000;
var NSFW_MOBILENET_THRESHOLD = 0.889871;
var NSFW_FIRST_MODEL_VERSION = "mobilenetv2-224-rgb01-v1";
var NSFW_STRONG_MODEL_VERSION = "freepik-eva02-448-fp16-clip-v1";
var NSFW_STRONG_THRESHOLD = 0.729;
var _nsfwScores = new Map();
var _nsfwStoreDirty = false;
var _nsfwStoreTimer = 0;
var _nsfwStoreLoading = false;
var _nsfwStoreWaiters = [];

function nsfwThreshold() { return NSFW_MOBILENET_THRESHOLD; }
function nsfwVerdict(score) { return score >= NSFW_MOBILENET_THRESHOLD; }
function nsfwHash(url) {
  var h1 = 0x811c9dc5, h2 = 0x9e3779b9, i, c;
  for (i = 0; i < url.length; i++) {
    c = url.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619);
    h2 = Math.imul(h2 ^ c, 2246822507);
  }
  return ((h1 >>> 0).toString(16) + "00000000").slice(0, 8) +
    ((h2 >>> 0).toString(16) + "00000000").slice(0, 8);
}
function nsfwStoreReady() {
  return typeof chrome !== "undefined" && chrome.storage && chrome.storage.local &&
    typeof chrome.storage.local.get === "function" && typeof chrome.storage.local.set === "function";
}
function nsfwFresh(ts) { return typeof ts === "number" && Date.now() - ts <= NSFW_CACHE_TTL; }
function nsfwCacheGet(url) {
  if (!url || !/^https?:\/\//i.test(url)) return null;
  var h = nsfwHash(url), hit = _nsfwScores.get(h);
  if (!hit || hit.version !== NSFW_FIRST_MODEL_VERSION || !nsfwFresh(hit.ts) ||
      typeof hit.score !== "number" || !isFinite(hit.score)) return null;
  _nsfwScores.delete(h); _nsfwScores.set(h, hit);
  return hit;
}
function nsfwConfirmationGet(url) {
  if (!url) return null;
  var entry = _nsfwScores.get(nsfwHash(url)), hit = entry && entry.confirmation;
  return hit && hit.version === NSFW_STRONG_MODEL_VERSION && hit.threshold === NSFW_STRONG_THRESHOLD &&
    nsfwFresh(hit.ts) && typeof hit.isNsfw === "boolean" ? hit : null;
}
function nsfwConfirmationResponse(url) {
  var hit = nsfwConfirmationGet(url);
  return hit ? { isNsfw: hit.isNsfw, score: hit.score, threshold: hit.threshold,
    source: "confirmation-cache", stage: "strong", model: "freepik-448-fp16",
    modelVersion: hit.version, confirmed: true } : null;
}
function nsfwCachedVerdict(url) {
  var confirmed = nsfwConfirmationResponse(url);
  if (confirmed) return confirmed;
  var hit = nsfwCacheGet(url);
  return hit ? nsfwResponse(hit.score, "cache") : null;
}
function nsfwScheduleStore() {
  while (_nsfwScores.size > NSFW_CACHE_MAX) _nsfwScores.delete(_nsfwScores.keys().next().value);
  _nsfwStoreDirty = true;
  if (!_nsfwStoreTimer) _nsfwStoreTimer = setTimeout(nsfwFlushStore, NSFW_STORE_FLUSH_MS);
}
function nsfwCacheSet(url, score) {
  if (!url || !/^https?:\/\//i.test(url) || typeof score !== "number" || !isFinite(score)) return;
  var h = nsfwHash(url), entry = _nsfwScores.get(h) || {};
  entry.score = Math.round(score * 1e5) / 1e5;
  entry.ts = Date.now(); entry.version = NSFW_FIRST_MODEL_VERSION;
  _nsfwScores.delete(h); _nsfwScores.set(h, entry); nsfwScheduleStore();
}
function nsfwConfirmationSet(url, result) {
  if (!url || !/^(https?:\/\/|data:image\/)/i.test(url) || !result || result.error ||
      result.model !== "freepik-448-fp16" || result.modelVersion !== NSFW_STRONG_MODEL_VERSION ||
      result.threshold !== NSFW_STRONG_THRESHOLD || typeof result.isNsfw !== "boolean" ||
      typeof result.score !== "number" || !isFinite(result.score)) return;
  var h = nsfwHash(url), entry = _nsfwScores.get(h) || {};
  entry.confirmation = { score: result.score, ts: Date.now(), version: result.modelVersion,
    threshold: result.threshold, isNsfw: result.isNsfw };
  _nsfwScores.delete(h); _nsfwScores.set(h, entry); nsfwScheduleStore();
}
function nsfwEncodeEntry(entry) {
  var first = entry.version === NSFW_FIRST_MODEL_VERSION && nsfwFresh(entry.ts) && typeof entry.score === "number";
  var strong = entry.confirmation;
  if (strong && (!nsfwFresh(strong.ts) || strong.version !== NSFW_STRONG_MODEL_VERSION ||
      strong.threshold !== NSFW_STRONG_THRESHOLD)) strong = null;
  if (!first && !strong) return null;
  return [first ? entry.score : null, first ? entry.ts : 0, NSFW_FIRST_MODEL_VERSION,
    strong ? [strong.score, strong.ts, strong.version, strong.threshold, strong.isNsfw] : null];
}
function nsfwDecodeEntry(value) {
  if (!Array.isArray(value)) return null;
  var entry = {}, strong = value[3];
  if (value[2] === NSFW_FIRST_MODEL_VERSION && typeof value[0] === "number" && isFinite(value[0]) && nsfwFresh(value[1])) {
    entry.score = value[0]; entry.ts = value[1]; entry.version = value[2];
  }
  if (Array.isArray(strong) && typeof strong[0] === "number" && isFinite(strong[0]) && nsfwFresh(strong[1]) &&
      strong[2] === NSFW_STRONG_MODEL_VERSION && strong[3] === NSFW_STRONG_THRESHOLD && typeof strong[4] === "boolean") {
    entry.confirmation = { score: strong[0], ts: strong[1], version: strong[2], threshold: strong[3], isNsfw: strong[4] };
  }
  return entry.version || entry.confirmation ? entry : null;
}
function nsfwMergeStored(saved) {
  if (!saved || typeof saved !== "object") return;
  Object.keys(saved).forEach(function (h) {
    if (!/^[0-9a-f]{16}$/.test(h)) return;
    var incoming = nsfwDecodeEntry(saved[h]);
    if (!incoming) return;
    var known = _nsfwScores.get(h) || {};
    if (incoming.ts && (!known.ts || incoming.ts > known.ts)) {
      known.score = incoming.score; known.ts = incoming.ts; known.version = incoming.version;
    }
    if (incoming.confirmation && (!known.confirmation || incoming.confirmation.ts > known.confirmation.ts)) {
      known.confirmation = incoming.confirmation;
    }
    _nsfwScores.set(h, known);
  });
  while (_nsfwScores.size > NSFW_CACHE_MAX) _nsfwScores.delete(_nsfwScores.keys().next().value);
}
function nsfwFlushStore() {
  _nsfwStoreTimer = 0;
  if (!_nsfwStoreDirty || !nsfwStoreReady()) return;
  _nsfwStoreDirty = false;
  var entries = Array.from(_nsfwScores.entries()), out = {}, bytes = 26;
  for (var i = entries.length - 1; i >= 0; i--) {
    var h = entries[i][0], value = nsfwEncodeEntry(entries[i][1]);
    if (!value) continue;
    bytes += h.length + JSON.stringify(value).length + 6;
    if (bytes > NSFW_STORE_BYTES) break;
    out[h] = value;
  }
  chrome.storage.local.set({ [NSFW_STORE_KEY]: out }, function () { void chrome.runtime.lastError; });
}
function nsfwWhenStoreReady(callback) {
  if (_nsfwStoreLoading) _nsfwStoreWaiters.push(callback); else callback();
}
function nsfwLoadStore() {
  if (!nsfwStoreReady()) return;
  _nsfwStoreLoading = true;
  chrome.storage.local.get(NSFW_STORE_KEY, function (items) {
    nsfwMergeStored(items && items[NSFW_STORE_KEY]);
    _nsfwStoreLoading = false;
    var pending = _nsfwStoreWaiters; _nsfwStoreWaiters = [];
    pending.forEach(function (callback) { callback(); });
  });
}
nsfwLoadStore();
if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.onChanged && chrome.storage.onChanged.addListener) {
  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area === "local" && changes[NSFW_STORE_KEY]) nsfwMergeStored(changes[NSFW_STORE_KEY].newValue);
  });
}
