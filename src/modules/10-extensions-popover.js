/* ── 10-extensions-popover.js: the Atlas Extensions popover (search, pages,
   per-extension menu) that replaces Vivaldi's own extensions dropdown. ── */

var EXT_HIDDEN_PREF = 'vivaldi.address_bar.extensions.hidden_extensions', EXT_PAGE_SIZE = 8;
var extPop = null, extPopPage = 0, extPopQuery = '', extPopAnchor = null;

function closeExtPop() {
  if (typeof Atlas.setPanelBlur === 'function') Atlas.setPanelBlur(false);
  else if (typeof setPanelBlur === 'function') setPanelBlur(false);
  if (!extPop) return;
  extPop.remove();
  extPop = null;
  extPopPage = 0;
  extPopQuery = '';
  document.removeEventListener('mousedown', extPopAway, true);
  document.removeEventListener('keydown', extPopKey, true);
  if (typeof window !== 'undefined' && window.removeEventListener) window.removeEventListener('blur', closeExtPop);

  /* Force re-evaluation of hover on extensions toggle button */
  var tgl = document.querySelector('.toolbar-extensions [data-name="Extensions"]');
  if (tgl) {
    tgl.style.pointerEvents = 'none';
    requestAnimationFrame(function () { tgl.style.pointerEvents = ''; });
  }
}

function extPopAway(e) {
  if (extPop && !extPop.contains(e.target) &&
      !(e.target.closest && e.target.closest('.toolbar-extensions')) &&
      !(e.target.closest && e.target.closest('.atlas-profile-menu'))) {
    closeExtPop();
  }
}

function refreshExtPop() {
  if (extPop && extPopAnchor) renderExtPop(extPopAnchor);
}

if (chrome.management && chrome.management.onUninstalled) {
  chrome.management.onUninstalled.addListener(function () { refreshExtPop(); });
}

function extPopKey(e) {
  if (e.key === 'Escape') { closeExtPop(); e.stopPropagation(); }
}

function smallIcon(ext) {
  if (!ext.icons || !ext.icons.length) return '';
  var best = ext.icons.slice().sort(function (a, b) { return a.size - b.size; }).filter(function (i) { return i.size >= 16; })[0] || ext.icons[0];
  return best.url;
}

function renderExtPop(anchor) {
  extPopAnchor = anchor;
  prewarmNativePuzzle();
  chrome.management.getAll(function (all) {
    var exts = (all || []).filter(function (e) {
      return e.type === 'extension' && e.enabled && e.id !== chrome.runtime.id;
    }).sort(function (a, b) { return a.name.localeCompare(b.name); });
    drawExtPop(anchor, exts);
  });
}

function drawExtPop(anchor, exts) {
  closeExtPop();
  extPop = document.createElement('div');
  extPop.className = 'atlas-ext-pop';

  var qy = extPopQuery.toLowerCase();
  var filtered = exts.filter(function (e) { return !qy || e.name.toLowerCase().indexOf(qy) !== -1; });
  var pages = Math.max(1, Math.ceil(filtered.length / EXT_PAGE_SIZE));
  if (extPopPage >= pages) extPopPage = pages - 1;
  var slice = filtered.slice(extPopPage * EXT_PAGE_SIZE, (extPopPage + 1) * EXT_PAGE_SIZE);

  if (exts.length > EXT_PAGE_SIZE) extPop.appendChild(extPopSearch(anchor, exts));

  var rowsBox = document.createElement('div');
  rowsBox.className = 'aep-rows';
  extPop.appendChild(rowsBox);
  if (!slice.length) {
    var none = document.createElement('div');
    none.className = 'aep-empty';
    none.textContent = exts.length ? 'No matches' : 'No extensions';
    rowsBox.appendChild(none);
  }
  slice.forEach(function (ext) { rowsBox.appendChild(extPopRow(ext)); });

  if (filtered.length > EXT_PAGE_SIZE) extPop.appendChild(extPopPager(anchor, exts, pages));
  extPop.appendChild(extPopFoot());
  (document.getElementById('browser') || document.body).appendChild(extPop);
  placeExtPop(anchor);

  document.addEventListener('mousedown', extPopAway, true);
  document.addEventListener('keydown', extPopKey, true);
  if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('blur', closeExtPop);

  if (typeof Atlas.setPanelBlur === 'function') Atlas.setPanelBlur(true);
  else if (typeof setPanelBlur === 'function') setPanelBlur(true);
}

/* The search field, shown once there is more than one page of extensions. */
function extPopSearch(anchor, exts) {
  var sw = document.createElement('div');
  sw.className = 'aep-searchwrap';
  var si = document.createElement('input');
  si.className = 'aep-search';
  si.type = 'text';
  si.placeholder = 'Search extensions';
  si.value = extPopQuery;
  si.addEventListener('input', function () {
    extPopQuery = si.value;
    extPopPage = 0;
    var pos = si.selectionStart;
    drawExtPop(anchor, exts);
    var nsi = extPop.querySelector('.aep-search');
    if (nsi) { nsi.focus(); nsi.setSelectionRange(pos, pos); }
  });
  sw.appendChild(si);
  return sw;
}

/* One extension: click opens its popup (or its options), right-click its menu. */
function extPopRow(ext) {
  var row = document.createElement('div');
  row.className = 'aep-row';
  var img = document.createElement('img');
  img.className = 'aep-icon';
  var u = smallIcon(ext);
  if (u) img.src = u;
  row.appendChild(img);
  var nm = document.createElement('span');
  nm.className = 'aep-name';
  nm.textContent = ext.name;
  nm.title = ext.name;
  row.appendChild(nm);
  row.addEventListener('click', function () {
    closeExtPop();
    openExtensionAction(ext.id, function (ok) {
      if (!ok) chrome.tabs.create({ url: ext.optionsUrl || ('vivaldi://extensions/?id=' + ext.id) });
    });
  });
  row.addEventListener('contextmenu', function (e) {
    e.preventDefault();
    e.stopImmediatePropagation();
    var items = extRowMenu(ext);
    if (typeof Atlas.showUiMenu === 'function') Atlas.showUiMenu(e.clientX, e.clientY, items);
    else if (typeof showUiMenu === 'function') showUiMenu(e.clientX, e.clientY, items);
  });
  return row;
}

function extRowMenu(ext) {
  var items = [];
  if (ext.optionsUrl) items.push({ label: 'Options', run: function () { chrome.tabs.create({ url: ext.optionsUrl }); } });
  if (ext.homepageUrl) items.push({ label: 'Website', run: function () { chrome.tabs.create({ url: ext.homepageUrl }); } });
  items.push({ label: 'Details', run: function () { chrome.tabs.create({ url: 'vivaldi://extensions/?id=' + ext.id }); } });
  if (ext.mayDisable) {
    items.push({ sep: true });
    items.push({ label: 'Disable', run: function () {
      chrome.management.setEnabled(ext.id, false, function () { void chrome.runtime.lastError; refreshExtPop(); });
    } });
    items.push({ label: 'Remove…', run: function () {
      try {
        vivaldi.extensionActionUtils.removeExtension(ext.id, window.vivaldiWindowId);
      } catch (e) {
        chrome.management.uninstall(ext.id, { showConfirmDialog: true }, function () { void chrome.runtime.lastError; });
      }
    } });
  }
  return items;
}

function extPopPager(anchor, exts, pages) {
  var pager = document.createElement('div');
  pager.className = 'aep-pager';
  var prev = document.createElement('button');
  prev.textContent = '\u2039';
  prev.disabled = extPopPage === 0;
  prev.addEventListener('click', function () { extPopPage--; drawExtPop(anchor, exts); });
  var lab = document.createElement('span');
  lab.textContent = (extPopPage + 1) + ' / ' + pages;
  var nxt = document.createElement('button');
  nxt.textContent = '\u203a';
  nxt.disabled = extPopPage >= pages - 1;
  nxt.addEventListener('click', function () { extPopPage++; drawExtPop(anchor, exts); });
  pager.appendChild(prev); pager.appendChild(lab); pager.appendChild(nxt);
  return pager;
}

function extPopFoot() {
  var foot = document.createElement('button');
  foot.className = 'aep-foot';
  foot.textContent = 'Manage extensions';
  foot.addEventListener('click', function () {
    closeExtPop();
    chrome.tabs.create({ url: 'vivaldi://extensions' });
  });
  return foot;
}

/* Under the Extensions button, right-aligned, kept on screen; with the drop tail. */
function placeExtPop(anchor) {
  var ar = anchor.getBoundingClientRect();
  var pr = extPop.getBoundingClientRect();
  var left = Math.max(8, Math.min(ar.right - pr.width, window.innerWidth - pr.width - 8));
  extPop.style.left = left + 'px';
  extPop.style.top = (ar.bottom + 6) + 'px';
  if (typeof Atlas.addDropTail === 'function') Atlas.addDropTail(extPop, ar);
  else if (typeof addDropTail === 'function') addDropTail(extPop, ar);
}

var extBtnLast = 0;
['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(function (type) {
  document.addEventListener(type, function (e) {
    if (drivingNative) return;
    var btn = e.target.closest && e.target.closest('.toolbar-extensions [data-name="Extensions"]');
    if (!btn) return;
    e.stopImmediatePropagation();
    if (type === 'pointerdown' || type === 'mousedown') {
      var now = Date.now();
      if (now - extBtnLast < 250) return;
      extBtnLast = now;
      if (extPop) {
        closeExtPop();
      } else {
        if (typeof Atlas.closeMenu === 'function') Atlas.closeMenu();
        else if (typeof closeMenu === 'function') closeMenu();
        renderExtPop(btn);
      }
    }
  }, true);
});

Atlas.closeExtPop = closeExtPop;
