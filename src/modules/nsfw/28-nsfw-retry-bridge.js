/* ── 28-nsfw-retry-bridge.js: routes explicit stronger-model retries and
   releases their short-lived detector snapshots. ── */

var _nsfwRetryInFlight = new Map();

function sendStrongRetry(snapshotId, cb, attempt) {
  attempt = attempt || 0;
  ensureNsfwSettings();
  chrome.runtime.sendMessage({ target: "offscreen", type: "RETRY_STRONG", snapshotId: snapshotId }, function (resp) {
    var err = chrome.runtime.lastError;
    if ((err || resp === undefined) && attempt < 20) {
      setTimeout(function () { sendStrongRetry(snapshotId, cb, attempt + 1); }, 250);
      return;
    }
    cb(resp || { stage: "strong", model: "freepik-448-fp16", error: "detector-timeout",
      errorCode: "detector-timeout", errorDetail: "The local detector did not answer after 20 attempts" });
  });
}

function releaseNsfwSnapshot(snapshotId) {
  if (!snapshotId) return;
  chrome.runtime.sendMessage({ target: "offscreen", type: "RELEASE_SNAPSHOT", snapshotId: snapshotId }, function () {
    void chrome.runtime.lastError;
  });
}

function retryNsfwImage(m, sendResponse) {
  var snapshotId = String(m.snapshotId || "");
  if (!snapshotId || snapshotId.length > 80) {
    if (typeof sendResponse === "function") sendResponse({ stage: "strong", error: "invalid-snapshot",
      errorCode: "invalid-snapshot", errorDetail: "The retry snapshot identifier is missing or invalid" });
    return;
  }
  var waiting = _nsfwRetryInFlight.get(snapshotId);
  if (waiting) {
    if (typeof sendResponse === "function") waiting.push(sendResponse);
    return;
  }
  waiting = [];
  _nsfwRetryInFlight.set(snapshotId, waiting);
  if (typeof sendResponse === "function") waiting.push(sendResponse);
  var finish = function (out) {
    _nsfwRetryInFlight.delete(snapshotId);
    for (var i = 0; i < waiting.length; i++) waiting[i](out);
  };
  ensureDetector(function (ok) {
    if (!ok) { finish({ stage: "strong", error: "detector-unavailable", errorCode: "detector-unavailable",
      errorDetail: "No local detector is available in this window" }); return; }
    sendStrongRetry(snapshotId, function (resp) {
      if (!resp) { _nsfwSentSettings = null; finish({ stage: "strong", error: "detector-timeout",
        errorCode: "detector-timeout", errorDetail: "The local detector returned no response" }); return; }
      if (resp.error && !resp.errorCode) resp.errorCode = "retry-failed";
      if (resp.error && !resp.errorDetail) resp.errorDetail = String(resp.error).slice(0, 180);
      if (!resp.error && typeof resp.isNsfw !== "boolean") {
        resp.error = "invalid-response"; resp.errorCode = "invalid-response";
        resp.errorDetail = "The stronger model returned no verdict";
      }
      if (!resp.error) nsfwConfirmationSet(resp.sourceUrl, resp);
      delete resp.sourceUrl;
      finish(resp);
    });
  });
}

function releaseNsfwImage(m, sendResponse) {
  var snapshotId = String(m.snapshotId || "");
  if (snapshotId) releaseNsfwSnapshot(snapshotId);
  if (typeof sendResponse === "function") sendResponse({ ok: true });
}
