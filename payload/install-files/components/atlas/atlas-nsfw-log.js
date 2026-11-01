/* Quiet during browsing. Enable detailed troubleshooting with
   chrome.storage.local.set({nsfwDebugLog:'verbose'}); false disables it.
   Legacy true no longer enables continuous logging. */
(function () {
  'use strict';
  if (window.__atlasNsfwLog) return;

  var RING_MAX = 500;
  var _on = false;   /* Detailed traces require explicit troubleshooting mode. */
  var _ring = [];
  var _errors = new Set();
  var _counters = Object.create(null);

  /* Same two-lane digest idea as the verdict cache: an identity without the URL. */
  function digest(url) {
    var h1 = 0x811c9dc5, h2 = 0x9e3779b9, i, c;
    url = String(url);
    for (i = 0; i < url.length; i++) {
      c = url.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 16777619);
      h2 = Math.imul(h2 ^ c, 2246822507);
    }
    return ((h1 >>> 0).toString(16) + '00000000').slice(0, 8) +
      ((h2 >>> 0).toString(16) + '00000000').slice(0, 8);
  }

  function loggable(value) {
    if (value === null || value === undefined || typeof value !== 'object') return value;
    var out = {}, k, v;
    for (k in value) {
      out[k] = (k === 'url') ? (v = String(value[k]).slice(0, 32) + '#' + digest(value[k])) : value[k];
    }
    return out;
  }

  function retryErrorData(value) {
    value = value && typeof value === 'object' ? value : {};
    var code = String(value.errorCode || value.reason || 'retry-failed').toLowerCase();
    if (!/^[a-z0-9-]{1,48}$/.test(code)) code = 'retry-failed';
    var detail = String(value.errorDetail || '').replace(/(?:https?|chrome-extension|blob|data):[^\s"'<>]+/gi, '[resource]')
      .replace(/[\u0000-\u001f]+/g, ' ').slice(0, 180);
    return { kind: 'img', stage: 'strong', model: 'freepik-448-fp16', errorCode: code, errorDetail: detail };
  }

  window.__atlasNsfwLog = function (event, data) {
    if (event === 'retry.error') data = retryErrorData(data);
    if (!_on) {
      if (event === 'retry.error') {
        if (_ring.length >= 50) _ring.shift();
        _ring.push({ at: new Date().toISOString().slice(11, 23), event: event, data: data });
        console.warn('[atlas-nsfw]', event, data);
        queueRetryError(data);
        return;
      }
      if (event !== 'ui.error' && event !== 'fail' && !(data && data.error)) return;
      var reason = event + ':' + (data && (data.reason || data.errorCode || data.error) || 'unknown');
      if (_errors.has(reason)) return;
      if (_errors.size >= 50) _errors.clear();
      _errors.add(reason);
      data = loggable(data) || {};
      if (_ring.length >= 50) _ring.shift();
      _ring.push({ at: new Date().toISOString().slice(11, 23), event: event, data: data });
      console.warn('[atlas-nsfw]', event, data); return;
    }
    data = loggable(data) || {};
    var group = String(event).split('.')[0];
    bump(group, data.reason || data.action || data.srcKind || data.kind || '-');
    if (_ring.length >= RING_MAX) _ring.shift();
    _ring.push({ at: new Date().toISOString().slice(11, 23), event: event, data: data });
    console.debug('[atlas-nsfw]', event, data);
    if (event === 'retry.error') queueRetryError(data);
    else queue(event, data);
  };

  /* The bridge keeps the last 500 events in chrome.storage.local.nsfwDebugEvents
     so they can be read from disk without opening DevTools. Events go in
     batches; the page is named by host only. */
  var OUTBOX_MAX = 200;
  var _outbox = [];
  var _flushTimer = 0;
  var _page = (window.location && window.location.hostname) || '';
  var _top = false;
  try { _top = window.top === window; } catch (e) { void e; }

  function queue(event, data) {
    if (_outbox.length >= OUTBOX_MAX) {
      if (_flushTimer) { clearTimeout(_flushTimer); _flushTimer = 0; }
      flush();
    }
    _outbox.push({ t: new Date().toISOString(), page: _page, top: _top, event: event, data: data });
    if (!_flushTimer) _flushTimer = setTimeout(flush, 1500);
  }

  function queueRetryError(data) {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) return;
    try {
      chrome.runtime.sendMessage({ atlas: { act: 'nsfw-debug-log', events: [{
        t: new Date().toISOString(), event: 'retry.error', data: retryErrorData(data)
      }] } }, function () { void chrome.runtime.lastError; });
    } catch (e) { void e; }
  }

  function flush() {
    _flushTimer = 0;
    if (!_outbox.length || typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) return;
    var batch = _outbox;
    _outbox = [];
    try {
      chrome.runtime.sendMessage({ atlas: { act: 'nsfw-debug-log', events: batch } }, function () {
        void chrome.runtime.lastError;
      });
    } catch (e) {
      void e;   /* extension context gone (reload): drop the batch */
    }
  }

  if (window.addEventListener) window.addEventListener('pagehide', flush);

  function bump(group, key) {
    var g = _counters[group] || (_counters[group] = Object.create(null));
    g[key] = (g[key] || 0) + 1;
  }

  /* Shared trace helpers for the guard. When the toggle is off every one of
     these is a cheap no-op, so the guard pays nothing for shipping them. */
  window.__atlasNsfwTrace = {
    log: function (event, data) {
      try {
        if (window.__atlasNsfwLog) window.__atlasNsfwLog(event, data);
      } catch (e) {
        void e;   /* debugging must never break shielding */
      }
    },
    kind: function (url) {
      if (!url || !url.startsWith) return 'none';
      if (url.startsWith('data:')) return url.startsWith('data:image/svg') ? 'svg' : 'data';
      if (url.startsWith('blob:')) return 'blob';
      if (url.startsWith('http')) return 'http';
      return 'other';
    },
    fail: function (meta, kind) {
      if (!meta || !meta.error) return '';
      var err = String(meta.error);
      if (err === 'detector-timeout') return 'detectorTimeout';
      if (err === 'detector-unavailable') return 'detectorUnavailable';
      if (kind === 'blob') return 'blobUnfetchable';
      return 'detectorError';
    },
    verdict: function (kind, url, isNsfw, meta) {
      window.__atlasNsfwLog('verdict', { kind: kind, srcKind: this.kind(url), isNsfw: isNsfw, url: url,
        score: meta && isFinite(meta.score) ? meta.score : undefined, threshold: meta && meta.threshold,
        source: meta && meta.source, reason: this.fail(meta, this.kind(url)) || undefined,
        error: meta && meta.error ? String(meta.error) : undefined, status: meta && meta.status,
        requestId: meta && meta.requestId });
    }
  };

  /* Reader for the console: __atlasNsfwDebugSummary() → {counters, events}. */
  window.__atlasNsfwDebugSummary = function () {
    return { counters: _counters, events: _ring.slice() };
  };

  function refresh(items) {
    _on = !!(items && items.nsfwDebugLog === 'verbose');
  }

  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(['nsfwDebugLog'], function (items) {
      void chrome.runtime.lastError;
      refresh(items);
    });
    if (chrome.storage.onChanged && chrome.storage.onChanged.addListener) {
      chrome.storage.onChanged.addListener(function (changes, area) {
        if (area === 'local' && changes.nsfwDebugLog) {
          refresh({ nsfwDebugLog: changes.nsfwDebugLog.newValue });
        }
      });
    }
  }
})();
