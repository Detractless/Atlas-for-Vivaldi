/* ── 29-nsfw-shield-prepare.js: gives each image a blurred checking surface
   before classification, then reuses its fetched bytes for the first pass. ── */

function sendPreparedShield(url, page, cb, attempt, forceFresh, requestId, priority) {
  attempt = attempt || 0;
  chrome.runtime.sendMessage({ target: "offscreen", type: "PREPARE_SHIELD", url: url, page: page, forceFresh: forceFresh === true, requestId: requestId, priority: priority }, function (resp) {
    var err = chrome.runtime.lastError;
    if ((err || resp === undefined) && attempt < 20) {
      setTimeout(function () { sendPreparedShield(url, page, cb, attempt + 1, forceFresh, requestId, priority); }, 250);
      return;
    }
    cb(resp || null);
  });
}

function cachedNsfwImage(m, sendResponse) {
  nsfwWhenStoreReady(function () {
    var verdict = m.forceFresh ? null : nsfwCachedVerdict(m.url || "");
    if (verdict && verdict.isNsfw && !verdict.confirmed) verdict = null;
    sendResponse({ verdict: verdict });
  });
}

function prepareNsfwImage(m, sendResponse) {
  var url = m.url || "";
  if (_nsfwSettings.action === "off") {
    if (typeof sendResponse === "function") sendResponse({ disabled: true });
    return;
  }
  var verdict = m.forceFresh ? null : nsfwCachedVerdict(url);
  if (verdict && !verdict.isNsfw) {
    if (typeof sendResponse === "function") sendResponse({ verdict: verdict });
    return;
  }
  ensureDetector(function (ok) {
    if (!ok) {
      if (typeof sendResponse === "function") sendResponse({ previewError: "detector-unavailable" });
      return;
    }
    sendPreparedShield(url, m.page || "", function (response) {
      if (response && verdict && verdict.confirmed) response.verdict = verdict;
      if (typeof sendResponse === "function") sendResponse(response || { previewError: "detector-timeout" });
    }, 0, m.forceFresh === true, m.requestId, m.priority);
  });
}

function releasePreparedImage(m, sendResponse) {
  var preparedId = String(m.preparedId || "");
  if (preparedId) {
    chrome.runtime.sendMessage({ target: "offscreen", type: "RELEASE_PREPARED", preparedId: preparedId }, function () {
      void chrome.runtime.lastError;
    });
  }
  if (typeof sendResponse === "function") sendResponse({ ok: true });
}

function cancelNsfwWork(m, sendResponse) {
  chrome.runtime.sendMessage({ target: "offscreen", type: "CANCEL_WORK", requestId: m.requestId }, function () { void chrome.runtime.lastError; });
  if (typeof sendResponse === "function") sendResponse({ ok: true });
}
