/* ── 04-bridge-messages.js: acts on the messages the page context menu sends,
   and sends http://home to the Atlas new tab. ── */

if (chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener(function (msg, sender) {
    var m = msg && msg.atlas;
    if (!m) return;
    if (m.act === 'opentab' && m.url) {
      var winId = (sender && sender.tab && sender.tab.windowId) || undefined;
      var myWin = (typeof window !== 'undefined' && window.vivaldiWindowId) || undefined;
      if (winId && myWin && winId !== myWin) return;
      chrome.tabs.create({ url: m.url, active: m.active !== false, windowId: winId });
    } else if (m.act === 'opentab-current' && m.url) {
      var tid = sender && sender.tab && sender.tab.id;
      if (tid) chrome.tabs.update(tid, { url: m.url });
      else chrome.tabs.update({ url: m.url });
    } else if (m.act === 'ctxmenu-open') {
      if (typeof Atlas.closeUiMenu === 'function') Atlas.closeUiMenu();
      if (typeof Atlas.closeMenu === 'function') Atlas.closeMenu();
    } else if (m.act === 'download' && m.url) {
      chrome.downloads.download({ url: m.url, saveAs: true }, function () { void chrome.runtime.lastError; });
    } else if (m.act === 'savepage') {
      var u = m.url || (sender && sender.tab && sender.tab.url);
      if (u) chrome.downloads.download({ url: u, saveAs: true }, function () { void chrome.runtime.lastError; });
    }
  });
}

/* The built-in history page stays native; only the home alias is redirected. */
if (chrome.tabs && chrome.tabs.onUpdated) {
  chrome.tabs.onUpdated.addListener(function (tabId, info) {
    if (!info.url) return;
    if (/^https?:\/\/home\/?$/.test(info.url)) {
      chrome.tabs.update(tabId, { url: EXT + 'index.html' });
    }
  });
}
