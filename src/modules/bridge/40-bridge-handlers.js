/* One handler per page-to-browser action. The listener in 04-bridge-messages.js
   only reads `msg.atlas` and forwards it to dispatchBridgeAct, so each action's
   window and tab rules sit here, next to the action they guard. */

function bridgeOpenTab(m, sender) {
  var winId = (sender && sender.tab && sender.tab.windowId) || undefined;
  var myWin = (typeof window !== "undefined" && window.vivaldiWindowId) || undefined;
  if (winId && myWin && winId !== myWin) return;
  chrome.tabs.create({ url: m.url, active: m.active !== false, windowId: winId });
}

function bridgeOpenCurrentTab(m, sender) {
  var tid = sender && sender.tab && sender.tab.id;
  if (tid) chrome.tabs.update(tid, { url: m.url });
  else chrome.tabs.update({ url: m.url });
}

function bridgeCloseMenus() {
  if (typeof Atlas.closeUiMenu === "function") Atlas.closeUiMenu();
  if (typeof Atlas.closeMenu === "function") Atlas.closeMenu();
}

function bridgeDownloadUrl(url) {
  chrome.downloads.download({ url: url, saveAs: true }, function () { void chrome.runtime.lastError; });
}

/* Save the page the message came from, or the URL it named. */
function bridgeSavePage(m, sender) {
  var u = m.url || (sender && sender.tab && sender.tab.url);
  if (u) bridgeDownloadUrl(u);
}

/* Right-click on the new tab (a bookmark, a group, a page): the bar opens in the
   window that owns the tab. */
function bridgeEditOpen(m, sender, sendResponse) {
  var editWin = (sender && sender.tab && sender.tab.windowId) || undefined;
  var mineWin = (typeof window !== "undefined" && window.vivaldiWindowId) || undefined;
  if (editWin && mineWin && editWin !== mineWin) return;
  if (typeof Atlas.openEdit === "function") {
    Atlas.openEdit(m.edit);
    if (typeof sendResponse === "function") sendResponse({ ok: true });   // tells the tab it was handled; unanswered, it opens its own pop-up
  }
}

function bridgeFocusAddressBar(sender) {
  var winId = (sender && sender.tab && typeof sender.tab.windowId === "number" && sender.tab.windowId >= 0) ? sender.tab.windowId : undefined;
  var myWin = (typeof window !== "undefined" && typeof window.vivaldiWindowId === "number" && window.vivaldiWindowId >= 0) ? window.vivaldiWindowId : undefined;
  if (winId !== undefined && myWin !== undefined && winId !== myWin) return;
  /* Ignore an old page script while the native listener owns this gesture. */
  if (!Atlas.nativeCommandTapsEnabled && typeof Atlas.focusAddressBar === "function") Atlas.focusAddressBar(true);
}

function bridgeNavigateBack(sender) {
  var tid = sender && sender.tab && sender.tab.id;
  if (tid && chrome.tabs && chrome.tabs.goBack) {
    chrome.tabs.goBack(tid);
  } else if (typeof Atlas.navigateBack === "function") {
    Atlas.navigateBack();
  }
}

function bridgeNavigateForward(sender) {
  var tid = sender && sender.tab && sender.tab.id;
  if (tid && chrome.tabs && chrome.tabs.goForward) {
    chrome.tabs.goForward(tid);
  } else if (typeof Atlas.navigateForward === "function") {
    Atlas.navigateForward();
  }
}

function bridgeNewTab(sender) {
  var winId = (sender && sender.tab && typeof sender.tab.windowId === "number" && sender.tab.windowId >= 0) ? sender.tab.windowId : undefined;
  var myWin = (typeof window !== "undefined" && window.vivaldiWindowId) || undefined;
  if (winId !== undefined && myWin !== undefined && winId !== myWin) return;
  var opts = { url: ATLAS_NEWTAB_URL };
  if (typeof winId === "number") opts.windowId = winId;
  if (chrome.tabs && chrome.tabs.create) {
    chrome.tabs.create(opts);
  }
}

function bridgeCloseTab(sender) {
  var tid = sender && sender.tab && sender.tab.id;
  if (tid && chrome.tabs && chrome.tabs.remove) {
    chrome.tabs.remove(tid, function () { void chrome.runtime.lastError; });
  } else if (typeof Atlas.closeCurrentTab === "function") {
    Atlas.closeCurrentTab();
  }
}

/* The one place a bridge action is matched to its handler. Returns true only for
   the actions that answer the page asynchronously. */
function dispatchBridgeAct(m, sender, sendResponse) {
  var act = m.act;
  if (act === "opentab" && m.url) { bridgeOpenTab(m, sender); return false; }
  if (act === "opentab-current" && m.url) { bridgeOpenCurrentTab(m, sender); return false; }
  if (act === "ctxmenu-open") { bridgeCloseMenus(); return false; }
  if (act === "download" && m.url) { bridgeDownloadUrl(m.url); return false; }
  if (act === "savepage") { bridgeSavePage(m, sender); return false; }
  if (act === "edit-open" && m.edit) { bridgeEditOpen(m, sender, sendResponse); return false; }
  if (act === "focus-addressbar") { bridgeFocusAddressBar(sender); return false; }
  if (act === "navigate-back") { bridgeNavigateBack(sender); return false; }
  if (act === "navigate-forward") { bridgeNavigateForward(sender); return false; }
  if (act === "tab-new") { bridgeNewTab(sender); return false; }
  if (act === "tab-close") { bridgeCloseTab(sender); return false; }
  if (act === "tab-prev" || act === "tab-next") { handleBridgeTabNav(m, sender); return false; }
  if (typeof act === "string" && act.indexOf("nsfw-") === 0) {
    return handleNsfwBridgeMessage(m, sender, sendResponse);
  }
  return false;
}
