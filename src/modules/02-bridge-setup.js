/* ── 02-bridge-setup.js: Detractless runs inside this window. Stubs the three
   extension APIs this context lacks, seeds the settings the service worker
   reads, and loads the service-worker bundle as a script. ── */

/* ATLAS_EXT_ID comes from atlasKeys.json, written into atlas.js by bundle.py. */
var EXT = 'chrome-extension://' + ATLAS_EXT_ID + '/';

/* Detractless, integrated natively. Its runtime files are copied into
   this extension's root, so root-relative paths and runtime.getURL()
   resolve unchanged. Its service-worker bundle runs in this document;
   the three APIs this context lacks are stubbed first. */
if (!chrome.action) {
  chrome.action = {
    setTitle: function () {}, setIcon: function () {}, setBadgeText: function () {},
    onClicked: { addListener: function () {}, removeListener: function () {} }
  };
}
if (!chrome.sidePanel) {
  chrome.sidePanel = {
    setPanelBehavior: function () { return Promise.resolve(); },
    setOptions: function () { return Promise.resolve(); },
    open: function () { return Promise.resolve(); }
  };
}
if (!chrome.search) {
  chrome.search = {
    query: function (opts, cb) {
      var url = 'https://www.google.com/search?q=' + encodeURIComponent((opts && opts.text) || '');
      if (opts && opts.disposition === 'NEW_TAB') {
        chrome.tabs.create({ url: url });
      } else {
        chrome.tabs.query({ active: true, currentWindow: true }, function (ts) {
          if (ts && ts[0]) chrome.tabs.update(ts[0].id, { url: url });
          else chrome.tabs.create({ url: url });
        });
      }
      if (cb) cb();
      return Promise.resolve();
    }
  };
}

/* The bundle seeds its defaults inside chrome.runtime.onInstalled, which
   never fires here: nothing is being installed, the bundle is just loaded as
   a script. Unset keys then fall back silently ("showQueryOnDelay || false"
   in gate.bundle.js reads as off no matter what the settings UI shows), so
   do the same seeding explicitly, once. Existing values are never touched. */
(function seedDefaults() {
  var DEFAULTS = {
    tabLimit: 0,
    managementMethod: 'block',
    searchDelaySeconds: 0,
    showQueryOnDelay: true,
    customSearchEngines: {}
  };
  var keys = Object.keys(DEFAULTS);
  chrome.storage.sync.get(keys, function (got) {
    var add = {};
    keys.forEach(function (k) { if (got[k] === undefined) add[k] = DEFAULTS[k]; });
    if (Object.keys(add).length && chrome.storage.sync.set) {
      chrome.storage.sync.set(add, function () {
        console.log('[atlas] seeded Detractless defaults:', Object.keys(add).join(', '));
      });
    }
  });
  chrome.storage.local.get(['activeDelays'], function (got) {
    if (got && got.activeDelays === undefined && chrome.storage.local.set) {
      chrome.storage.local.set({ activeDelays: {} });
    }
  });
})();

(function () {
  if (typeof document === 'undefined' || !document.createElement) return;
  var s = document.createElement('script');
  s.src = 'src/dist/serviceWorker.bundle.js';
  s.onerror = function () { console.warn('[atlas] Detractless background failed to load'); };
  if (document.head && document.head.appendChild) document.head.appendChild(s);
})();
