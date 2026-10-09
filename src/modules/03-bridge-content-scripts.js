/* ── 03-bridge-content-scripts.js: the Atlas context menu on web pages.
   Registered persistently (document_start) and also injected into tabs the
   registration cannot reach. ── */

if (chrome.scripting && chrome.scripting.registerContentScripts) {
  /* The Atlas context menu registers PERSISTENTLY at document_start: one-shot
     injection on status=complete left a window after every navigation where a
     fast right-click got the native menu. The executeScript path below still
     covers internal schemes this registration cannot reach; the script's own
     __atlasCtx guard makes the overlap harmless.
     detractless-rules (Element Remover) and detractless-pastekit (@tokens) were
     archived with the Tools sidebar (_old/archive/sidebar-tools/RESTORE.md). They stay
     in OUR_CS_IDS below so an existing registration is swept, not left running. */
  var DESIRED_CS = [
    { id: 'atlas-ctxmenu', matches: ['<all_urls>'],
      excludeMatches: ['https://chromewebstore.google.com/*'],
      js: ['components/atlas/atlas-spelling.js', 'components/atlas/atlas-ctxmenu.js'], runAt: 'document_start' },
    /* Spec 002: Google pages open as the active profile's account (17-google-switch.js
       answers it). Top frames only: allFrames is left off. */
    { id: 'atlas-google-account', matches: ['*://*.google.com/*', '*://*.gmail.com/*', '*://*.youtube.com/*'],
      js: ['components/atlas/atlas-google-account.js'], runAt: 'document_start' }
  ];
  /* Registrations persist in the profile, and a plain register throws
     "Duplicate" for an existing id. UPDATE existing ones in place (so a params
     change like adding allFrames applies) and REGISTER absent ones — never
     unregister-then-register, which would leave a window at startup where a
     restoring tab loads with no context-menu script. Only ids we no longer
     want (the archived Remover and PasteKit scripts, atlas-remover-rules from an
     earlier build) are swept. */
  var OUR_CS_IDS = ['atlas-ctxmenu', 'atlas-google-account', 'detractless-rules', 'detractless-pastekit', 'atlas-remover-rules'];
  var WANTED_IDS = DESIRED_CS.map(function (c) { return c.id; });
  chrome.scripting.getRegisteredContentScripts(function (existing) {
    void chrome.runtime.lastError;
    var present = {};
    (existing || []).forEach(function (s) { present[s.id] = true; });
    DESIRED_CS.forEach(function (cs) {
      if (present[cs.id]) {
        chrome.scripting.updateContentScripts([cs], function () { void chrome.runtime.lastError; });
      } else {
        chrome.scripting.registerContentScripts([cs], function () { void chrome.runtime.lastError; });
      }
    });
    var stale = (existing || []).map(function (s) { return s.id; }).filter(function (id) {
      return OUR_CS_IDS.indexOf(id) >= 0 && WANTED_IDS.indexOf(id) < 0;
    });
    if (stale.length) chrome.scripting.unregisterContentScripts({ ids: stale }, function () { void chrome.runtime.lastError; });
  });
}

/* Atlas context menu on web pages: inject the shared component and act
   on the messages its items send. Protected pages (Web Store, PDFs) are
   refused by Chromium and keep the pruned native menu. */
var CTX_SCRIPTS = ['components/atlas/atlas-spelling.js', 'components/atlas/atlas-ctxmenu.js'];
var INJECTABLE = /^(https?|vivaldi|chrome|chrome-extension):/;
/* The Web Store is unscriptable by Chromium. Our own history and downloads
   pages deliberately have no context menu at all, so skip them too. */
var NO_INJECT = /^(chrome:\/\/webstore|https:\/\/chromewebstore\.google\.com)|\/components\/atlas\//;

function injectCtxMenu(tabId, url) {
  if (!url || !INJECTABLE.test(url) || NO_INJECT.test(url)) return;
  if (!chrome.scripting) return;
  chrome.scripting.executeScript(
    { target: { tabId: tabId, allFrames: false }, files: CTX_SCRIPTS },
    function () { void chrome.runtime.lastError; }
  );
}

if (chrome.tabs) {
  chrome.tabs.onUpdated.addListener(function (tabId, info, tab) {
    if (info.status === 'complete') injectCtxMenu(tabId, tab && tab.url);
  });
  chrome.tabs.query({}, function (tabs) {
    (tabs || []).forEach(function (t) { injectCtxMenu(t.id, t.url); });
  });
}
