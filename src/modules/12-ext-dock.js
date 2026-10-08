/* ── 12-ext-dock.js: dock the Extensions button inside the address field ──
   The Tools sidebar toggle and panel helpers that used to live in 09-sidebar.js
   were archived (_old/archive/sidebar-tools/RESTORE.md). */
(function () {
  'use strict';

  function ensureExtDocked() {
    var field = document.querySelector('.toolbar-mainbar > .UrlBar-AddressField');
    if (!field) return;
    var ext = document.querySelector('.toolbar-extensions');
    if (!ext) {
      ext = document.createElement('div');
      ext.className = 'toolbar-extensions atlas-ext-docked';
      field.appendChild(ext);
    } else {
      if (ext.parentElement !== field || field.lastElementChild !== ext) {
        field.appendChild(ext);
      }
      ext.classList.add('atlas-ext-docked');
    }

    // Ensure puzzle button is present even if 0 extensions are installed
    var nativeBtn = ext.querySelector('button:not(.atlas-fallback-ext-btn)');
    var fallbackBtn = ext.querySelector('.atlas-fallback-ext-btn');
    if (nativeBtn) {
      if (fallbackBtn) fallbackBtn.remove();
    } else if (!fallbackBtn) {
      var btn = document.createElement('button');
      btn.className = 'button-toolbar ExtensionToggleIcon atlas-fallback-ext-btn';
      btn.setAttribute('data-name', 'Extensions');
      btn.setAttribute('title', 'Extensions');
      btn.setAttribute('tabindex', '-1');
      btn.setAttribute('type', 'button');
      btn.innerHTML = '<span class="button-icon">' +
        '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M20.5 11H19V7a2 2 0 0 0-2-2h-4V3.5a2.5 2.5 0 0 0-5 0V5H4a2 2 0 0 0-2 2v3.8h1.5a2.5 2.5 0 0 1 0 5H2V20a2 2 0 0 0 2 2h3.8v-1.5a2.5 2.5 0 0 1 5 0V22H17a2 2 0 0 0 2-2v-4h1.5a2.5 2.5 0 0 0 0-5z"/>' +
        '</svg>' +
        '</span>';
      ext.appendChild(btn);
    }
  }

  var _dockMutating = false;
  var _dockRafScheduled = false;

  function runDocking() {
    if (_dockMutating) return;
    _dockMutating = true;
    try {
      ensureExtDocked();
    } finally {
      _dockMutating = false;
    }
  }

  runDocking();

  var bar = document.querySelector('.toolbar-mainbar');
  if (bar && typeof MutationObserver !== 'undefined') {
    new MutationObserver(function () {
      if (_dockMutating || _dockRafScheduled) return;
      _dockRafScheduled = true;
      requestAnimationFrame(function () {
        _dockRafScheduled = false;
        runDocking();
      });
    }).observe(bar, { childList: true });
  }

  var _dockAttempts = 0;
  var _dockTimer = setInterval(function () {
    _dockAttempts++;
    runDocking();
    if (_dockAttempts > 30) clearInterval(_dockTimer);
  }, 1000);
})();
