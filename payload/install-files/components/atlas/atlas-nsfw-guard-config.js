/* Atlas content shield settings and the early style that hides media until its verdict arrives. */
(function () {
  'use strict';

  var HIDE_STYLE_ID = 'atlas-nsfw-pending-hide';

  function injectPreHideStyle() {
    if (document.getElementById(HIDE_STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = HIDE_STYLE_ID;
    style.textContent = 'img:not([data-nsfw-filter-status]),img[data-nsfw-filter-status="processing"],video:not([data-nsfw-filter-status]),video[data-nsfw-filter-status="processing"]{visibility:hidden !important}';
    if (document.documentElement) document.documentElement.appendChild(style);
  }

  function removePreHideStyle() {
    var el = document.getElementById(HIDE_STYLE_ID);
    if (el) el.remove();
  }

  function start(config, startObserver, revealAll) {
    function fetchConfig() {
      if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.sync) return;
      chrome.storage.sync.get(['nsfwAction'], function (items) {
        if (!items) return;
        config.action = items.nsfwAction || 'off';
        if (config.action !== 'off' && config.action !== 'blur' && config.action !== 'blackout') {
          config.action = 'blur';
        }
        config.enabled = config.action !== 'off';
        if (config.enabled) {
          injectPreHideStyle();
          startObserver();
        } else {
          revealAll();
        }
      });
    }

    fetchConfig();
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener(function (changes, area) {
        if (area === 'sync' && changes.nsfwAction) fetchConfig();
      });
    }
  }

  window.__atlasNsfwGuardConfig = { start: start, removePreHideStyle: removePreHideStyle };
})();
