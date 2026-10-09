/* ── atlas-google-account.js: Google pages open as the active profile's account ──
   Spec 002, phase 4. Runs at document_start on Google, Gmail and YouTube pages
   (top frames only; registered in src/modules/03-bridge-content-scripts.js).
   It asks the browser window (src/modules/16-google-accounts.js) whether this
   page should show another account, and if so opens it as that account, once.

   Guards, so it never loops or fights the user:
   - an address that already names an account (?authuser=, /u/N/) is left
     alone: a link chose it, or the user switched in Google's own menu;
   - the same address in this tab is not switched twice within 5 seconds, so a
     page Google keeps sending back without the account can't bounce forever;
   - frames inside a page are never switched. ── */
(function () {
  if (window.__atlasGoogleAccount || window.top !== window) return;
  window.__atlasGoogleAccount = true;

  var KEY = 'atlas-google-account-redirect';
  var here = location.href;
  var u;
  try { u = new URL(here); } catch (e) { return; /* no address to read: nothing to do */ }
  if (u.searchParams.has('authuser') || /(^|\/)u\/\d+(\/|$)/.test(u.pathname)) return;

  try {
    var last = JSON.parse(sessionStorage.getItem(KEY) || 'null');
    if (last && last.from === here && Date.now() - last.at < 5000) return;
  } catch (e) { /* no sessionStorage on this page: the window's answer still decides */ }

  if (!window.chrome || !chrome.runtime || !chrome.runtime.sendMessage) return;
  chrome.runtime.sendMessage({ atlas: { act: 'google-account-for-page', url: here } }, function (reply) {
    void chrome.runtime.lastError;
    if (!reply || !reply.redirect || location.href !== here) return;
    try { sessionStorage.setItem(KEY, JSON.stringify({ from: here, at: Date.now() })); } catch (e) { /* not remembered: the address check above still stops a loop */ }
    location.replace(reply.redirect);
  });
})();
