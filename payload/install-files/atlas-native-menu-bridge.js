/* Loads in Vivaldi's core before its menu setup. No keyboard bindings or
   preferences are changed; hidden menu items carry application-local events. */
(function () {
  'use strict';
  if (!/Mac/.test(navigator.platform)) return;
  var api = window.vivaldi && window.vivaldi.menubar;
  if (!api || !api.setup || api.__atlasSequenceBridge) return;
  var original = api.setup, cached = null, ready = false;
  var rootAction = 'ATLAS_SEQUENCE_BRIDGE_V1';
  function command(suffix, title) {
    return { id: -1, name: '__AtlasSequence' + title + '_v1__',
      action: 'ATLAS_SEQUENCE_' + suffix, type: 'command',
      withNoWindow: false, enabled: true, visible: false };
  }
  function bridge() {
    return { id: -1, name: '__AtlasSequenceBridge_v1__', action: rootAction,
      type: 'folder', withNoWindow: false, visible: false,
      items: [command('ACTIVITY', 'Activity'), command('NEW_TAB', 'NewTab'), command('CLOSE_TAB', 'CloseTab'),
        command('TAB_PREV', 'TabPrev'), command('TAB_NEXT', 'TabNext'),
        command('NAV_BACK', 'NavBack'), command('NAV_FORWARD', 'NavForward')] };
  }
  api.setup = function (items) {
    if (!Array.isArray(items)) return original.apply(this, arguments);
    cached = items.filter(function (item) { return item.action !== rootAction; });
    var next = cached.slice();
    if (ready) next.push(bridge());
    return original.call(api, next);
  };
  api.__atlasSequenceBridge = true;
  chrome.runtime.onMessage.addListener(function (msg, sender) {
    if (!msg || msg.atlasNativeSequenceReady !== true ||
        sender.id !== chrome.runtime.id || !/\/window\.html(?:[?#]|$)/.test(sender.url || '')) return;
    if (ready) return;
    ready = true;
    if (cached) api.setup(cached);
  });
})();
