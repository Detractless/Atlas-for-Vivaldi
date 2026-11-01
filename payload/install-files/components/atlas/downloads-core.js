/* ── downloads-core.js: what the Downloads panel says about each download ──────
   Pure logic, no page: the words, dates and grouping of Chromium's own
   chrome://downloads page, worked out from chrome.downloads items. The panel
   (downloads-panel.js) draws them; tests/unit/downloads_core.test.js checks them.
   Loaded as a plain script (window.AtlasDownloadsCore) or required by node. ── */
(function () {
  'use strict';

  var DAY = 86400000;
  var UNITS = ['B', 'kB', 'MB', 'GB', 'TB'];

  /* Chromium's failure wording, by chrome.downloads error code. */
  var ERRORS = {
    FILE_ACCESS_DENIED: 'No permission', FILE_NO_SPACE: 'Disk is full', FILE_NAME_TOO_LONG: 'File name too long',
    FILE_TOO_LARGE: 'File too large', FILE_VIRUS_INFECTED: 'Virus detected', FILE_TRANSIENT_ERROR: 'System busy',
    FILE_BLOCKED: 'Blocked', FILE_SECURITY_CHECK_FAILED: 'Virus scan failed', FILE_TOO_SHORT: 'File incomplete',
    FILE_SAME_AS_SOURCE: 'File is the same as the source', NETWORK_FAILED: 'Network error',
    NETWORK_TIMEOUT: 'Network timeout', NETWORK_DISCONNECTED: 'Network disconnected',
    NETWORK_SERVER_DOWN: 'Server unavailable', NETWORK_INVALID_REQUEST: 'Invalid request',
    SERVER_FAILED: 'Server problem', SERVER_NO_RANGE: 'Server problem', SERVER_BAD_CONTENT: 'File not found',
    SERVER_UNAUTHORIZED: 'Unauthorized', SERVER_CERT_PROBLEM: 'Certificate problem', SERVER_FORBIDDEN: 'Forbidden',
    SERVER_UNREACHABLE: 'Server unreachable', SERVER_CONTENT_LENGTH_MISMATCH: 'File incomplete',
    SERVER_CROSS_ORIGIN_REDIRECT: 'Redirected', USER_SHUTDOWN: 'Shutdown', CRASH: 'Crashed',
  };

  function formatBytes(n) {
    n = Math.max(0, Number(n) || 0);
    if (n < 1000) return n + ' B';
    var i = 0;
    while (n >= 1000 && i < UNITS.length - 1) { n /= 1000; i++; }
    return (n >= 100 ? Math.round(n) : Math.round(n * 100) / 100) + ' ' + UNITS[i];
  }

  function formatTimeLeft(seconds) {
    seconds = Math.max(0, Math.round(seconds));
    if (seconds < 60) return seconds + (seconds === 1 ? ' sec' : ' secs');
    var m = Math.round(seconds / 60);
    if (m < 60) return m + (m === 1 ? ' min' : ' mins');
    var h = Math.round(seconds / 3600);
    return h + (h === 1 ? ' hour' : ' hours');
  }

  function fileName(item) {
    var path = item.filename || '';
    var name = path.split(/[\\/]/).pop();
    if (name) return name;
    try { return decodeURIComponent(new URL(item.finalUrl || item.url).pathname.split('/').pop()) || item.url; } catch (e) { return item.url || ''; }
  }

  function startOfDay(t) { var d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); }

  /* "Today", "Yesterday", then "October 29, 2026" - the headings on Chromium's page. */
  function dayLabel(time, now) {
    var diff = Math.round((startOfDay(now) - startOfDay(time)) / DAY);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Yesterday';
    return new Date(time).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  }

  function startTime(item) { return Date.parse(item.startTime) || 0; }

  /* Newest first, one group per day. */
  function groupByDay(items, now) {
    var sorted = items.slice().sort(function (a, b) { return startTime(b) - startTime(a) || b.id - a.id; });
    var groups = [], last = null;
    sorted.forEach(function (item) {
      var label = dayLabel(startTime(item), now);
      if (!last || last.label !== label) { last = { label: label, items: [] }; groups.push(last); }
      last.items.push(item);
    });
    return groups;
  }

  /* A search is split into words, with "quoted phrases" kept whole. */
  function searchTerms(query) {
    var terms = [];
    String(query || '').split(/"([^"]*)"/).forEach(function (part, i) {
      (i % 2 ? [part] : part.split(/\s+/)).forEach(function (t) { t = t.trim().toLowerCase(); if (t) terms.push(t); });
    });
    return terms;
  }

  function matches(item, query) {
    var terms = searchTerms(query);
    var hay = (fileName(item) + ' ' + (item.finalUrl || item.url || '')).toLowerCase();
    return terms.every(function (t) { return hay.indexOf(t) !== -1; });
  }

  function origin(item) {
    var u = item.finalUrl || item.url || '';
    if (!/^https?:/i.test(u)) return '';
    try { return new URL(u).origin; } catch (e) { return ''; }
  }

  function progress(item) {
    if (item.state !== 'in_progress') return null;
    var total = item.totalBytes > 0 ? item.totalBytes : 0;
    return { value: total ? Math.min(1, item.bytesReceived / total) : 0, indeterminate: !total };
  }

  function activeText(item, now) {
    var got = item.bytesReceived || 0, total = item.totalBytes > 0 ? item.totalBytes : 0;
    if (item.paused) return total ? formatBytes(got) + ' of ' + formatBytes(total) + ', Paused' : 'Paused';
    if (!total) return formatBytes(got);
    var elapsed = (now - startTime(item)) / 1000, rate = elapsed > 0 ? got / elapsed : 0;
    var left = rate > 0 ? ', ' + formatTimeLeft((total - got) / rate) + ' left' : '';
    return formatBytes(got) + ' of ' + formatBytes(total) + left;
  }

  /* Everything the card shows besides the file name and icon.
     active: a white card; otherwise the grey, struck-through one. */
  function describe(item, now) {
    var out = { active: true, tag: '', text: '', from: origin(item), by: item.byExtensionName || '', progress: progress(item) };
    if (out.by) out.from = '';
    if (item.state === 'in_progress') { out.text = activeText(item, now); out.from = ''; return out; }
    if (item.state === 'interrupted') {
      out.active = false;
      out.text = item.error === 'USER_CANCELED' ? 'Canceled' : 'Failed - ' + (ERRORS[item.error] || 'Download error');
      return out;
    }
    if (item.exists === false) { out.active = false; out.tag = 'Deleted'; }
    return out;
  }

  /* Which buttons a card offers: Chromium's quick actions plus pause/cancel/retry. */
  function actions(item) {
    var out = ['copy'];
    if (item.state === 'in_progress') {
      out.push(item.paused ? 'resume' : 'pause', 'cancel');
      return out;
    }
    if (item.state === 'interrupted') out.push(item.canResume ? 'resume' : 'retry');
    else if (item.exists !== false) out.push('show');
    out.push('remove');
    return out;
  }

  var api = { formatBytes: formatBytes, formatTimeLeft: formatTimeLeft, fileName: fileName, dayLabel: dayLabel,
    groupByDay: groupByDay, matches: matches, describe: describe, actions: actions };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else window.AtlasDownloadsCore = api;
})();
