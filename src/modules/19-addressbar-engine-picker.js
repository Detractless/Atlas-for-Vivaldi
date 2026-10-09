/* ── 19-addressbar-engine-picker.js: the address bar's engine button ──
   While the address field is in use, its left icon is the engine a search will
   use (addressBarEngineKey, 15-addressbar-engine.js), with the new tab's logo
   for it, laid over Vivaldi's own icon (2026-10-09). Click it and the address
   bar card shows the engines as pills, as the new tab does, then "Engine
   lists". Pick one and it is the new tab's engine too (selectedSearchEngine);
   when engines "always reset to the default", the pick lasts until you leave
   the field. Arrows move, Enter picks, Esc goes back to the bookmark pills
   (18-addressbar-pills.js). ── */

var ABE_DEFAULT_ICON = 'src/assets/svg/default.api.svg';
var ABE_REVERT_MS = 1500;   // after leaving the field, an "always reset" pick ends
var ABE_LIST_SVG = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" ' +
  'stroke-linecap="round" aria-hidden="true"><path d="M5.5 4h8M5.5 8h8M5.5 12h8M2.5 4h0M2.5 8h0M2.5 12h0"/></svg>';
var abe = { input: null, r: {}, icons: {}, open: false, list: [], at: -1, btn: null, card: null, requery: false, revert: 0 };

function abeEngine(key) {
  var all = abe.r.customSearchEngines || {};
  return all[key] || null;
}

/* The engines to pick from: the new tab's, minus hidden ones and ones with no address. */
function abeChoices() {
  var all = abe.r.customSearchEngines || {};
  return Object.keys(all).filter(function (k) { return all[k] && all[k].url && !all[k].isHidden; })
    .map(function (k) { return { key: k, name: all[k].name || k }; });
}

/* An engine's logo, as the new tab shows it (engineIcons.js). The built-in
   logos are files of the new tab, beside window.html; custom ones are in the
   new tab's database. */
function abeIcon(key) {
  var eng = abeEngine(key);
  if (!eng) return ABE_DEFAULT_ICON;
  if (eng.isCustomIcon) return abe.icons[key] || ABE_DEFAULT_ICON;
  return eng.icon || ABE_DEFAULT_ICON;
}

/* Custom logos from the active profile's database, read-only, never creating it. */
function abeLoadIcons() {
  var custom = Object.keys(abe.r.customSearchEngines || {}).filter(function (k) { return abeEngine(k) && abeEngine(k).isCustomIcon; });
  if (!custom.length || typeof indexedDB === 'undefined') return;
  var name = (window.AtlasProfiles && window.AtlasProfiles.dbName && window.AtlasProfiles.dbName()) || 'DetractlessBookmarks';
  var req = indexedDB.open(name);
  req.onupgradeneeded = function () { req.transaction.abort(); };  // no such database yet: leave it to the new tab
  req.onerror = function (e) { if (e && e.preventDefault) e.preventDefault(); };
  req.onsuccess = function () {
    var db = req.result;
    db.onversionchange = function () { db.close(); };
    if (!db.objectStoreNames.contains('icons')) { db.close(); return; }
    var tx = db.transaction(['icons'], 'readonly'), store = tx.objectStore('icons');
    custom.forEach(function (k) {
      store.get(k).onsuccess = function (e) { if (e.target.result) abe.icons[k] = e.target.result; };
    });
    tx.oncomplete = function () { db.close(); abeShowButton(); if (abe.open) abeRender(); };
    tx.onerror = function () { atlasWarn('address bar: reading engine logos failed', tx.error); db.close(); };
  };
}

function abeImg(src) {
  var img = document.createElement('img');
  img.alt = '';
  img.onerror = function () { if (img.getAttribute('src') !== ABE_DEFAULT_ICON) img.setAttribute('src', ABE_DEFAULT_ICON); };
  img.setAttribute('src', src);
  return img;
}

function abeEnsureButton() {
  if (abe.btn && abe.btn.isConnected) return abe.btn;
  var b = document.createElement('button');
  b.type = 'button';
  b.className = 'atlas-enginebtn';
  b.hidden = true;
  b.setAttribute('aria-haspopup', 'listbox');
  b.appendChild(abeImg(ABE_DEFAULT_ICON));
  b.addEventListener('mousedown', function (e) { e.preventDefault(); });  // keep the field focused
  b.addEventListener('click', function () { if (abe.open) abeCloseList(); else abeOpenList(); });
  (document.getElementById('browser') || document.body).appendChild(b);
  return (abe.btn = b);
}

/* The button with the current engine's logo, over Vivaldi's icon. */
function abeShowButton() {
  if (!abe.input) return;
  var b = abeEnsureButton(), key = addressBarEngineKey(abe.r), eng = abeEngine(key);
  var img = b.querySelector('img'), src = abeIcon(key);
  if (img.getAttribute('src') !== src) img.setAttribute('src', src);
  b.dataset.engine = key;
  b.title = 'Searching with ' + ((eng && eng.name) || 'the browser default') + '. Click to change';
  b.setAttribute('aria-label', b.title);
  b.setAttribute('aria-expanded', String(abe.open));
  b.hidden = false;
  var browser = document.getElementById('browser');
  if (browser) browser.classList.add('atlas-enginebtn-on');
  abePlace();
}

/* The button sits exactly over Vivaldi's left icon; the engine pills under the field. */
function abePlace() {
  var field = abe.input && abe.input.closest('.UrlBar-AddressField');
  if (!field) return;
  var icon = field.querySelector('.SiteInfoButton') || field.querySelector('.toolbar-insideinput');
  var f = field.getBoundingClientRect(), r = icon ? icon.getBoundingClientRect() : null;
  if (!r || !r.width) r = { left: f.left + 4, top: f.top + (f.height - 28) / 2, width: 28, height: 28 };
  if (abe.btn) {
    abe.btn.style.left = Math.round(r.left) + 'px';
    abe.btn.style.top = Math.round(r.top) + 'px';
    abe.btn.style.width = Math.round(r.width) + 'px';
    abe.btn.style.height = Math.round(r.height) + 'px';
  }
  if (abe.card && !abe.card.hidden) {
    abe.card.style.left = Math.round(f.left) + 'px';
    abe.card.style.top = Math.round(f.bottom) + 'px';
    abe.card.style.width = Math.round(f.width) + 'px';
  }
}

function abeEnsureCard() {
  if (abe.card && abe.card.isConnected) return abe.card;
  var c = document.createElement('div');
  c.className = 'atlas-enginecard';
  c.hidden = true;
  c.addEventListener('mousedown', function (e) { e.preventDefault(); });  // keep the field focused
  c.addEventListener('click', function (e) {
    var p = e.target.closest && e.target.closest('[data-i]');
    if (p) abeChoose(abe.list[Number(p.dataset.i)]);
  });
  (document.getElementById('browser') || document.body).appendChild(c);
  return (abe.card = c);
}

function abeOpenList() {
  if (!abe.input) return;
  abe.list = abeChoices().concat([{ key: null, name: 'Engine lists', lists: true }]);
  var cur = addressBarEngineKey(abe.r);
  abe.at = Math.max(0, abe.list.findIndex(function (c) { return c.key === cur; }));
  abe.open = true;
  abeRender();
}

/* The engine pills, the current one picked, then Engine lists and a hint. */
function abeRender() {
  var c = abeEnsureCard();
  c.innerHTML = '';
  var wrap = document.createElement('div');
  wrap.className = 'atlas-urlcard-pills';
  wrap.setAttribute('role', 'listbox');
  wrap.setAttribute('aria-label', 'Search engines');
  abe.list.forEach(function (item, i) {
    var p = document.createElement('button');
    p.type = 'button';
    p.className = 'atlas-urlpill atlas-enginepill';
    p.dataset.i = String(i);
    if (item.key) p.dataset.engine = item.key;
    p.setAttribute('role', 'option');
    p.setAttribute('aria-selected', String(i === abe.at));
    if (item.lists) p.insertAdjacentHTML('beforeend', ABE_LIST_SVG); else p.appendChild(abeImg(abeIcon(item.key)));
    p.appendChild(document.createElement('span')).textContent = item.name;
    wrap.appendChild(p);
  });
  var cur = abe.list[abe.at], hint = document.createElement('div');
  hint.className = 'atlas-urlcard-hint';
  hint.textContent = 'Enter ' + (cur.lists ? 'opens Engine lists' : 'picks ' + cur.name) + ' · ↑↓ to move · Esc goes back';
  c.appendChild(wrap);
  c.appendChild(hint);
  c.hidden = false;
  var browser = document.getElementById('browser');
  if (browser) browser.classList.add('atlas-engines-open');
  if (abe.btn) abe.btn.setAttribute('aria-expanded', 'true');
  abePlace();
}

function abeCloseList() {
  abe.open = false;
  abe.list = [];
  abe.at = -1;
  if (abe.card) abe.card.hidden = true;
  if (abe.btn) abe.btn.setAttribute('aria-expanded', 'false');
  var browser = document.getElementById('browser');
  if (browser) browser.classList.remove('atlas-engines-open');
}

function abeHide() {
  abeCloseList();
  abe.input = null;
  abe.requery = false;
  if (abe.btn) abe.btn.hidden = true;
  var browser = document.getElementById('browser');
  if (browser) browser.classList.remove('atlas-enginebtn-on');
}

function abeSync() {
  if (window.vivaldi && vivaldi.searchEngines) syncAddressBarEngine();
}

/* Pick an engine: the new tab's engine too, and Vivaldi's default (15). */
function abeChoose(item) {
  if (!item) return;
  if (item.lists) {
    var input = abe.input;
    abeHide();
    if (input) input.blur();
    chrome.tabs.update({ url: EXT + 'index.html?engines' }, function () { void chrome.runtime.lastError; });
    return;
  }
  abe.r.selectedSearchEngine = item.key;
  if (abe.r.searchEngineBehavior === 'always-default') engineOverride = item.key;
  abe.requery = true;
  abeCloseList();
  abeShowButton();
  chrome.storage.sync.set({ selectedSearchEngine: item.key }, function () { void chrome.runtime.lastError; });
  abeSync();
}

/* Vivaldi now searches with the picked engine. If text was typed before the
   pick, Vivaldi's own suggestion for it still names the old engine, so ask it
   to look again: the same text, typed anew. */
function abeEngineApplied() {
  if (!abe.requery) return;
  abe.requery = false;
  var input = abe.input;
  if (!input || !input.value || document.activeElement !== input) return;
  setTimeout(function () { if (abe.input === input) abeRequery(input); }, 150);
}

function abeRequery(input) {
  var v = input.value, set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  set.call(input, v + ' ');
  input.dispatchEvent(new Event('input', { bubbles: true }));
  set.call(input, v);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

/* The keys while the engine pills show, before the bookmark pills or Vivaldi see them. */
function abeKey(e) {
  if (!abe.open || e.target !== abe.input) return;
  var n = abe.list.length;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    abe.at = (abe.at + (e.key === 'ArrowDown' ? 1 : n - 1)) % n;
    abeRender();
  } else if (e.key === 'Enter' && !e.shiftKey && !e.altKey && !e.metaKey && !e.ctrlKey) {
    abeChoose(abe.list[abe.at]);
  } else if (e.key === 'Escape') {
    abeCloseList();
  } else {
    return;
  }
  e.preventDefault();
  e.stopPropagation();
}

if (typeof document !== 'undefined' && document.addEventListener) {
  document.addEventListener('focusin', function (e) {
    if (!apbField(e.target)) return;
    abe.input = e.target;
    clearTimeout(abe.revert);
    abeLoadIcons();
    abeShowButton();
  });
  document.addEventListener('input', function (e) { if (abe.open && e.target === abe.input) abeCloseList(); });
  document.addEventListener('focusout', function (e) {
    if (!apbField(e.target)) return;
    abeHide();
    if (engineOverride) {
      abe.revert = setTimeout(function () {
        if (abe.input) return;
        engineOverride = null;
        abeSync();
      }, ABE_REVERT_MS);
    }
  });
  window.addEventListener('keydown', abeKey, true);
  window.addEventListener('resize', function () { if (abe.input) abePlace(); });
}

if (chrome.storage && chrome.storage.sync) {
  chrome.storage.sync.get(['customSearchEngines', 'defaultEngineKey', 'selectedSearchEngine', 'searchEngineBehavior'], function (r) {
    void chrome.runtime.lastError;
    abe.r = r || {};
    if (abe.input) abeShowButton();
  });
  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area !== 'sync') return;
    var hit = false;
    ENGINE_KEYS.forEach(function (k) { if (changes[k]) { abe.r[k] = changes[k].newValue; hit = true; } });
    if (!hit || !abe.input) return;
    abeShowButton();
    if (abe.open) abeOpenList();
  });
}
