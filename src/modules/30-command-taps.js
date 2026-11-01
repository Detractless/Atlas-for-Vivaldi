/* Native Command taps reach protected pages without injecting page scripts.
   The detector and bounded focus handoff were verified in the isolated probe. */
function createAtlasCommandTapDetector(options) {
  options = options || {};
  var now = options.now || function () { return performance.now(); };
  var interval = options.intervalMs || 450;
  var held = null, firstDown = null;

  function reset() { held = null; firstDown = null; }

  function feed(event) {
    if (!event || typeof event.down !== 'boolean' || !Number.isInteger(event.code) ||
        !Number.isInteger(event.modifiers) || event.afterGesture ||
        (options.windowId != null && event.windowId !== options.windowId)) {
      reset(); return false;
    }
    // macOS Chromium also reports right Command as legacy VKEY_APPS (93).
    // Require the Command flag so a bare context-menu key cannot activate it.
    var command = event.code === 91 || event.code === 92 || event.code === 93;
    var modifiers = event.modifiers & 15; // Shift=1, Control=2, Alt=4, Command=8.
    if (!command) { reset(); return false; }
    if (event.autoRepeat) return false;
    var time = now();
    if (event.down) {
      if (modifiers !== 8) { reset(); return false; }
      if (held) {
        if (held.code !== event.code) reset();
        return false;
      }
      held = { at: time, code: event.code };
      return false;
    }
    if (!held || held.code !== event.code || modifiers !== 0) { reset(); return false; }
    var tap = held; held = null;
    if (time < tap.at || time - tap.at > interval) { firstDown = null; return false; }
    if (firstDown !== null && tap.at >= firstDown && tap.at - firstDown <= interval) {
      firstDown = null;
      if (options.onDoubleTap) options.onDoubleTap();
      return true;
    }
    firstDown = tap.at;
    return false;
  }

  return { feed: feed, reset: reset };
}

function createAtlasAddressFocusHandoff(options) {
  var schedule = options.schedule || setTimeout;
  var generation = 0, pending = false;

  function finish(ok, attempts) {
    pending = false;
    if (options.onDone) options.onDone(ok, attempts);
  }

  function attempt(token, number) {
    if (token !== generation || !pending) return;
    var field = options.getField();
    if (!field) { finish(false, number + 1); return; }
    if (!options.hasFocus()) options.focusWindow();
    field.focus();
    if (typeof field.select === 'function') field.select();
    schedule(function () {
      if (token !== generation || !pending) return;
      var currentField = options.getField();
      if (currentField && options.isFocused(currentField) && options.hasFocus()) {
        finish(true, number + 1);
      } else if (number < 2) {
        attempt(token, number + 1);
      } else finish(false, number + 1);
    }, 50);
  }

  return {
    request: function () { pending = true; attempt(++generation, 0); },
    cancel: function () { generation++; pending = false; },
    isPending: function () { return pending; }
  };
}

function installAtlasCommandTaps(api, owner) {
  var handoff = createAtlasAddressFocusHandoff({
    getField: function () { return document.querySelector('.toolbar-mainbar #urlFieldInput') || document.getElementById('urlFieldInput'); },
    hasFocus: function () { return document.hasFocus(); },
    focusWindow: function () { window.focus(); },
    isFocused: function (field) { return document.activeElement === field; }
  });
  var detector = createAtlasCommandTapDetector({ windowId: owner, onDoubleTap: function () {
    if (Atlas.resetUiShortcuts) Atlas.resetUiShortcuts();
    if (Atlas.resetNativeSequencePage) Atlas.resetNativeSequencePage();
    var field = document.querySelector('.toolbar-mainbar #urlFieldInput') || document.getElementById('urlFieldInput');
    var active = document.activeElement;
    var focused = document.hasFocus() && active && (active === field ||
      (active.closest && active.closest('.UrlBar-AddressField, .UrlBar-SearchField, .SearchField')));
    // A pending focus retry must not reclaim the field after toggling it off.
    handoff.cancel();
    if (focused) Atlas.focusAddressBar();
    else handoff.request();
  } });

  function cancel() { detector.reset(); handoff.cancel(); }
  Atlas.resetCommandTaps = cancel;
  function rawKey(windowId, down, modifiers, code, afterGesture, autoRepeat) {
    if (windowId !== owner) { cancel(); return; }
    if ((code !== 91 && code !== 92 && code !== 93) || (modifiers & 7) || afterGesture) handoff.cancel();
    detector.feed({ windowId: windowId, down: down, modifiers: modifiers, code: code, afterGesture: afterGesture, autoRepeat: autoRepeat });
  }
  function mouseChanged(motion) { if (!motion) cancel(); }
  function windowChanged(id) { if (id !== owner) cancel(); }
  function tabChanged(info) { if (info.windowId === owner) cancel(); }

  api.onKeyboardChanged.addListener(rawKey);
  if (api.onMouseChanged) api.onMouseChanged.addListener(mouseChanged);
  if (chrome.windows.onFocusChanged) chrome.windows.onFocusChanged.addListener(windowChanged);
  if (chrome.tabs.onActivated) chrome.tabs.onActivated.addListener(tabChanged);
  window.addEventListener('pointerdown', cancel, true);
  Atlas.nativeCommandTapsEnabled = true;
  window.addEventListener('unload', function () {
    cancel();
    api.onKeyboardChanged.removeListener(rawKey);
    if (api.onMouseChanged) api.onMouseChanged.removeListener(mouseChanged);
    if (chrome.windows.onFocusChanged) chrome.windows.onFocusChanged.removeListener(windowChanged);
    if (chrome.tabs.onActivated) chrome.tabs.onActivated.removeListener(tabChanged);
    window.removeEventListener('pointerdown', cancel, true);
    Atlas.nativeCommandTapsEnabled = false;
    if (Atlas.resetCommandTaps === cancel) delete Atlas.resetCommandTaps;
  }, { once: true });
}

function startAtlasCommandTaps(attempt) {
  if (Atlas.nativeCommandTapsEnabled) return;
  var api = window.vivaldi && window.vivaldi.tabsPrivate;
  function retry() {
    if (attempt < 24) setTimeout(function () { startAtlasCommandTaps(attempt + 1); }, 200);
    else atlasWarn('Native Command taps unavailable', 'No keyboard API or owning browser window');
  }
  if (!api || !api.onKeyboardChanged) { retry(); return; }
  var id = window.vivaldiWindowId;
  if (Number.isInteger(id) && id >= 0) { installAtlasCommandTaps(api, id); return; }
  chrome.windows.getCurrent(function (w) {
    if (chrome.runtime.lastError || !w || !Number.isInteger(w.id) || w.id < 0) { retry(); return; }
    if (!Atlas.nativeCommandTapsEnabled) installAtlasCommandTaps(api, w.id);
  });
}

if (typeof window !== 'undefined' && typeof navigator !== 'undefined' && /Mac/.test(navigator.platform)) {
  startAtlasCommandTaps(0);
}
