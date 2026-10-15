/* ── 18-addressbar-pills.js: the address bar card ──
   While the address field is in use, a card grows down from it over the page
   (design A, 2026-10-09), joined to the field as one shape with a faint line
   between them (joined look B, 2026-10-09). It holds:
   - the whole address, wrapped, when it is too long for the one-line field
     (Vivaldi's field is a single-line input, so it can't wrap itself);
   - while you type, the bookmarks whose name contains what you typed, as
     pills, ordered by how often you open them: the same rule and the same
     "Bookmark pills" setting as the new tab's search. No match, no pills.
   The first pill is picked; the arrows move the pick, Enter opens it in this
   tab, a click opens one, and Shift+Enter searches what you typed, in this
   tab too (apbSearchHere).
   While pills show, Vivaldi's own suggestion list steps aside.

   The bookmarks are read from the new tab's own database (same extension,
   so the same IndexedDB), read-only, and never created from here. ── */

var APB_HALF_LIFE = 7 * 24 * 60 * 60 * 1000;   // how fast a past visit stops counting (as the new tab)
var apbBookmarks = [];      // [{ name, url, score }]
var apbBehavior = 'always'; // 'always' | 'prefix' (only after ./) | 'never'
var apbState = { input: null, typed: false, list: [], at: -1 };
var apbCard = null;

function apbField(el) {
  return el && el.matches && el.matches('.UrlBar-AddressField input.url') ? el : null;
}

/* Read every bookmark and its visit score from the active profile's database. */
function apbLoad() {
  var name = (window.AtlasProfiles && window.AtlasProfiles.dbName && window.AtlasProfiles.dbName()) || 'DetractlessBookmarks';
  if (typeof indexedDB === 'undefined') return;
  var req = indexedDB.open(name);
  req.onupgradeneeded = function () { req.transaction.abort(); };  // no such database yet: leave it to the new tab
  req.onerror = function (e) { if (e && e.preventDefault) e.preventDefault(); apbBookmarks = []; };
  req.onsuccess = function () {
    var db = req.result;
    db.onversionchange = function () { db.close(); };
    if (!db.objectStoreNames.contains('bookmarks')) { db.close(); return; }
    var stores = db.objectStoreNames.contains('usage') ? ['bookmarks', 'usage'] : ['bookmarks'];
    var tx = db.transaction(stores, 'readonly'), pages = null, uses = [];
    tx.objectStore('bookmarks').getAll().onsuccess = function (e) { pages = e.target.result || []; };
    if (stores.length > 1) tx.objectStore('usage').getAll().onsuccess = function (e) { uses = e.target.result || []; };
    tx.oncomplete = function () { db.close(); apbBookmarks = apbFlatten(pages || [], uses); apbRefresh(); };
    tx.onerror = function () { atlasWarn('address bar: reading bookmarks failed', tx.error); db.close(); };
  };
}

function apbFlatten(pages, uses) {
  var now = Date.now(), score = {};
  uses.forEach(function (u) {
    score[u.url] = (u.timestamps || []).reduce(function (s, ts) { return s + Math.exp(-(now - ts) / APB_HALF_LIFE); }, 0);
  });
  var out = [];
  pages.forEach(function (p) {
    Object.keys(p.data || {}).forEach(function (g) {
      (p.data[g] || []).forEach(function (b) {
        if (b && b.name && b.url) out.push({ name: b.name, url: b.url, score: score[b.url] || 0 });
      });
    });
  });
  return out;
}

/* The pills for what is in the field: none until you type, then the matches. */
function apbMatches(value) {
  if (!apbState.typed) return [];
  var v = String(value || '');
  if (apbBehavior === 'never') return [];
  if (apbBehavior !== 'always' && v.indexOf('./') !== 0) return [];
  var q = (v.indexOf('./') === 0 ? v.slice(2) : v).trim().toLowerCase();
  if (!q) return [];
  return apbBookmarks.filter(function (b) { return b.name.toLowerCase().indexOf(q) !== -1; })
    .sort(function (a, b) { return b.score - a.score; });
}

function apbEnsureCard() {
  if (apbCard && apbCard.isConnected) return apbCard;
  apbCard = document.createElement('div');
  apbCard.className = 'atlas-urlcard';
  apbCard.hidden = true;
  apbCard.addEventListener('mousedown', function (e) { e.preventDefault(); }); // keep the field focused
  apbCard.addEventListener('click', function (e) {
    var p = e.target.closest && e.target.closest('.atlas-urlpill');
    if (p) apbOpen(apbState.list[Number(p.dataset.i)]);
  });
  (document.getElementById('browser') || document.body).appendChild(apbCard);
  return apbCard;
}

/* Redraw the card for the field's current text, under the field. */
function apbRefresh() {
  var input = apbState.input;
  if (!input) return;
  apbState.list = apbMatches(input.value);
  if (apbState.at >= apbState.list.length || apbState.at < 0) apbState.at = apbState.list.length ? 0 : -1;
  var long = input.scrollWidth > input.clientWidth + 2;
  var card = apbEnsureCard();
  card.innerHTML = '';
  if (long) {
    var full = document.createElement('div');
    full.className = 'atlas-urlcard-full';
    full.textContent = input.value;
    card.appendChild(full);
  }
  if (apbState.list.length) card.appendChild(apbPills());
  card.hidden = !long && !apbState.list.length;
  atlasMark('atlas-pills-open', apbState.list.length > 0);
  atlasMark('atlas-urlcard-open', !card.hidden);  // the field squares its bottom to join the card
  apbPlace(card, input);
}

function apbPills() {
  var wrap = document.createElement('div');
  wrap.className = 'atlas-urlcard-pills';
  wrap.setAttribute('role', 'listbox');
  apbState.list.forEach(function (b, i) {
    var p = document.createElement('button');
    p.type = 'button';
    p.className = 'atlas-urlpill';
    p.dataset.i = String(i);
    p.setAttribute('role', 'option');
    p.setAttribute('aria-selected', String(i === apbState.at));
    p.textContent = b.name;
    p.title = b.url;
    wrap.appendChild(p);
  });
  var hint = document.createElement('div');
  hint.className = 'atlas-urlcard-hint';
  hint.textContent = 'Enter opens ' + apbState.list[apbState.at].name + ' · ↑↓ to move · Shift+Enter searches the web';
  var box = document.createElement('div');
  box.appendChild(wrap);
  box.appendChild(hint);
  return box;
}

/* Right under the whole address field, same width, with no gap: the field and
   the card read as one shape growing down over the page. */
function apbPlace(card, input) {
  var field = input.closest('.UrlBar-AddressField') || input;
  var r = field.getBoundingClientRect();
  card.style.left = Math.round(r.left) + 'px';
  card.style.top = Math.round(r.bottom) + 'px';
  card.style.width = Math.round(r.width) + 'px';
}

function apbClose() {
  apbState.input = null;
  apbState.typed = false;
  apbState.list = [];
  apbState.at = -1;
  if (apbCard) apbCard.hidden = true;
  atlasMark('atlas-pills-open', false);
  atlasMark('atlas-urlcard-open', false);
}

function apbOpen(b) {
  if (!b) return;
  var input = apbState.input;
  apbClose();
  if (input) input.blur();
  chrome.tabs.update({ url: b.url }, function () { void chrome.runtime.lastError; });
}

/* Shift+Enter while pills show: not the picked bookmark but what was typed,
   searched (or opened, if it is an address) as Enter does without pills.
   Vivaldi's own Shift+Enter opens a new tab, so the pills close and Vivaldi's
   field gets a plain Enter instead: a keypress, which is what it submits on
   (2026-10-09). The field stays in use, so typing more brings pills back. */
function apbSearchHere(input) {
  apbState.list = [];
  apbState.at = -1;
  if (apbCard) apbCard.hidden = true;
  atlasMark('atlas-pills-open', false);
  atlasMark('atlas-urlcard-open', false);
  var ev = new KeyboardEvent('keypress', { key: 'Enter', code: 'Enter', keyCode: 13, charCode: 13, bubbles: true, cancelable: true });
  ['keyCode', 'charCode', 'which'].forEach(function (k) {   // read by Vivaldi's field (React) to tell Enter
    if (ev[k] !== 13) Object.defineProperty(ev, k, { value: 13 });
  });
  input.dispatchEvent(ev);
}

/* The keys, caught before Vivaldi's field sees them, only while pills show. */
function apbKey(e) {
  if (!apbField(e.target) || !apbState.list.length) return;
  var n = apbState.list.length;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    apbState.at = (apbState.at + (e.key === 'ArrowDown' ? 1 : n - 1)) % n;
  } else if (e.key === 'Enter' && !e.shiftKey && apbState.at >= 0) {
    apbOpen(apbState.list[apbState.at]);
  } else if (e.key === 'Enter' && e.shiftKey && !e.altKey && !e.metaKey && !e.ctrlKey) {
    apbSearchHere(e.target);
  } else {
    return;
  }
  e.preventDefault();
  e.stopPropagation();
  if (apbState.list.length) apbRefresh();
}

if (typeof document !== 'undefined' && document.addEventListener) {
  document.addEventListener('focusin', function (e) {
    var input = apbField(e.target);
    if (!input) return;
    apbState.input = input;
    apbState.typed = false;
    apbState.at = -1;
    apbLoad();
    apbRefresh();
  });
  document.addEventListener('input', function (e) {
    if (!apbField(e.target)) return;
    apbState.input = e.target;
    apbState.typed = true;
    apbState.at = -1;
    apbRefresh();
  });
  document.addEventListener('focusout', function (e) { if (apbField(e.target)) apbClose(); });
  document.addEventListener('keydown', apbKey, true);
  window.addEventListener('resize', function () { if (apbState.input && apbCard && !apbCard.hidden) apbPlace(apbCard, apbState.input); });
}

if (chrome.storage && chrome.storage.sync) {
  chrome.storage.sync.get(['bookmarkPillBehavior'], function (r) {
    void chrome.runtime.lastError;
    if (r && r.bookmarkPillBehavior) apbBehavior = r.bookmarkPillBehavior;
  });
  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area === 'sync' && changes.bookmarkPillBehavior) apbBehavior = changes.bookmarkPillBehavior.newValue || 'always';
  });
}
