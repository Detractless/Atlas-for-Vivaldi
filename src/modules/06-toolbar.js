/* ── 06-toolbar.js: React fiber toolbar instance helper and toolbar button context menu ── */

function getToolbarInstance(el) {
  var candidates = [
    el,
    el && el.closest ? el.closest('.toolbar-mainbar, .toolbar-addressbar, .toolbar') : null,
    document.querySelector('.toolbar-mainbar')
  ].filter(Boolean);

  for (var i = 0; i < candidates.length; i++) {
    var n = candidates[i];
    for (var k in n) {
      if (k.indexOf('__reactFiber$') === 0) {
        var fiber = n[k];
        var depth = 0;
        while (fiber && depth < 30) {
          if (fiber.stateNode && typeof fiber.stateNode.editToolbar === 'function') {
            return fiber.stateNode;
          }
          fiber = fiber.return;
          depth++;
        }
      }
    }
  }
  return null;
}

document.addEventListener('contextmenu', function (e) {
  if (e.shiftKey) return;
  if (e.target.closest && e.target.closest('webview')) return;

  var tbEl = e.target.closest && e.target.closest('.toolbar-mainbar, .toolbar-addressbar, .button-toolbar');
  if (tbEl) {
    if (e.target.closest('.UrlBar-AddressField') || e.target.closest('.atlas-ext-popover')) return;
    var isExtBtn = e.target.closest('.toolbar-extensions button:not(.ExtensionToggleIcon)');
    if (isExtBtn) return;

    e.preventDefault(); e.stopImmediatePropagation();
    var bx = e.clientX, by = e.clientY;
    var inst = getToolbarInstance(tbEl);
    var btnWrap = e.target.closest('.button-toolbar');
    var btnName = null;
    if (btnWrap) {
      btnName = btnWrap.getAttribute('data-name');
      if (!btnName) {
        var innerBtn = btnWrap.querySelector('button[data-name], [data-name]');
        if (innerBtn) btnName = innerBtn.getAttribute('data-name');
      }
      if (!btnName && btnWrap.classList.contains('atlas-home-toggle')) {
        btnName = 'atlas-home-toggle';
      }
    }

    var items = [];
    if (btnWrap && btnName) {
      items.push({
        label: 'Remove from toolbar',
        run: function () {
          if (btnName === 'atlas-home-toggle') {
            btnWrap.style.display = 'none';
            try { sessionStorage.setItem('atlas_home_toggle_hidden', '1'); } catch (x) { /* no sessionStorage: hidden until the window reloads */ }
            return;
          }
          if (inst && inst.state && Array.isArray(inst.state.buttons)) {
            var idx = inst.state.buttons.findIndex(function (b) { return b.name === btnName; });
            if (idx > -1 && typeof inst.removeButton === 'function') {
              inst.removeButton(idx);
            }
          }
        }
      });
      items.push({ sep: true });
    }

    items.push({
      label: 'Customize toolbar…',
      run: function () {
        if (inst && typeof inst.editToolbar === 'function') {
          inst.editToolbar(inst.props.name || 'vivaldi.toolbars.navigation');
        }
      }
    });

    items.push({
      label: 'Reset toolbar to default',
      run: function () {
        if (inst && typeof inst.reset === 'function') {
          inst.reset();
        }
      }
    });

    if (typeof Atlas.showUiMenu === 'function') {
      Atlas.showUiMenu(bx, by, items);
    } else if (typeof showUiMenu === 'function') {
      showUiMenu(bx, by, items);
    }
    return;
  }
}, true);

/* ── Home Button Dynamic Placement ─────────────────────────────────────── */
var _homeMutating = false;
var _homeRafScheduled = false;

function ensureHomeButton() {
  try {
    if (sessionStorage.getItem('atlas_home_toggle_hidden') === '1') return false;
  } catch (x) { /* no sessionStorage: show the button */ }

  if (_homeMutating) return false;
  _homeMutating = true;
  try {
      var bar = document.querySelector('.toolbar-mainbar, .toolbar-addressbar');
      if (!bar) return false;

      var reloadBtn = bar.querySelector('button[data-name="Reload"]');
      var reloadWrap = reloadBtn ? (reloadBtn.closest('.button-toolbar') || reloadBtn) : null;
      var addr = bar.querySelector('.UrlBar-AddressField');

      var existing = bar.querySelector('.atlas-home-toggle, button[data-name="Home"]');
      if (existing) {
        var existingWrap = existing.closest('.button-toolbar') || existing;
        if (reloadWrap && reloadWrap.nextElementSibling !== existingWrap && reloadWrap !== existingWrap) {
          reloadWrap.insertAdjacentElement('afterend', existingWrap);
        } else if (!reloadWrap && addr && addr.previousElementSibling !== existingWrap && addr !== existingWrap) {
          bar.insertBefore(existingWrap, addr);
        }
        return true;
      }

      if (!reloadWrap && !addr) return false;

      var wrap = document.createElement('div');
      wrap.className = 'button-toolbar atlas-home-toggle';
      var btn = document.createElement('button');
      btn.className = 'ToolbarButton-Button';
      btn.type = 'button';
      btn.tabIndex = -1;
      btn.setAttribute('data-name', 'Home');
      btn.title = 'Home';
      btn.setAttribute('aria-label', 'Home');

      var icon = document.createElement('span');
      icon.className = 'button-icon';
      btn.appendChild(icon);
      wrap.appendChild(btn);

      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        var homeUrl = ATLAS_NEWTAB_URL;
        if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.query) {
          chrome.tabs.query({ active: true, currentWindow: true }, function (ts) {
            if (ts && ts[0]) chrome.tabs.update(ts[0].id, { url: homeUrl });
            else if (chrome.tabs.create) chrome.tabs.create({ url: homeUrl });
          });
        }
      });

      if (reloadWrap) {
        reloadWrap.insertAdjacentElement('afterend', wrap);
      } else if (addr) {
        bar.insertBefore(wrap, addr);
      } else {
        bar.appendChild(wrap);
      }
      return true;
    } finally {
      _homeMutating = false;
    }
  }

  ensureHomeButton();

  var _t04HomeAttempts = 0;
  var _t04Home = setInterval(function () {
    _t04HomeAttempts++;
    if (ensureHomeButton() || _t04HomeAttempts > 30) {
      clearInterval(_t04Home);
    }
  }, 500);

  var _mainbarForHome = document.querySelector('.toolbar-mainbar, .toolbar-addressbar');
  if (_mainbarForHome && typeof MutationObserver !== 'undefined') {
    new MutationObserver(function () {
      if (_homeMutating || _homeRafScheduled) return;
      _homeRafScheduled = true;
      requestAnimationFrame(function () {
        _homeRafScheduled = false;
        ensureHomeButton();
      });
    }).observe(_mainbarForHome, { childList: true });
  }

