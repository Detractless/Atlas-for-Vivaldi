/* ── 07-extensions-popover.js: Extensions popover panel, search, grid and action driving ── */

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

/* Dispatch synthetic mouse/pointer event sequence to drive native buttons */
function fireSeq(el, cx, cy) {
  if (cx === undefined) {
    var r = el.getBoundingClientRect();
    if (r.width && r.height) { cx = r.left + r.width / 2; cy = r.top + r.height / 2; }
    else {
      var a = (document.querySelector('.toolbar-extensions') || el).getBoundingClientRect();
      cx = a.right - 8; cy = a.bottom + 2;
    }
  }
  cx = Math.round(cx); cy = Math.round(cy);
  var o = { bubbles: true, cancelable: true, composed: true, button: 0, buttons: 1,
            clientX: cx, clientY: cy, screenX: cx, screenY: cy };
  ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click'].forEach(function (t) {
    el.dispatchEvent(t.indexOf('pointer') === 0 ? new PointerEvent(t, o) : new MouseEvent(t, o));
  });
}

function extExpanded() {
  var icon = document.querySelector('.ExtensionToggleIcon');
  return icon && getComputedStyle(icon).getPropertyValue('--extensionsExpanded').trim() === '1';
}

var SPECIAL_EXT_BUTTONS = {
  'jplgfhpmjnbigmhklmmbgecoobifkmpa': '[data-name="VPNButton"]'
};

/* Anchor popup under address-field pill */
function anchorExtPopup() {
  function getAnchorRect() {
    var pill = document.querySelector('.UrlBar-AddressField');
    if (pill) return pill.getBoundingClientRect();
    var tb = document.querySelector('.toolbar-extensions');
    return tb ? tb.getBoundingClientRect() : { right: window.innerWidth - 8, bottom: 44 };
  }
  function place(p, tr) {
    p.style.setProperty('position', 'fixed', 'important');
    p.style.setProperty('transition', 'none', 'important');
    var w = p.getBoundingClientRect().width || 370;
    var left = Math.max(8, Math.min(Math.round(tr.right - w), window.innerWidth - w - 8));
    p.style.setProperty('left', left + 'px', 'important');
    p.style.setProperty('top', Math.round(tr.bottom + 4) + 'px', 'important');
  }
  var tries = 0;
  (function poll() {
    var p = document.querySelector('.extension-popup, [class*="ExtensionPopup"]');
    if (p) { place(p, getAnchorRect()); return; }
    if (++tries <= 25) setTimeout(poll, 40);
  })();
}

/* Prewarm puzzle on first open so extension buttons exist */
function prewarmNativePuzzle() {
  try {
    if (extExpanded()) return;
    var toggle = document.querySelector('.toolbar-extensions [data-name="Extensions"]');
    if (!toggle) return;
    window.__atlasDrivingNative = true;
    fireSeq(toggle);
    setTimeout(function () { if (extExpanded()) fireSeq(toggle); window.__atlasDrivingNative = false; }, 220);
  } catch (e) { window.__atlasDrivingNative = false; }
}

function openExtensionAction(extId, done) {
  var specialSel = SPECIAL_EXT_BUTTONS[extId];
  var special = specialSel && document.querySelector(specialSel);
  if (special) { fireSeq(special); anchorExtPopup(); done(true); return; }
  var toggle = document.querySelector('.toolbar-extensions [data-name="Extensions"]');
  if (!toggle) { done(false); return; }
  window.__atlasDrivingNative = true;
  var wasExpanded = extExpanded();
  if (!wasExpanded) fireSeq(toggle);
  var tries = 0, retried = false;
  (function poll() {
    var btn = document.querySelector('.toolbar-extensions button[data-name="' + extId + '"]');
    if (btn) {
      var box = btn.closest('.button-toolbar') || btn, boxPrev = box.style.cssText;
      var btnHadHidden = btn.classList.contains('ExtensionIcon--Hidden');
      var tr2 = toggle.getBoundingClientRect();
      var clickCx = Math.round(tr2.left + tr2.width / 2), clickCy = Math.round(tr2.top + tr2.height / 2);
      if (!wasExpanded && extExpanded()) fireSeq(toggle);
      box.style.cssText = 'display:flex!important;visibility:visible!important;' +
        'position:fixed!important;left:-9999px!important;top:0!important;' +
        'width:28px!important;height:28px!important;opacity:0!important;pointer-events:auto!important';
      if (btnHadHidden) btn.classList.remove('ExtensionIcon--Hidden');
      void box.offsetWidth;
      fireSeq(btn, clickCx, clickCy);
      anchorExtPopup();
      var popupSeen = false, watchTries = 0;
      (function watchPopup() {
        var p = document.querySelector('.extension-popup, [class*="ExtensionPopup"]');
        if (p) {
          popupSeen = true;
          setTimeout(watchPopup, 100);
          return;
        }
        if (!popupSeen && ++watchTries <= 20) { setTimeout(watchPopup, 50); return; }
        box.style.cssText = boxPrev;
        if (btnHadHidden) btn.classList.add('ExtensionIcon--Hidden');
        if (!wasExpanded && extExpanded()) fireSeq(toggle);
        window.__atlasDrivingNative = false;
      })();
      done(true);
      return;
    }
    if (++tries > 30) {
      if (!retried) {
        retried = true; tries = 0;
        if (!extExpanded()) fireSeq(toggle);
        setTimeout(poll, 90);
        return;
      }
      if (!wasExpanded && extExpanded()) fireSeq(toggle);
      window.__atlasDrivingNative = false;
      done(false);
      return;
    }
    setTimeout(poll, 50);
  })();
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
  var had = !!extPop;
  closeExtPop();
  extPop = document.createElement('div');
  extPop.className = 'atlas-ext-pop';

  var qy = extPopQuery.toLowerCase();
  var filtered = exts.filter(function (e) { return !qy || e.name.toLowerCase().indexOf(qy) !== -1; });
  var pages = Math.max(1, Math.ceil(filtered.length / EXT_PAGE_SIZE));
  if (extPopPage >= pages) extPopPage = pages - 1;
  var slice = filtered.slice(extPopPage * EXT_PAGE_SIZE, (extPopPage + 1) * EXT_PAGE_SIZE);

  if (exts.length > EXT_PAGE_SIZE) {
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
    extPop.appendChild(sw);
  }

  var rowsBox = document.createElement('div');
  rowsBox.className = 'aep-rows';
  extPop.appendChild(rowsBox);

  if (!slice.length) {
    var none = document.createElement('div');
    none.className = 'aep-empty';
    none.textContent = exts.length ? 'No matches' : 'No extensions';
    rowsBox.appendChild(none);
  }

  slice.forEach(function (ext) {
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
      if (typeof Atlas.showUiMenu === 'function') Atlas.showUiMenu(e.clientX, e.clientY, items);
      else if (typeof showUiMenu === 'function') showUiMenu(e.clientX, e.clientY, items);
    });
    rowsBox.appendChild(row);
  });

  if (filtered.length > EXT_PAGE_SIZE) {
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
    extPop.appendChild(pager);
  }

  var foot = document.createElement('button');
  foot.className = 'aep-foot';
  foot.textContent = 'Manage extensions';
  foot.addEventListener('click', function () {
    closeExtPop();
    chrome.tabs.create({ url: 'vivaldi://extensions' });
  });
  extPop.appendChild(foot);

  (document.getElementById('browser') || document.body).appendChild(extPop);
  var ar = anchor.getBoundingClientRect();
  var pr = extPop.getBoundingClientRect();
  var left = Math.max(8, Math.min(ar.right - pr.width, window.innerWidth - pr.width - 8));
  extPop.style.left = left + 'px';
  extPop.style.top = (ar.bottom + 6) + 'px';

  if (typeof Atlas.addDropTail === 'function') Atlas.addDropTail(extPop, ar);
  else if (typeof addDropTail === 'function') addDropTail(extPop, ar);

  document.addEventListener('mousedown', extPopAway, true);
  document.addEventListener('keydown', extPopKey, true);
  if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('blur', closeExtPop);

  if (typeof Atlas.setPanelBlur === 'function') Atlas.setPanelBlur(true);
  else if (typeof setPanelBlur === 'function') setPanelBlur(true);
  void had;
}

var extBtnLast = 0;
['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(function (type) {
  document.addEventListener(type, function (e) {
    if (window.__atlasDrivingNative) return;
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
