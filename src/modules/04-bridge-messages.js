var _offscreenCreating = null;
function ensureOffscreenDoc(cb) {
  if (typeof chrome === "undefined" || !chrome.offscreen || !chrome.offscreen.createDocument) {
    if (typeof cb === "function") cb(false);
    return;
  }
  if (typeof chrome.runtime.getContexts === "function") {
    chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] }, function (ctxs) {
      if (ctxs && ctxs.length > 0) { if (typeof cb === "function") cb(true); return; }
      createOffscreen(cb);
    });
    return;
  }
  createOffscreen(cb);
}

function createOffscreen(cb) {
  if (_offscreenCreating) {
    _offscreenCreating.then(function () { if (typeof cb === "function") cb(true); });
    return;
  }
  _offscreenCreating = chrome.offscreen.createDocument({
    url: "components/atlas/nsfw/offscreen.html",
    reasons: ["DOM_SCRAPING"],
    justification: "Classify images with NSFWJS model"
  }).then(function () {
    _offscreenCreating = null;
    _nsfwSentSettings = null;
    if (typeof cb === "function") cb(true);
  }).catch(function (e) {
    _offscreenCreating = null;
    if (typeof cb === "function") cb(false);
  });
}

/* The Vivaldi UI extension does not carry the "offscreen" permission, so its
   page has no chrome.offscreen. The page and the detector share an origin, so a
   hidden iframe hosts the model instead. One window owns it through a
   localStorage lease; the other windows message it. */
var _detectorOwner = Math.random().toString(36).slice(2);
var _detectorLeaseKey = "atlas-nsfw-detector-owner";
var _detectorFrameId = "atlas-nsfw-detector";

function claimDetector(cb) {
  var lease = null;
  try { lease = JSON.parse(localStorage.getItem(_detectorLeaseKey) || "null"); } catch (e) { lease = null; }
  var now = Date.now();
  if (lease && lease.id !== _detectorOwner && now - (lease.ts || 0) < 20000) { cb(false); return; }
  try { localStorage.setItem(_detectorLeaseKey, JSON.stringify({ id: _detectorOwner, ts: now })); } catch (e) { void e; }
  cb(true);
}

function detectorFrame() {
  var f = document.getElementById(_detectorFrameId);
  if (f) return f;
  if (!document.body || !chrome.runtime.getURL) return null;
  f = document.createElement("iframe");
  f.id = _detectorFrameId;
  f.src = chrome.runtime.getURL("components/atlas/nsfw/offscreen.html");
  f.style.cssText = "position:fixed;left:-10000px;top:-10000px;width:320px;height:240px;border:0;opacity:0;pointer-events:none";
  document.body.appendChild(f);
  _nsfwSentSettings = null;
  setInterval(function () { claimDetector(function () { void 0; }); }, 5000);
  return f;
}

function ensureDetector(cb) {
  if (typeof chrome !== "undefined" && chrome.offscreen && chrome.offscreen.createDocument) {
    ensureOffscreenDoc(cb);
    return;
  }
  if (typeof document === "undefined" || !document.getElementById) { cb(false); return; }
  if (document.getElementById(_detectorFrameId)) { cb(true); return; }
  claimDetector(function (mine) {
    if (mine) detectorFrame();
    cb(true);
  });
}

var _nsfwSettings = { action: null };
var _nsfwSentSettings = null;
var _nsfwInFlight = new Map();

function readNsfwSettings() {
  if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.sync || !chrome.storage.sync.get) return;
  chrome.storage.sync.get(["nsfwAction"], function (r) {
    void chrome.runtime.lastError;
    _nsfwSettings.action = (r && r.nsfwAction) || "off";
  });
}

readNsfwSettings();
if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.onChanged && chrome.storage.onChanged.addListener) {
  chrome.storage.onChanged.addListener(function (ch, area) {
    if (area === "sync" && ch.nsfwAction) readNsfwSettings();
    if (area === "local" && ch.nsfwDebugLog && ch.nsfwDebugLog.newValue === false) {
      chrome.storage.local.remove("nsfwDebugEvents", function () { void chrome.runtime.lastError; });
    }
  });
}

/* Shield diagnostics on disk: 500 detailed events in verbose mode, or the last
   20 private retry-failure summaries in quiet mode. Batches append in order. */
var _nsfwLogChain = Promise.resolve();
function safeNsfwRetryEvent(e) {
  var d = e && e.data && typeof e.data === "object" ? e.data : {};
  var code = String(d.errorCode || "retry-failed").toLowerCase();
  if (!/^[a-z0-9-]{1,48}$/.test(code)) code = "retry-failed";
  var detail = String(d.errorDetail || "").replace(/(?:https?|chrome-extension|blob|data):[^\s"'<>]+/gi, "[resource]")
    .replace(/[\u0000-\u001f]+/g, " ").slice(0, 180);
  return { t: new Date().toISOString(), event: "retry.error", data: {
    kind: "img", stage: "strong", model: "freepik-448-fp16", errorCode: code, errorDetail: detail
  } };
}

function saveNsfwDebugEvents(events) {
  if (!Array.isArray(events) || !events.length || !chrome.storage || !chrome.storage.local) return;
  var batch = events.slice(0, 200).filter(function (e) { return e && typeof e === "object"; });
  _nsfwLogChain = _nsfwLogChain.then(function () {
    return new Promise(function (done) {
      chrome.storage.local.get(["nsfwDebugLog", "nsfwDebugEvents"], function (r) {
        void chrome.runtime.lastError;
        if (!r || r.nsfwDebugLog === false) return done();
        var verbose = r.nsfwDebugLog === "verbose";
        var accepted = verbose ? batch : batch.filter(function (e) { return e.event === "retry.error"; }).map(safeNsfwRetryEvent);
        if (!accepted.length) return done();
        var previous = r && Array.isArray(r.nsfwDebugEvents) ? r.nsfwDebugEvents : [];
        if (!verbose) previous = previous.filter(function (e) { return e && e.event === "retry.error"; }).map(safeNsfwRetryEvent);
        var kept = previous.concat(accepted).slice(verbose ? -500 : -20);
        chrome.storage.local.set({ nsfwDebugEvents: kept }, function () { void chrome.runtime.lastError; done(); });
      });
    });
  });
}

function ensureNsfwSettings() {
  var key = nsfwThreshold() + "|MobileNetV2_NSFWJS";
  if (_nsfwSentSettings === key) return;
  _nsfwSentSettings = key;
  chrome.runtime.sendMessage({ target: "offscreen", type: "SET_SETTINGS", filterThreshold: nsfwThreshold() }, function () {
    void chrome.runtime.lastError;
  });
}

function nsfwResponse(score, source) {
  return { isNsfw: nsfwVerdict(score), score: score,
    source: source, threshold: nsfwThreshold() };
}

function sendClassify(url, page, cb, attempt, shield, preparedId, forceFresh, requestId) {
  attempt = attempt || 0;
  ensureNsfwSettings();
  chrome.runtime.sendMessage({ target: "offscreen", type: "CLASSIFY", url: url, page: page, shield: shield === true, preparedId: preparedId || "", forceFresh: forceFresh === true, requestId: requestId }, function (resp) {
    var err = chrome.runtime.lastError;
    if ((err || resp === undefined) && attempt < 20) {
      setTimeout(function () { sendClassify(url, page, cb, attempt + 1, shield, preparedId, forceFresh, requestId); }, 250);
      return;
    }
    cb(resp || null);
  });
}

function classifyNsfwImage(m, sendResponse) {
  if (_nsfwSettings.action === "off") {
    if (typeof sendResponse === "function") sendResponse({ isNsfw: false });
    return;
  }
  var url = m.url || "";
  var cachedOut = m.forceFresh ? null : nsfwCachedVerdict(url);
  /* First-model flagged hits still need current pixels and an independent retry snapshot. */
  if (cachedOut && (cachedOut.confirmed || !m.shield || !cachedOut.isNsfw)) {
    if (typeof sendResponse === "function") sendResponse(cachedOut);
    return;
  }
  var flightKey = JSON.stringify([url, m.shield === true, m.shield ? String(m.requestId || "") : "", m.forceFresh === true]);
  var waiting = _nsfwInFlight.get(flightKey);
  if (waiting) {
    if (typeof sendResponse === "function") waiting.push(sendResponse);
    return;
  }
  waiting = [];
  _nsfwInFlight.set(flightKey, waiting);
  if (typeof sendResponse === "function") waiting.push(sendResponse);

  var finish = function (out) {
    _nsfwInFlight.delete(flightKey);
    for (var i = 0; i < waiting.length; i++) waiting[i](out);
  };

  ensureDetector(function (ok) {
    if (!ok) { finish({ isNsfw: false, error: "detector-unavailable" }); return; }
    sendClassify(url, m.page || "", function (resp) {
      if (!resp) { _nsfwSentSettings = null; finish({ isNsfw: false, error: "detector-timeout" }); return; }
      var out;
      if (typeof resp.score === "number" && isFinite(resp.score)) {
        nsfwCacheSet(url, resp.score);
        out = (!m.forceFresh && nsfwConfirmationResponse(url)) || nsfwResponse(resp.score, "detector");
      } else {
        out = { isNsfw: !!resp.result };
      }
      if (resp.shieldPreview) out.shieldPreview = resp.shieldPreview;
      if (resp.shieldWidth) out.shieldWidth = resp.shieldWidth;
      if (resp.shieldHeight) out.shieldHeight = resp.shieldHeight;
      if (resp.snapshotId) out.snapshotId = resp.snapshotId;
      if (resp.previewError) out.previewError = String(resp.previewError);
      if (resp.error) out.error = String(resp.error);
      if (resp.status) out.status = resp.status;
      finish(out);
    }, 0, m.shield === true, m.preparedId, m.forceFresh === true, m.requestId);
  });
}

/* ── 04-bridge-messages.js: acts on the messages the page context menu sends (and the new tab's right-click
   edits), and sends http://home to the Atlas new tab. ── */

function handleBridgeTabNav(m, sender) {
  var winId = (sender && sender.tab && typeof sender.tab.windowId === "number" && sender.tab.windowId >= 0) ? sender.tab.windowId : undefined;
  var myWin = (typeof window !== "undefined" && typeof window.vivaldiWindowId === "number" && window.vivaldiWindowId >= 0) ? window.vivaldiWindowId : undefined;
  if (winId !== undefined && myWin !== undefined && winId !== myWin) return;
  var q = typeof winId === "number" ? { windowId: winId } : { currentWindow: true };
  if (chrome.tabs && chrome.tabs.query && chrome.tabs.update) {
    chrome.tabs.query(q, function (ts) {
      if (!ts || ts.length <= 1) return;
      var cur = -1;
      for (var i = 0; i < ts.length; i++) {
        if (ts[i].active) { cur = i; break; }
      }
      if (cur === -1) return;
      var step = m.act === "tab-prev" ? -1 : 1;
      var next = (cur + step + ts.length) % ts.length;
      chrome.tabs.update(ts[next].id, { active: true });
    });
  }
}

function bridgeOwnWindow(sender) {
  var winId = sender && sender.tab && sender.tab.windowId;
  var myWin = typeof window !== "undefined" ? window.vivaldiWindowId : undefined;
  return !(typeof winId === "number" && typeof myWin === "number" && winId !== myWin);
}

function handleNsfwBridgeMessage(m, sender, sendResponse) {
  if (!bridgeOwnWindow(sender)) return;
  if (m.act === "nsfw-cancel-work") { cancelNsfwWork(m, sendResponse); return true; }
  if (m.act === "nsfw-cached-verdict") cachedNsfwImage(m, sendResponse);
  else if (m.act === "nsfw-prepare-shield") prepareNsfwImage(m, sendResponse);
  else if (m.act === "nsfw-release-prepared") {
    releasePreparedImage(m, sendResponse);
  }
  else if (m.act === "nsfw-classify") classifyNsfwImage(m, sendResponse);
  else if (m.act === "nsfw-retry") retryNsfwImage(m, sendResponse);
  else if (m.act === "nsfw-release-snapshot") releaseNsfwImage(m, sendResponse);
  else if (m.act === "nsfw-debug-log") saveNsfwDebugEvents(m.events);
  else return;
  return m.act !== "nsfw-debug-log";
}

if (chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    var m = msg && msg.atlas;
    if (!m) return;
    if (m.act === "opentab" && m.url) {
      var winId = (sender && sender.tab && sender.tab.windowId) || undefined;
      var myWin = (typeof window !== "undefined" && window.vivaldiWindowId) || undefined;
      if (winId && myWin && winId !== myWin) return;
      chrome.tabs.create({ url: m.url, active: m.active !== false, windowId: winId });
    } else if (m.act === "opentab-current" && m.url) {
      var tid = sender && sender.tab && sender.tab.id;
      if (tid) chrome.tabs.update(tid, { url: m.url });
      else chrome.tabs.update({ url: m.url });
    } else if (m.act === "ctxmenu-open") {
      if (typeof Atlas.closeUiMenu === "function") Atlas.closeUiMenu();
      if (typeof Atlas.closeMenu === "function") Atlas.closeMenu();
    } else if (m.act === "download" && m.url) {
      chrome.downloads.download({ url: m.url, saveAs: true }, function () { void chrome.runtime.lastError; });
    } else if (m.act === "savepage") {
      var u = m.url || (sender && sender.tab && sender.tab.url);
      if (u) chrome.downloads.download({ url: u, saveAs: true }, function () { void chrome.runtime.lastError; });
    } else if (m.act === "edit-open" && m.edit) {
      /* Right-click on the new tab (a bookmark, a group, a page): the bar opens in the window that owns the tab. */
      var editWin = (sender && sender.tab && sender.tab.windowId) || undefined;
      var mineWin = (typeof window !== "undefined" && window.vivaldiWindowId) || undefined;
      if (editWin && mineWin && editWin !== mineWin) return;
      if (typeof Atlas.openEdit === "function") {
        Atlas.openEdit(m.edit);
        if (typeof sendResponse === "function") sendResponse({ ok: true });   // tells the tab it was handled; unanswered, it opens its own pop-up
      }
    } else if (m.act === "focus-addressbar") {
      var winId = (sender && sender.tab && typeof sender.tab.windowId === "number" && sender.tab.windowId >= 0) ? sender.tab.windowId : undefined;
      var myWin = (typeof window !== "undefined" && typeof window.vivaldiWindowId === "number" && window.vivaldiWindowId >= 0) ? window.vivaldiWindowId : undefined;
      if (winId !== undefined && myWin !== undefined && winId !== myWin) return;
      /* Ignore an old page script while the native listener owns this gesture. */
      if (!Atlas.nativeCommandTapsEnabled && typeof Atlas.focusAddressBar === "function") Atlas.focusAddressBar(true);
    } else if (m.act === "navigate-back") {
      var tid = sender && sender.tab && sender.tab.id;
      if (tid && chrome.tabs && chrome.tabs.goBack) {
        chrome.tabs.goBack(tid);
      } else if (typeof Atlas.navigateBack === "function") {
        Atlas.navigateBack();
      }
    } else if (m.act === "navigate-forward") {
      var tid = sender && sender.tab && sender.tab.id;
      if (tid && chrome.tabs && chrome.tabs.goForward) {
        chrome.tabs.goForward(tid);
      } else if (typeof Atlas.navigateForward === "function") {
        Atlas.navigateForward();
      }
    } else if (m.act === "tab-new") {
      var winId = (sender && sender.tab && typeof sender.tab.windowId === "number" && sender.tab.windowId >= 0) ? sender.tab.windowId : undefined;
      var myWin = (typeof window !== "undefined" && window.vivaldiWindowId) || undefined;
      if (winId !== undefined && myWin !== undefined && winId !== myWin) return;
      var opts = { url: ATLAS_NEWTAB_URL };
      if (typeof winId === "number") opts.windowId = winId;
      if (chrome.tabs && chrome.tabs.create) {
        chrome.tabs.create(opts);
      }
    } else if (m.act === "tab-close") {
      var tid = sender && sender.tab && sender.tab.id;
      if (tid && chrome.tabs && chrome.tabs.remove) {
        chrome.tabs.remove(tid, function () { void chrome.runtime.lastError; });
      } else if (typeof Atlas.closeCurrentTab === "function") {
        Atlas.closeCurrentTab();
      }
    } else if (m.act === "tab-prev" || m.act === "tab-next") {
      handleBridgeTabNav(m, sender);
    } else if (typeof m.act === "string" && m.act.indexOf("nsfw-") === 0) {
      return handleNsfwBridgeMessage(m, sender, sendResponse);
    }
  });
}

/* The built-in history page stays native; only the home alias is redirected. */
if (chrome.tabs && chrome.tabs.onUpdated) {
  chrome.tabs.onUpdated.addListener(function (tabId, info) {
    if (!info.url) return;
    if (/^https?:\/\/home\/?$/.test(info.url)) {
      chrome.tabs.update(tabId, { url: EXT + "index.html" });
    }
  });
}
