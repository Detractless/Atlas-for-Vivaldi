/* ── 12-ext-dock.js: dock the Extensions button inside the address field ──
   The Tools sidebar toggle and panel helpers that used to live in 09-sidebar.js
   were archived (_old/archive/sidebar-tools/RESTORE.md). */
(function () {
  'use strict';

  function ensureExtDocked() {
    var field = document.querySelector('.toolbar-mainbar > .UrlBar-AddressField');
    if (!field) return;

    var allExts = document.querySelectorAll('.toolbar-extensions');
    if (!allExts || !allExts.length) return;

    // Locate the native container (preferring one with Vivaldi's native buttons)
    var nativeExt = null;
    var toRemove = [];

    for (var i = 0; i < allExts.length; i++) {
      var el = allExts[i];
      if (el.querySelector('button:not(.atlas-fallback-ext-btn)')) {
        if (!nativeExt) nativeExt = el;
        else toRemove.push(el);
      }
    }

    if (!nativeExt) {
      nativeExt = allExts[0];
      for (var j = 1; j < allExts.length; j++) {
        toRemove.push(allExts[j]);
      }
    } else {
      for (var k = 0; k < allExts.length; k++) {
        if (allExts[k] !== nativeExt && toRemove.indexOf(allExts[k]) === -1) {
          toRemove.push(allExts[k]);
        }
      }
    }

    for (var r = 0; r < toRemove.length; r++) {
      toRemove[r].remove();
    }

    if (nativeExt.parentElement !== field || field.lastElementChild !== nativeExt) {
      field.appendChild(nativeExt);
    }
    nativeExt.classList.add('atlas-ext-docked');

    var nativeBtn = nativeExt.querySelector('button:not(.atlas-fallback-ext-btn)');
    var fallbackBtn = nativeExt.querySelector('.atlas-fallback-ext-btn');
    if (nativeBtn && fallbackBtn) {
      fallbackBtn.remove();
    }
  }

  var _dockMutating = false;
  var _dockRafScheduled = false;

  function runDocking() {
    if (_dockMutating) return;
    _dockMutating = true;
    try {
      attachBarObserver();
      ensureExtDocked();
    } finally {
      _dockMutating = false;
    }
  }

  var _barObserver = null;
  function attachBarObserver() {
    if (_barObserver) return;
    var bar = document.querySelector('.toolbar-mainbar');
    if (bar && typeof MutationObserver !== 'undefined') {
      _barObserver = new MutationObserver(function () {
        if (_dockMutating || _dockRafScheduled) return;
        _dockRafScheduled = true;
        requestAnimationFrame(function () {
          _dockRafScheduled = false;
          runDocking();
        });
      });
      _barObserver.observe(bar, { childList: true });
    }
  }

  runDocking();

  var _dockAttempts = 0;
  var _dockTimer = setInterval(function () {
    _dockAttempts++;
    runDocking();
    if (_dockAttempts > 30) clearInterval(_dockTimer);
  }, 1000);
})();
