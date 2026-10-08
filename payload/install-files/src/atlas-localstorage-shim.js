/* Atlas shim: Vivaldi's UI extension origin exposes window.localStorage as
   null, which crashes code that reads it (Detractless does, during its
   IndexedDB upgrade). Install a synchronous, persistent replacement backed by
   chrome.storage.local. Must run before any other script. */
(function () {
  'use strict';
  if (window.localStorage) { window.__atlasStorageReady = Promise.resolve(); return; }

  /* Resolves once the persisted map has loaded from chrome.storage.local.
     Detractless's preinit scripts read localStorage SYNCHRONOUSLY before
     first paint (_themeCache/_scaleCache); at that moment this map is still
     empty, so atlas-preinit-bridge.js waits on this promise and re-applies
     the caches under the preinit page hold — that is the theme/scale flash
     fix. */
  var readyResolve;
  window.__atlasStorageReady = new Promise(function (res) { readyResolve = res; });

  var KEY = '__atlas_localstorage__';
  var map = Object.create(null);

  function persist() {
    try { chrome.storage.local.set({ [KEY]: map }); } catch (e) { console.warn('[Atlas] localStorage shim: could not save', e); }
  }

  var storage = {
    getItem: function (k) {
      k = String(k);
      return Object.prototype.hasOwnProperty.call(map, k) ? map[k] : null;
    },
    setItem: function (k, v) { map[String(k)] = String(v); persist(); },
    removeItem: function (k) { delete map[String(k)]; persist(); },
    clear: function () { map = Object.create(null); persist(); },
    key: function (i) { var ks = Object.keys(map); return i >= 0 && i < ks.length ? ks[i] : null; }
  };
  Object.defineProperty(storage, 'length', { get: function () { return Object.keys(map).length; } });

  try {
    Object.defineProperty(window, 'localStorage', { value: storage, configurable: true });
  } catch (e) {
    window.localStorage = storage;
  }

  try {
    chrome.storage.local.get(KEY, function (got) {
      var saved = got && got[KEY];
      if (saved && typeof saved === 'object') {
        for (var k in saved) {
          if (!Object.prototype.hasOwnProperty.call(map, k)) map[k] = String(saved[k]);
        }
      }
      readyResolve();
    });
  } catch (e) { readyResolve(); }
})();
