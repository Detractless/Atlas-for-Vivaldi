/* Atlas page keyboard shortcuts: double-tap modifier gestures for browser navigation. */
(function () {
  'use strict';
  function send(msg) {
    try { chrome.runtime.sendMessage({ atlas: msg }); } catch (e) { /* extension reloaded since this page loaded: nothing to tell */ }
  }
/* Double-tap Command is owned by the native browser listener on macOS.
     The legacy Control double tap remains on Windows.
     Command -> Comma (<) twice navigates back.
     Command -> Period (>) twice navigates forward.
     Command -> Space twice opens a new tab.
     Command -> Delete (Backspace) twice closes current tab.
     Command -> Left / Right arrow twice moves to previous / next tab. */
  var _lastTabModDown = 0;
  var _tabNavPending = null;
  var _tabNavPendingUntil = 0;
  var _tabNavLeaderUntil = 0;
  var _tabSwallowKey = null;
  var _tabSpacePending = false;
  var _tabSpacePendingUntil = 0;
  
  function isTabMod(e) {
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
  function swallowEvent(e) {
    e.preventDefault();
    if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
    else if (typeof e.stopPropagation === 'function') e.stopPropagation();
  }
  
  function resetTabShortcuts() {
    _lastTabModDown = 0;
    _tabNavLeaderUntil = 0;
    _tabNavPending = null;
    _tabNavPendingUntil = 0;
    _tabSpacePending = false;
    _tabSpacePendingUntil = 0;
  }
  
  window.addEventListener('blur', resetTabShortcuts);
  chrome.runtime.onMessage.addListener(function (msg) {
    if (msg && msg.atlasResetShortcuts === true) { resetTabShortcuts(); _tabSwallowKey = null; }
  });
  
  function handleTabSpace(e, now) {
    if (!isSpaceKey(e)) return false;
    if (_tabSpacePending && _tabSpacePendingUntil > now) {
      swallowEvent(e);
      _tabSwallowKey = 'Space';
      resetTabShortcuts();
      send({ act: 'tab-new' });
      return true;
    }
    if (_tabNavLeaderUntil > now && !_tabNavPending) {
      swallowEvent(e);
      _tabSwallowKey = 'Space';
      _tabSpacePending = true;
      _tabSpacePendingUntil = now + 2000;
      _tabNavLeaderUntil = 0;
      _lastTabModDown = 0;
      return true;
    }
    return false;
  }
  
  function getTabNavAction(e) {
    if (isBackKey(e)) return 'navigate-back';
    if (isForwardKey(e)) return 'navigate-forward';
    if (isDeleteKey(e)) return 'tab-close';
    if (isArrowLeft(e)) return 'tab-prev';
    if (isArrowRight(e)) return 'tab-next';
    return null;
  }
  
  function handleTabNav(e, now) {
    var act = getTabNavAction(e);
    if (!act) return false;
    if (_tabNavLeaderUntil > now && !_tabNavPending && !_tabSpacePending) {
      swallowEvent(e);
      _tabSwallowKey = e.code || e.key;
      _tabNavPending = act;
      _tabNavPendingUntil = now + 2000;
      _tabNavLeaderUntil = 0;
      _lastTabModDown = 0;
      return true;
    }
    if (_tabNavPending && _tabNavPendingUntil > now) {
      if (_tabNavPending === act) {
        swallowEvent(e);
        _tabSwallowKey = e.code || e.key;
        var pAct = _tabNavPending;
        resetTabShortcuts();
        send({ act: pAct });
        return true;
      }
      swallowEvent(e);
      _tabSwallowKey = e.code || e.key;
      _tabNavPending = act;
      _tabNavPendingUntil = now + 2000;
      return true;
    }
    return false;
  }
  
  window.addEventListener('keydown', function (e) {
    var now = Date.now();
    if (isTabMod(e)) {
      if (e.repeat) return;
      var wasDown = _lastTabModDown;
      resetTabShortcuts();
      if (e.key === 'Control' && wasDown && now - wasDown < 450) {
        send({ act: 'focus-addressbar' });
      } else {
        _lastTabModDown = now;
        _tabNavLeaderUntil = now + 2000;
      }
      return;
    }
    if (handleTabSpace(e, now)) return;
    if (handleTabNav(e, now)) return;
    resetTabShortcuts();
  }, true);
  
  function isSwallowed(e) {
    return _tabSwallowKey && (e.code === _tabSwallowKey || e.key === _tabSwallowKey ||
      isBackKey(e) || isForwardKey(e) || isSpaceKey(e) || isDeleteKey(e) || isArrowLeft(e) || isArrowRight(e));
  }
  
  window.addEventListener('keypress', function (e) {
    if (isSwallowed(e)) swallowEvent(e);
  }, true);
  
  window.addEventListener('keyup', function (e) {
    if (isSwallowed(e)) {
      swallowEvent(e);
      _tabSwallowKey = null;
    }
  }, true);
})();
