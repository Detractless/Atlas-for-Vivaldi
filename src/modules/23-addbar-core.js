/* ── 23-addbar-core.js: "Add bookmark" and "Add page" in the address bar ──
   The profile menu's Add bookmark / Add page open here, on whatever page you are on: the address bar
   grows into the container (a field over the bar, a card under it, the page behind dimmed), at the
   address bar card's own size (css-mods/08-addbar.css). The
   screens are in 24-addbar-screens.js. This file holds the state, the questions put to the service
   worker (background/addFlow.js, which owns the bookmark database and the page list), and the
   opening, placing and closing.
   One flow at a time: `ab` is the open flow, or null. */

var AB_SUB_MIN = 3, AB_SUB_MAX = 5, AB_SUB_CHARS = 32;   // the subtitle rule, as services/pageSubtitle.js
var AB_NEW_GROUP = 'new-group ';                          // the "+ New group" choice, as utils/addBookmarkFlow.js
var AB_MIN_WIDTH = 360, AB_MAX_WIDTH = 620, AB_FIELD_H = 30;   // as the address bar: 620px at most, a 30px field
var ab = null;

function abEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

/* Ask the service worker; always answers, with { error } when it could not. The worker's script runs in
   this very page (02-bridge-setup.js), and Chrome does not deliver a message to the page that sent it, so
   it is asked directly (background/messaging.js). Messages are the way only if it ever runs apart from here. */
function abAsk(msg) {
  return new Promise(function (resolve) {
    var none = { error: 'No answer. Reload the browser and try again.' };
    try {
      if (window.__atlasWorker) { window.__atlasWorker.ask(msg).then(function (r) { resolve(r || none); }, function () { resolve(none); }); return; }
      chrome.runtime.sendMessage(msg, function (r) { void chrome.runtime.lastError; resolve(r || none); });
    } catch (e) {
      resolve({ error: 'Could not reach Atlas. Reload the browser and try again.' });
    }
  });
}

function abDb() {
  var ap = window.AtlasProfiles;
  return ap && ap.dbName ? ap.dbName() : 'DetractlessBookmarks';
}

function abSubCount(text) {
  var t = String(text || '').replace(/\s+/g, ' ').trim();
  return { words: t ? t.split(' ').length : 0, chars: t.length };
}

function abSubProblem(text) {
  var c = abSubCount(text);
  if (c.words < AB_SUB_MIN) return 'Use at least ' + AB_SUB_MIN + ' words';
  if (c.words > AB_SUB_MAX) return 'Use at most ' + AB_SUB_MAX + ' words';
  if (c.chars > AB_SUB_CHARS) return 'Keep it to ' + AB_SUB_CHARS + ' characters';
  return null;
}

function abFresh(kind) {
  return {
    kind: kind, step: 1, token: 0, busy: false, menu: null,
    urlText: '', name: '', nameTouched: false, sites: [], siteAt: 0, names: [], thisUrl: '',
    pages: [], page: null, groups: [], group: null, newGroup: '',
    pageName: '', sub: '',
    pageCount: 1, scrim: null, field: null, card: null
  };
}

/* ── where it goes: over the address field, the same middle and width (never narrower than it can use) ── */

function abFieldRect() {
  var field = document.querySelector('.UrlBar-AddressField');
  var r = field && field.getBoundingClientRect();
  if (r && r.width > 0) return { left: r.left, top: r.top, width: r.width, height: r.height };
  var w = Math.min(620, window.innerWidth - 24);
  return { left: (window.innerWidth - w) / 2, top: 8, width: w, height: 32 };
}

function abPlace() {
  if (!ab) return;
  var r = abFieldRect();
  var width = Math.min(Math.max(r.width, AB_MIN_WIDTH), AB_MAX_WIDTH, window.innerWidth - 24);
  var left = Math.max(12, Math.min(r.left + r.width / 2 - width / 2, window.innerWidth - width - 12));
  var top = Math.max(2, r.top + r.height / 2 - AB_FIELD_H / 2);
  ab.field.style.cssText = 'left:' + Math.round(left) + 'px;top:' + Math.round(top) + 'px;width:' + Math.round(width) + 'px';
  ab.card.style.cssText = 'left:' + Math.round(left) + 'px;top:' + Math.round(top + AB_FIELD_H) + 'px;width:' + Math.round(width) + 'px';
  var stack = document.getElementById('webpage-stack');
  var sr = stack && stack.getBoundingClientRect();
  ab.scrim.style.top = Math.round(sr && sr.height > 0 ? sr.top : top + AB_FIELD_H) + 'px';
}

function abDiv(cls, role) {
  var el = document.createElement('div');
  el.className = cls;
  if (role) el.setAttribute('role', role);
  return el;
}

function abOnKey(e) {
  if (e.key !== 'Escape' || !ab) return;
  e.preventDefault();
  e.stopPropagation();
  if (ab.menu) abCloseMenus(); else abClose();
}

function abClose() {
  if (!ab) return;
  [ab.scrim, ab.field, ab.card].forEach(function (el) { if (el && el.parentNode) el.parentNode.removeChild(el); });
  document.removeEventListener('keydown', abOnKey, true);
  window.removeEventListener('resize', abPlace);
  window.removeEventListener('blur', abClose);
  atlasMark('atlas-add-open', false);
  ab = null;
}

/** Open the flow: mode is 'bookmark' or 'page'. */
function abOpen(mode) {
  abClose();
  if (typeof Atlas.closeUiMenu === 'function') Atlas.closeUiMenu();
  ab = abFresh(mode === 'page' ? 'page' : 'bookmark');
  var host = document.getElementById('browser') || document.body;
  ab.scrim = abDiv('atlas-addscrim');
  ab.field = abDiv('atlas-addfield');
  ab.card = abDiv('atlas-addcard', 'dialog');
  ab.card.setAttribute('aria-label', ab.kind === 'page' ? 'Add page' : 'Add bookmark');
  [ab.scrim, ab.field, ab.card].forEach(function (el) { host.appendChild(el); });
  ab.scrim.addEventListener('mousedown', function (e) { e.preventDefault(); abClose(); });
  atlasMark('atlas-add-open', true);
  document.addEventListener('keydown', abOnKey, true);
  window.addEventListener('resize', abPlace);
  window.addEventListener('blur', abClose);
  abPlace();
  abWire();
  abRender();
  abLoad(ab);
}

/* The page you are on (for the first pill) and the pages bookmarks can go on, then the first pills. */
function abLoad(flow) {
  if (flow.kind === 'bookmark') {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      var t = tabs && tabs[0];
      if (ab === flow && t && /^https?:/.test(t.url || '')) flow.thisUrl = t.url;
      abSuggest();
    });
  }
  abAsk({ action: 'addInfo' }).then(function (r) {
    if (ab !== flow) return;
    flow.pages = r.pages || [];
    flow.pageCount = flow.pages.length + 1;   // the new page's default name is Page N
    if (flow.page === null && flow.pages.length) flow.page = flow.pages[0].id;
    var note = flow.kind === 'page' && flow.step === 1 && flow.card.querySelector('[data-ab-default]');
    if (note) note.textContent = 'Page ' + flow.pageCount;
  });
}

/* Pills for what is typed. Several calls may overlap while typing: only the newest answer is used. */
var abSuggestTimer = 0;
function abSuggest() {
  clearTimeout(abSuggestTimer);
  abSuggestTimer = setTimeout(function () {
    var flow = ab;
    if (!flow || flow.kind !== 'bookmark' || flow.step !== 1) return;
    var token = ++flow.token;
    abAsk({ action: 'addSuggest', db: abDb(), typed: flow.urlText, thisUrl: flow.thisUrl }).then(function (r) {
      if (ab !== flow || flow.token !== token || flow.step !== 1) return;
      flow.sites = r.sites || [];
      flow.names = r.names || [];
      flow.siteAt = Math.min(flow.siteAt, Math.max(flow.sites.length - 1, 0));
      abPaintPills();
    });
  }, 60);
}

/* Going to another tab leaves the flow behind. */
if (chrome.tabs && chrome.tabs.onActivated) chrome.tabs.onActivated.addListener(function () { abClose(); });

Atlas.openAdd = abOpen;
Atlas.closeAdd = abClose;
