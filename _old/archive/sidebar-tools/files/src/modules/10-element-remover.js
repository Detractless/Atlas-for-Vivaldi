/* ── 10-element-remover.js: Detractless Element Remover engine host coordinator ── */
(function () {
  'use strict';

  if (!chrome.scripting || !chrome.scripting.executeScript) return;

  var PICKER_JS = 'src/dist/inject.bundle.js';
  var PICKER_CSS = 'src/content/elementRemover/inject.css';

  var arm = {};
  var myWin = null;
  try { chrome.windows.getCurrent(function (w) { if (w) myWin = w.id; }); } catch (e) {}

  function injectPicker(tabId) {
    chrome.scripting.executeScript({ target: { tabId: tabId }, files: [PICKER_JS] }, function () {
      if (chrome.runtime.lastError) return;
      chrome.scripting.insertCSS({ target: { tabId: tabId }, files: [PICKER_CSS] }, function () {
        void chrome.runtime.lastError;
      });
    });
  }

  function sendState(tabId, on) {
    chrome.tabs.sendMessage(tabId, { method: 'state', data: { state: on ? 'ON' : 'OFF' }, path: 'background-to-page' }, function () {
      if (chrome.runtime.lastError && on) injectPicker(tabId);
    });
  }

  function ownsTab(tabId, cb) {
    if (tabId == null) return cb(false);
    chrome.tabs.get(tabId, function (t) {
      if (chrome.runtime.lastError || !t) return cb(false);
      cb(myWin == null || t.windowId === myWin);
    });
  }

  chrome.tabs.onUpdated.addListener(function (tabId, info) { if (info.status === 'loading') delete arm[tabId]; });
  chrome.tabs.onRemoved.addListener(function (tabId) { delete arm[tabId]; });

  chrome.runtime.onMessage.addListener(function (msg, sender, respond) {
    if (msg && msg.action === 'toggleRemoverOnTab') {
      ownsTab(msg.tabId, function (own) {
        if (!own) return;
        var on = !arm[msg.tabId];
        if (on) arm[msg.tabId] = true; else delete arm[msg.tabId];
        sendState(msg.tabId, on);
        respond({ state: on ? 'ON' : 'OFF' });
      });
      return true;
    }
    if (msg && msg.action === 'getRemoverState') {
      ownsTab(msg.tabId, function (own) {
        respond({ state: (own && arm[msg.tabId]) ? 'ON' : 'OFF' });
      });
      return true;
    }
    if (msg && msg.path === 'page-to-background') {
      var tabId = sender.tab && sender.tab.id;
      if (tabId == null || (myWin != null && sender.tab.windowId !== myWin)) return;
      if (msg.method === 'state') {
        chrome.tabs.sendMessage(tabId, { method: 'state', data: { state: arm[tabId] ? 'ON' : 'OFF' }, path: 'background-to-page' }, function () {
          void chrome.runtime.lastError;
        });
      } else if (msg.method === 'store' && msg.data && msg.data.state) {
        if (msg.data.state === 'OFF') delete arm[tabId]; else arm[tabId] = true;
      }
    }
  });

  Atlas.injectPicker = injectPicker;
  Atlas.ownsTab = ownsTab;
})();
