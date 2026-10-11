/* ── 21-addressbar-revert.js: clicking away puts the address back ──
   Vivaldi keeps what you typed in the address field for each tab until the
   page reloads, starts loading, or closes (measured in its bundle.js,
   2026-10-10): click away half-typed and the field stays that way, empty or
   with the words left in it. So when the field loses focus after typing,
   Atlas runs Vivaldi's own reset for that tab, the step Vivaldi runs on
   reload, and the field shows the page's address and lock again; on the new
   tab, it is blank again (20-addressbar-newtab.js).

   It happens out of sight: once the bar's text has faded out (03-addressbar.css),
   with the field no longer in use and the pointer off the bar. Until then the
   typing stays; coming back into the field keeps it, and it goes back the
   next time you leave.

   Left alone: Enter (the page you asked for is loading, and Vivaldi clears the
   field itself then), Vivaldi losing focus to another app (the field is still
   the one in use when you come back), and a field you never typed in.

   Vivaldi's reset lives in its core document (main.html), not in this window:
   it is found once among the core's modules by what it does, not where it
   sits. If a Vivaldi update removes it, the field keeps the typing, as before. ── */

var ABR_ENTER_MS = 1500;   // focus leaving this soon after Enter is the page loading
var ABR_FADE_MS = 350;     // the bar's text fades out over .3s once it is neither hovered nor in use (03-addressbar.css)
var ABR_LOOK_MS = 100;     // how often a waiting reset looks at the bar
var abr = { core: undefined, tabId: null, asked: 0, enterAt: 0, waiting: null, carry: false };

/* Vivaldi's own address-field actions ({updateState, reset}), or null. */
function abrVivaldiField() {
  if (abr.core !== undefined) return abr.core;
  abr.core = null;
  try {
    var views = chrome.extension && chrome.extension.getViews && chrome.extension.getViews();
    var core = (Array.isArray(views) ? views : []).concat([window]).find(function (v) {
      return v && v.webpackChunkgapp_browser_react && typeof v.webpackChunkgapp_browser_react.push === 'function';
    });
    if (core) core.webpackChunkgapp_browser_react.push([['atlas-urlfield-reset'], {}, function (req) {
      Object.keys(req.m || {}).some(function (id) {
        var src = String(req.m[id]);
        if (src.length > 2000 || src.indexOf('URLFIELD_RESET') === -1) return false;
        var z = req(id) && req(id).Z;
        if (!z || typeof z.reset !== 'function' || typeof z.updateState !== 'function') return false;
        abr.core = z;
        return true;
      });
    }]);
  } catch (e) {
    atlasWarn('address bar: looking for Vivaldi\'s address reset failed', e);
  }
  if (!abr.core) atlasWarn('address bar: Vivaldi\'s address reset not found; typing stays after clicking away');
  return abr.core;
}

function abrReset(tabId) {
  var field = abrVivaldiField();
  if (field) field.reset(tabId);
}

/* Into the field: note which tab it is editing, since by the time it loses
   focus another tab may be the active one (a click on a tab). A reset still
   waiting for the bar to fade stops: on this tab the typing is in use again
   (and goes back next time you leave, abr.carry); another tab's is out of
   sight, so it goes back now. */
function abrOnFocus() {
  var ask = ++abr.asked, held = abr.waiting;
  abr.waiting = null;
  abr.tabId = null;
  abr.enterAt = 0;
  abr.carry = false;
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    void chrome.runtime.lastError;
    var tab = tabs && tabs[0];
    if (!tab) return;
    if (ask === abr.asked) abr.tabId = tab.id;
    if (!held) return;
    if (held.tabId === tab.id) abr.carry = true;
    else abrReset(held.tabId);
    held = null;
  });
}

function abrOnBlur(input) {
  var typed = abe.typed || abr.carry, tabId = abr.tabId, entered = Date.now() - abr.enterAt < ABR_ENTER_MS;
  setTimeout(function () {
    if (document.activeElement === input) return;   // still the field in use: back in it, or Vivaldi left for another app
    if (!typed || entered || tabId === null) return;
    abrWaitUntilHidden(tabId);
  }, 0);
}

/* The bar's text is showing: the field in use, or the pointer over the bar or its logo (20). */
function abrBarShown() {
  var input = abeFieldInput(), bar = input && input.closest('.UrlBar-AddressField');
  if (!bar) return false;
  if (bar.contains(document.activeElement) || atlasMarked('atlas-urlbar-hover')) return true;
  try {
    return bar.matches(':hover') || !!(abe.btn && abe.btn.matches(':hover'));
  } catch (e) {
    return false;
  }
}

/* Reset the tab once the bar has been out of sight for the whole fade,
   looking every ABR_LOOK_MS; coming back into the field stops it (abrOnFocus). */
function abrWaitUntilHidden(tabId) {
  var wait = { tabId: tabId }, hiddenSince = 0;
  abr.waiting = wait;
  (function look() {
    if (abr.waiting !== wait) return;
    if (abrBarShown()) hiddenSince = 0;
    else if (!hiddenSince) hiddenSince = Date.now();
    else if (Date.now() - hiddenSince >= ABR_FADE_MS) { abr.waiting = null; return abrReset(tabId); }
    setTimeout(look, ABR_LOOK_MS);
  })();
}

if (typeof document !== 'undefined' && document.addEventListener) {
  document.addEventListener('focusin', function (e) { if (apbField(e.target)) abrOnFocus(); });
  document.addEventListener('focusout', function (e) { if (apbField(e.target)) abrOnBlur(e.target); });
  /* Enter that opens a page in this tab; Cmd/Ctrl/Alt+Enter open it elsewhere, and this tab's field still goes back. */
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && apbField(e.target) && !e.metaKey && !e.ctrlKey && !e.altKey) abr.enterAt = Date.now();
  }, true);
}
