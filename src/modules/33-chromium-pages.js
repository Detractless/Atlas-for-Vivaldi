/* History and Bookmarks are Chromium's own pages (chrome://history, chrome://bookmarks), not
   Vivaldi's busier ones. Vivaldi's menus, shortcuts, panel buttons and address bar all open its own
   page, so any tab that lands there is swapped for the Chromium one. An open Chromium tab is
   reused, because Vivaldi looks for its own page first and would otherwise stack up a new tab
   every time. Downloads needs nothing: Vivaldi never replaced it. */
function atlasChromiumPage(name) {
  return {
    url: 'chrome://' + name + '/',
    vivaldi: new RegExp('^vivaldi:\\/\\/' + name + '(?:[\\/?#]|$)|\\/startpage\\?(?:[^#]*&)?section=' + name + '(?:[&#]|$)'),
    chromium: new RegExp('^chrome:\\/\\/' + name + '(?:[\\/?#]|$)'),
  };
}
var ATLAS_PAGES = { history: atlasChromiumPage('history'), bookmarks: atlasChromiumPage('bookmarks') };
var atlasPageBusy = {};

function atlasPageIgnore() { void chrome.runtime.lastError; }

/* Show the page: reuse an open one, else turn `tab` (Vivaldi's page, just opened) into it,
   else open a new one. */
function atlasShowPage(page, tab) {
  var windowId = tab ? tab.windowId : window.vivaldiWindowId;
  chrome.tabs.query(Number.isInteger(windowId) ? { windowId: windowId } : { currentWindow: true }, function (tabs) {
    if (chrome.runtime.lastError || !tabs) return;
    var open = null, i;
    for (i = 0; i < tabs.length; i++) {
      if (page.chromium.test(tabs[i].url || tabs[i].pendingUrl || '')) { open = tabs[i]; break; }
    }
    if (open) {
      chrome.tabs.update(open.id, { active: true }, atlasPageIgnore);
      if (tab) chrome.tabs.remove(tab.id, atlasPageIgnore);
    } else if (tab) chrome.tabs.update(tab.id, { url: page.url }, atlasPageIgnore);
    else chrome.tabs.create({ url: page.url }, atlasPageIgnore);
  });
}

function atlasPageTabSeen(tab, url) {
  if (!tab || !Number.isInteger(tab.id)) return;
  var address = url || tab.url || tab.pendingUrl || '', name;
  for (name in ATLAS_PAGES) {
    if (!ATLAS_PAGES[name].vivaldi.test(address)) continue;
    if (atlasPageBusy[tab.id]) return;
    atlasPageBusy[tab.id] = true;
    setTimeout(function () { delete atlasPageBusy[tab.id]; }, 1500);
    atlasShowPage(ATLAS_PAGES[name], tab);
    return;
  }
}

if (typeof chrome !== 'undefined' && chrome.tabs) {
  if (chrome.tabs.onCreated) chrome.tabs.onCreated.addListener(function (tab) { atlasPageTabSeen(tab); });
  if (chrome.tabs.onUpdated) chrome.tabs.onUpdated.addListener(function (id, info, tab) { atlasPageTabSeen(tab || { id: id }, info && info.url); });
  Atlas.openHistory = function () { atlasShowPage(ATLAS_PAGES.history, null); };
}
