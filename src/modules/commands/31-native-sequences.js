/* Native key capture emits these menu events only after swallowing its two
   target taps. Keep actions within the owning window and original tab. */
(function () {
  'use strict';
  var Atlas = window.__Atlas;
  var api = window.vivaldi && window.vivaldi.menubar;
  if (!Atlas || Atlas.nativeSequencesEnabled || !api || !api.onActivated || !/Mac/.test(navigator.platform)) return;
  var owner = window.vivaldiWindowId, pending = null, generation = 0;
  function resetPage(id) {
    chrome.tabs.sendMessage(id, { atlasResetShortcuts: true }, function () { void chrome.runtime.lastError; });
  }
  function reset() {
    if (Atlas.resetCommandTaps) Atlas.resetCommandTaps();
    if (Atlas.resetUiShortcuts) Atlas.resetUiShortcuts();
  }
  function cancel() { pending = null; generation++; }
  function switchFrom(p, step) {
    chrome.tabs.query({ windowId: owner }, function (tabs) {
      if (p.generation !== generation || chrome.runtime.lastError || !tabs || tabs.length < 2) return;
      var at = -1;
      for (var i = 0; i < tabs.length; i++) if (tabs[i].id === p.tabId) { at = i; break; }
      if (at < 0) return;
      chrome.tabs.update(tabs[(at + step + tabs.length) % tabs.length].id, { active: true }, function () { void chrome.runtime.lastError; });
    });
  }
  function finish(p) {
    if (pending !== p || !p.ready || !p.action) return;
    pending = null;
    if (!Number.isInteger(p.tabId) || performance.now() - p.at > 4100) return;
    // Check again: a page/script may have changed tabs between the two taps.
    chrome.tabs.query({ active: true, windowId: owner }, function (tabs) {
      if (p.generation !== generation || chrome.runtime.lastError || !tabs || !tabs[0] || tabs[0].id !== p.tabId) return;
      if (p.action === 'ATLAS_SEQUENCE_NEW_TAB') chrome.tabs.create({ url: ATLAS_NEWTAB_URL, windowId: owner });
      else if (p.action === 'ATLAS_SEQUENCE_CLOSE_TAB') chrome.tabs.remove(p.tabId, function () { void chrome.runtime.lastError; });
      else if (p.action === 'ATLAS_SEQUENCE_NAV_BACK') chrome.tabs.goBack(p.tabId, function () { void chrome.runtime.lastError; });
      else if (p.action === 'ATLAS_SEQUENCE_NAV_FORWARD') chrome.tabs.goForward(p.tabId, function () { void chrome.runtime.lastError; });
      else switchFrom(p, p.action === 'ATLAS_SEQUENCE_TAB_PREV' ? -1 : 1);
    });
  }
  function activated(id, action) {
    if (id !== owner || typeof action !== 'string' || !/^ATLAS_SEQUENCE_(ACTIVITY|NEW_TAB|CLOSE_TAB|TAB_PREV|TAB_NEXT|NAV_BACK|NAV_FORWARD)$/.test(action)) return;
    reset();
    if (action === 'ATLAS_SEQUENCE_ACTIVITY') {
      cancel();
      var p = pending = { at: performance.now(), generation: generation, ready: false, action: null };
      chrome.tabs.query({ active: true, windowId: owner }, function (tabs) {
        if (pending !== p || chrome.runtime.lastError) return;
        p.ready = true; p.tabId = tabs && tabs[0] && tabs[0].id;
        if (Number.isInteger(p.tabId)) resetPage(p.tabId);
        finish(p);
      });
    } else if (pending) { pending.action = action; finish(pending); }
  }
  function tabChanged(info) { if (info.windowId === owner) cancel(); }
  function focusChanged(id) { if (id !== owner) cancel(); }
  function start(id) {
    if (Atlas.nativeSequencesEnabled || !Number.isInteger(id) || id < 0) return;
    Atlas.nativeSequencesEnabled = true;
    owner = id;
    Atlas.resetNativeSequencePage = function () {
      cancel();
      chrome.tabs.query({ active: true, windowId: owner }, function (tabs) {
        if (!chrome.runtime.lastError && tabs && tabs[0]) resetPage(tabs[0].id);
      });
    };
    api.onActivated.addListener(activated);
    chrome.tabs.onActivated.addListener(tabChanged);
    chrome.windows.onFocusChanged.addListener(focusChanged);
    chrome.runtime.sendMessage({ atlasNativeSequenceReady: true }, function () { void chrome.runtime.lastError; });
    window.addEventListener('unload', function () {
      cancel(); Atlas.nativeSequencesEnabled = false;
      delete Atlas.resetNativeSequencePage;
      api.onActivated.removeListener(activated);
      chrome.tabs.onActivated.removeListener(tabChanged);
      chrome.windows.onFocusChanged.removeListener(focusChanged);
    }, { once: true });
  }
  if (Number.isInteger(owner) && owner >= 0) start(owner);
  else chrome.windows.getCurrent(function (w) { if (!chrome.runtime.lastError && w) start(w.id); });
})();
