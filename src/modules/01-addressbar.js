/* ── 01-addressbar.js: Address field focus blur release, blank new tab marker, spellcheck activation ── */

/* 1. Release the address field when focus leaves the browser UI.
      Clicking blank page area moves focus into the web content and the UI
      window fires `blur`; without this the field keeps :focus-within and
      stays visually expanded. */
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('blur', function () {
    var a = document.activeElement;
    if (a && a.closest &&
        a.closest('.UrlBar-AddressField, .UrlBar-SearchField, .SearchField')) {
      a.blur();
    }
  });
}

/* 2. Mark the window while the active tab is the Atlas new tab, so the
      stylesheet can keep the address field empty there and the address bar's
      engine button can show (19-addressbar-engine-picker.js). It is the
      active tab's address that tells; the field's text can be cleared or
      typed over, so it is only the fallback. Checked on tab changes. The new
      tab was atlas-blank.html once and is index.html now (ATLAS_NEWTAB_URL);
      until 2026-10-09 only the old name was checked, so the mark never came
      on and the new tab's extension address showed in the field. */
var NEWTAB_OLD = 'atlas-blank.html';

function atlasIsNewTabUrl(url) {
  var u = String(url || '');
  return u.indexOf(ATLAS_NEWTAB_URL) === 0 || u.indexOf(NEWTAB_OLD) !== -1;
}

function activateSpellcheck(input) {
  if (!input) return;
  if (!input.spellcheck || input.getAttribute('spellcheck') !== 'true') {
    input.spellcheck = true;
    input.setAttribute('spellcheck', 'true');
  }
}

function setNewTabClass(isNew) {
  var browser = document.getElementById ? document.getElementById('browser') : null;
  if (!browser || atlasMarked('atlas-newtab') === isNew) return;
  atlasMark('atlas-newtab', isNew);
  if (typeof abeNewTabChanged === 'function') abeNewTabChanged();
}

function syncNewTabClass() {
  var input = document.querySelector ? (document.querySelector('.UrlBar-UrlField.url') ||
              document.querySelector('.UrlBar-AddressField input')) : null;
  if (input) activateSpellcheck(input);
  var byField = function () { if (input) setNewTabClass(atlasIsNewTabUrl(input.value)); };
  if (!chrome.tabs || !chrome.tabs.query) return byField();
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    void chrome.runtime.lastError;
    var t = tabs && tabs[0];
    if (t && (t.pendingUrl || t.url)) setNewTabClass(atlasIsNewTabUrl(t.pendingUrl || t.url));
    else byField();
  });
}

if (chrome.tabs && chrome.tabs.onActivated) {
  chrome.tabs.onActivated.addListener(function () { setTimeout(syncNewTabClass, 50); });
}
if (chrome.tabs && chrome.tabs.onUpdated) {
  chrome.tabs.onUpdated.addListener(function (id, info) {
    if (info.status === 'complete' || info.url) setTimeout(syncNewTabClass, 50);
  });
}
setTimeout(syncNewTabClass, 500);

/* Activate spellcheck as soon as address field receives focus */
if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
  document.addEventListener('focusin', function (e) {
    var target = e.target;
    if (!target) return;
    if ((target.matches && target.matches('.UrlBar-AddressField input, .UrlBar-UrlField.url')) ||
        (target.closest && target.closest('.UrlBar-AddressField'))) {
      activateSpellcheck(target);
    }
  }, true);

  /* 3. Home button click handler: navigates active tab to Detractless home dashboard */
  document.addEventListener('click', function (e) {
    var homeBtn = e.target.closest && e.target.closest('button[data-name="Home"]');
    if (homeBtn) {
      e.preventDefault();
      e.stopPropagation();
      var homeUrl = ATLAS_NEWTAB_URL;
      if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.query) {
        chrome.tabs.query({ active: true, currentWindow: true }, function (ts) {
          if (ts && ts[0]) chrome.tabs.update(ts[0].id, { url: homeUrl });
          else if (chrome.tabs.create) chrome.tabs.create({ url: homeUrl });
        });
      }
    }
  }, true);

  /* 4. "home" keyword typed or empty Enter in address bar / search field navigates to home dashboard */
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter') return;
    var target = e.target;
    if (!target) return;
    var isField = (target.matches && target.matches('.UrlBar-AddressField input, .UrlBar-UrlField.url, .UrlBar-SearchField input, .SearchField input')) ||
                  (target.closest && target.closest('.UrlBar-AddressField, .UrlBar-SearchField, .SearchField'));
    if (!isField) return;
    var val = (target.value || '').trim().toLowerCase();
    if (val === 'home' || val === 'home/' || val === '') {
      e.preventDefault();
      e.stopPropagation();
      var homeUrl = ATLAS_NEWTAB_URL;
      if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.query) {
        chrome.tabs.query({ active: true, currentWindow: true }, function (ts) {
          if (ts && ts[0]) chrome.tabs.update(ts[0].id, { url: homeUrl });
          else if (chrome.tabs.create) chrome.tabs.create({ url: homeUrl });
        });
      }
      if (typeof target.blur === 'function') target.blur();
    }
  }, true);

  /* 5. Double-tap Command is owned by the native browser listener on macOS.
     The legacy Control double tap remains on Windows.
     Command -> Comma (<) twice navigates back.
     Command -> Period (>) twice navigates forward.
     Command -> Space twice opens a new tab.
     Command -> Delete (Backspace) twice closes current tab.
     Command -> Left / Right arrow twice moves to previous / next tab. */
  var _lastUiModDown = 0;
  var _uiNavPending = null;
  var _uiNavPendingUntil = 0;
  var _uiNavLeaderUntil = 0;
  var _uiSpacePending = false;
  var _uiSpacePendingUntil = 0;

  function isUiMod(e) {
    return e.key === 'Meta' || (e.key === 'Control' && /Win/.test(navigator.platform));
  }
  function isBackKey(e) {
    return e.key === ',' || e.key === '<' || e.code === 'Comma';
  }
  function isForwardKey(e) {
    return e.key === '.' || e.key === '>' || e.code === 'Period';
  }
  function isSpaceKey(e) {
    return e.code === 'Space' || e.key === ' ' || e.key === 'Spacebar';
  }
  function isDeleteKey(e) {
    return e.key === 'Backspace' || e.key === 'Delete' || e.code === 'Backspace' || e.code === 'Delete';
  }
  function isArrowLeft(e) {
    return e.key === 'ArrowLeft' || e.code === 'ArrowLeft';
  }
  function isArrowRight(e) {
    return e.key === 'ArrowRight' || e.code === 'ArrowRight';
  }

  function swallow(e) {
    e.preventDefault();
    if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
  }

  function resetUiShortcuts() {
    _lastUiModDown = 0;
    _uiNavLeaderUntil = 0;
    _uiNavPending = null;
    _uiNavPendingUntil = 0;
    _uiSpacePending = false;
    _uiSpacePendingUntil = 0;
  }

  Atlas.resetUiShortcuts = resetUiShortcuts;

  function handleUiSpace(e, now) {
    if (!isSpaceKey(e)) return false;
    if (_uiSpacePending && _uiSpacePendingUntil > now) {
      swallow(e);
      resetUiShortcuts();
      openNewTab();
      return true;
    }
    if (_uiNavLeaderUntil > now && !_uiNavPending) {
      swallow(e);
      _uiSpacePending = true;
      _uiSpacePendingUntil = now + 2000;
      _uiNavLeaderUntil = 0;
      _lastUiModDown = 0;
      return true;
    }
    return false;
  }

  function getNavAction(e) {
    if (isBackKey(e)) return 'back';
    if (isForwardKey(e)) return 'forward';
    if (isDeleteKey(e)) return 'close';
    if (isArrowLeft(e)) return 'tab-left';
    if (isArrowRight(e)) return 'tab-right';
    return null;
  }

  function handleUiNav(e, now) {
    var act = getNavAction(e);
    if (!act) return false;
    if (_uiNavLeaderUntil > now && !_uiNavPending && !_uiSpacePending) {
      swallow(e);
      _uiNavPending = act;
      _uiNavPendingUntil = now + 2000;
      _uiNavLeaderUntil = 0;
      _lastUiModDown = 0;
      return true;
    }
    if (_uiNavPending && _uiNavPendingUntil > now) {
      if (_uiNavPending === act) {
        swallow(e);
        var pDir = _uiNavPending;
        resetUiShortcuts();
        if (pDir === 'back') navigateBack();
        else if (pDir === 'forward') navigateForward();
        else if (pDir === 'close') closeCurrentTab();
        else if (pDir === 'tab-left') switchTab('left');
        else if (pDir === 'tab-right') switchTab('right');
        return true;
      }
      swallow(e);
      _uiNavPending = act;
      _uiNavPendingUntil = now + 2000;
      return true;
    }
    return false;
  }

  window.addEventListener('keydown', function (e) {
    var now = Date.now();
    if (isUiMod(e)) {
      if (e.repeat) return;
      var wasDown = _lastUiModDown;
      resetUiShortcuts();
      if (e.key === 'Control' && wasDown && now - wasDown < 450) {
        focusAddressBar();
      } else {
        _lastUiModDown = now;
        _uiNavLeaderUntil = now + 2000;
      }
      return;
    }
    if (handleUiSpace(e, now)) return;
    if (handleUiNav(e, now)) return;
    resetUiShortcuts();
  }, true);
}

function focusAddressBar(forceFocus) {
  var input = document.querySelector ? (document.querySelector('.toolbar-mainbar #urlFieldInput') ||
              document.getElementById('urlFieldInput') || document.querySelector('.UrlBar-UrlField.url') ||
              document.querySelector('.UrlBar-AddressField input')) : null;
  var active = typeof document !== 'undefined' ? document.activeElement : null;
  var isFocused = !forceFocus && active && (active === input || (active.closest && active.closest('.UrlBar-AddressField, .UrlBar-SearchField, .SearchField')));

  if (isFocused) {
    if (active && typeof active.blur === 'function') active.blur();
    if (input && typeof input.blur === 'function') input.blur();
    var webview = document.querySelector ? (document.querySelector('.webpageview.active webview') ||
                  document.querySelector('webview:not([tabindex="-1"])') ||
                  document.querySelector('webview')) : null;
    if (webview && typeof webview.focus === 'function') {
      try { webview.focus(); } catch (e) { /* webview may be unmounted or cross-process */ }
    }
  } else if (input) {
    input.focus();
    if (typeof input.select === 'function') input.select();
  }
}
Atlas.focusAddressBar = focusAddressBar;

function navigateBack() {
  if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.query) {
    chrome.tabs.query({ active: true, currentWindow: true }, function (ts) {
      if (ts && ts[0] && chrome.tabs.goBack) chrome.tabs.goBack(ts[0].id);
    });
  } else if (typeof history !== 'undefined' && history.back) {
    history.back();
  }
}

function navigateForward() {
  if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.query) {
    chrome.tabs.query({ active: true, currentWindow: true }, function (ts) {
      if (ts && ts[0] && chrome.tabs.goForward) chrome.tabs.goForward(ts[0].id);
    });
  } else if (typeof history !== 'undefined' && history.forward) {
    history.forward();
  }
}
Atlas.navigateBack = navigateBack;
Atlas.navigateForward = navigateForward;

function openNewTab() {
  if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.create) {
    chrome.tabs.create({ url: ATLAS_NEWTAB_URL });
  }
}

function closeCurrentTab() {
  if (typeof chrome !== 'undefined' && chrome.tabs) {
    chrome.tabs.query({ active: true, currentWindow: true }, function (ts) {
      if (ts && ts[0] && chrome.tabs.remove) chrome.tabs.remove(ts[0].id);
    });
  }
}
function switchTab(dir) {
  if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.query && chrome.tabs.update) {
    chrome.tabs.query({ active: true, currentWindow: true }, function (activeTabs) {
      var activeTab = activeTabs && activeTabs[0];
      chrome.tabs.query({ currentWindow: true }, function (ts) {
        if (!ts || ts.length <= 1) return;
        var cur = -1;
        for (var i = 0; i < ts.length; i++) {
          if (ts[i].active || (activeTab && ts[i].id === activeTab.id)) { cur = i; break; }
        }
        if (cur === -1) return;
        var step = dir === 'left' ? -1 : 1;
        var next = (cur + step + ts.length) % ts.length;
        chrome.tabs.update(ts[next].id, { active: true });
      });
    });
  }
}
Atlas.openNewTab = openNewTab;
Atlas.closeCurrentTab = closeCurrentTab;
Atlas.switchTab = switchTab;
