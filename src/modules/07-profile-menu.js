/* ── 07-profile-menu.js: Profile menu dropdown and "D" account button interceptor ── */

function addDropTail(panel, anchorRect) {
  var TW = 16, TH = 9;
  var pr = panel.getBoundingClientRect();
  var cs = window.getComputedStyle(panel);
  var bg = cs.backgroundColor, border = cs.borderTopColor;
  var ax = anchorRect.left + anchorRect.width / 2;
  var tx = Math.max(pr.left + 12, Math.min(ax, pr.right - 12));
  var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'atlas-drop-tail');
  svg.setAttribute('width', TW);
  svg.setAttribute('height', TH + 2);
  svg.setAttribute('viewBox', '0 0 ' + TW + ' ' + (TH + 2));
  svg.innerHTML =
    '<path d="M' + (TW / 2) + ',0 L' + TW + ',' + TH + ' L0,' + TH + ' Z" style="fill:' + bg + '"/>' +
    '<path d="M0,' + TH + ' L' + (TW / 2) + ',0 L' + TW + ',' + TH + '" style="fill:none;stroke:' + border + ';stroke-width:1"/>';
  svg.style.position = 'fixed';
  svg.style.left = (tx - TW / 2) + 'px';
  svg.style.top = (pr.top - TH + 2) + 'px';
  svg.style.zIndex = '10001';
  svg.style.pointerEvents = 'none';
  panel.appendChild(svg);
}

var AVATAR = '.toolbar-mainbar button[data-name="AccountButton"], button[data-name="AccountButton"], [data-name="AccountButton"]';
var menu = null;

/* Ask the new tab to do something. On a new tab already, message it; otherwise
   open one and message it once loaded. Settings can name a page (Profiles). */
function toNewTab(act, page) {
  var extUrl = 'chrome-extension://' + ATLAS_EXT_ID + '/';
  var targetUrl = extUrl + 'index.html' + (act === 'open-add' ? '?add=1' : (page ? '?settings=' + page : '') + '#settings');
  var msg = { atlas: { act: act } };
  if (page) msg.atlas.page = page;

  if (typeof chrome === 'undefined' || !chrome.tabs) {
    if (typeof window !== 'undefined') window.open(targetUrl, '_blank');
    return;
  }

  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    var activeTab = tabs && tabs[0];
    var isNewTab = activeTab && activeTab.url && (
      activeTab.url.indexOf(extUrl) === 0 ||
      activeTab.url.indexOf('chrome://newtab') === 0 ||
      activeTab.url.indexOf('vivaldi://newtab') === 0 ||
      activeTab.url.indexOf('index.html') !== -1
    );

    if (isNewTab) {
      chrome.tabs.sendMessage(activeTab.id, msg, function () {
        if (chrome.runtime && chrome.runtime.lastError) {
          chrome.tabs.update(activeTab.id, { url: targetUrl });
        }
      });
    } else {
      chrome.tabs.create({ url: targetUrl });
    }
  });
}
function openNewTabSettings(page) { toNewTab('open-settings', page); }
function openNewTabAdd() { toNewTab('open-add'); }

function setPanelBlur(on) {
  var b = document.getElementById('browser');
  if (b) b.classList.toggle('atlas-panel-blur', !!on);
}

function closeMenu() {
  setPanelBlur(false);
  if (!menu) return;
  menu.remove();
  menu = null;
  document.removeEventListener('mousedown', onDocDown, true);
  document.removeEventListener('keydown', onKeyDown, true);
  if (typeof window !== 'undefined' && window.removeEventListener) window.removeEventListener('blur', closeMenu);
}
function onDocDown(e) { if (menu && !menu.contains(e.target)) closeMenu(); }
function onKeyDown(e) { if (e.key === 'Escape') { closeMenu(); e.stopPropagation(); } }

/* Profiles come from AtlasProfiles (profilesCore.js, loaded by window.html before
   this file): the same list Settings > Profiles edits on the new tab. */
var pEsc = function (t) { return String(t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
function AP() { return window.AtlasProfiles || null; }

function applyCorner() {
  var ap = AP(), p = ap && ap.active();
  if (p) document.documentElement.style.setProperty('--atlas-corner-avatar', ap.cornerUrl(p));
}
function pIcon(d) { return '<svg viewBox="0 0 20 20" aria-hidden="true">' + d + '</svg>'; }
var PI = {
  plus: pIcon('<path d="M10 4.5v11M4.5 10h11"/>'),
  clock: pIcon('<circle cx="10" cy="10" r="7"/><path d="M10 6v4l2.5 1.5"/>'),
  down: pIcon('<path d="M10 3.5v9M6.5 9.5 10 13l3.5-3.5M4 16.5h12"/>'),
  gear: pIcon('<circle cx="10" cy="10" r="2.4"/><path d="M8.6 2.8h2.8l.4 2 1.6.9 1.9-.7 1.4 2.4-1.5 1.3v1.8l1.5 1.3-1.4 2.4-1.9-.7-1.6.9-.4 2H8.6l-.4-2-1.6-.9-1.9.7-1.4-2.4 1.5-1.3V9.1L3.3 7.8l1.4-2.4 1.9.7 1.6-.9z"/>')
};
var PACTS = {
  add: function () { openNewTabAdd(); },
  history: function () { chrome.tabs.create({ url: 'vivaldi://history' }); },
  downloads: function () { chrome.tabs.create({ url: 'vivaldi://downloads' }); },
  ext: function () { openNewTabSettings(); },
  browser: function () { chrome.tabs.create({ url: 'vivaldi://settings' }); }
};

function openMenu(btn) {
  closeMenu();
  if (typeof Atlas.closeUiMenu === 'function') Atlas.closeUiMenu();
  else if (typeof closeUiMenu === 'function') closeUiMenu();

  var host = document.getElementById('browser') || document.body;
  var r = btn.getBoundingClientRect(), ap = AP();

  menu = document.createElement('div');
  menu.className = 'atlas-profile-menu atlas-nosurf-menu atlas-newmenu';
  menu.setAttribute('role', 'menu');

  function row(act, icon, label) {
    return '<button type="button" class="apm-item" role="menuitem" data-act="' + act + '">' +
      icon + '<span class="apm-row-label">' + label + '</span></button>';
  }
  function fill() {
    var s = ap && ap.get(), head = '';
    if (s) {
      var cur = ap.active();
      head = '<div class="apm-strip">' + s.list.map(function (q) {
        return '<button type="button" class="apm-pick' + (q.id === cur.id ? ' on' : '') + '" data-pick="' + pEsc(q.id) +
          '" aria-label="' + pEsc(q.name) + '">' + ap.avatar(q, 'apm-av') + '</button>';
      }).join('') + '<button type="button" class="apm-pick apm-addbtn" data-add aria-label="Add or edit profiles" title="Add or edit profiles">' + PI.plus + '</button></div>' +
        '<div class="apm-who"><span class="apm-name">' + pEsc(cur.name) + '</span>' +
        (cur.label ? '<span class="apm-plan">' + pEsc(cur.label) + '</span>' : '') + '</div><div class="apm-sep"></div>';
    }
    menu.innerHTML = head + row('add', PI.plus, 'Add page or bookmark') +
      row('history', PI.clock, 'History') + row('downloads', PI.down, 'Downloads') +
      row('ext', PI.gear, 'Extension settings') + row('browser', PI.gear, 'Browser settings');
    menu.style.top = Math.round(r.bottom + 6) + 'px';
    menu.style.right = Math.round(window.innerWidth - r.right) + 'px';
    addDropTail(menu, r);
    applyCorner();
  }
  menu.__fill = fill;

  menu.addEventListener('click', function (ev) {
    ev.stopPropagation();
    var t = ev.target.closest ? ev.target : null;
    var pk = t && t.closest('[data-pick]'), act = t && t.closest('[data-act]');
    if (pk && ap) ap.switchTo(pk.getAttribute('data-pick')).then(function () { if (menu) fill(); });
    else if (t && t.closest('[data-add]')) { closeMenu(); openNewTabSettings('profiles'); }
    else if (act) { var f = PACTS[act.getAttribute('data-act')]; closeMenu(); try { f(); } catch (err) { atlasWarn('profile menu action failed', err); } }
  });

  host.appendChild(menu);
  setPanelBlur(true);
  fill();
  if (ap) ap.ready.then(function () { if (menu) fill(); });

  document.addEventListener('mousedown', onDocDown, true);
  document.addEventListener('keydown', onKeyDown, true);
  if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('blur', closeMenu);
}

/* Intercept left clicks to toggle custom profile menu; allow right clicks to reach toolbar context menu */
var lastToggle = 0;
function intercept(e) {
  var btn = e.target && e.target.closest && e.target.closest(AVATAR);
  if (!btn) return;

  if (e.type === 'contextmenu' || (e.button !== undefined && e.button !== 0)) {
    if (menu) closeMenu();
    return;
  }

  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();

  if (e.type === 'pointerdown' || e.type === 'mousedown') {
    var now = Date.now();
    if (now - lastToggle > 250) {
      lastToggle = now;
      if (menu) {
        closeMenu();
      } else {
        if (typeof Atlas.closeExtPop === 'function') Atlas.closeExtPop();
        else if (typeof closeExtPop === 'function') closeExtPop();
        openMenu(btn);
      }
    }
  }
}

['pointerdown', 'mousedown', 'mouseup', 'pointerup', 'click'].forEach(function (t) {
  document.addEventListener(t, intercept, true);
});

var _titleMutating = false;
function syncAccountTitle(el) {
  if (_titleMutating) return;
  var btn = (el && el.closest) ? el.closest(AVATAR) : (document.querySelector && document.querySelector(AVATAR));
  if (!btn) return;
  _titleMutating = true;
  try {
    if (btn.getAttribute('title') !== 'No Surf') btn.setAttribute('title', 'No Surf');
    if (btn.getAttribute('aria-label') !== 'No Surf') btn.setAttribute('aria-label', 'No Surf');
    var parent = btn.closest('.button-toolbar');
    if (parent && parent.getAttribute('title') && parent.getAttribute('title') !== 'No Surf') {
      parent.setAttribute('title', 'No Surf');
    }
  } finally {
    _titleMutating = false;
  }
}

function observeAccountButton() {
  if (AP() && !Atlas.__cornerWired) {
    Atlas.__cornerWired = true;
    AP().ready.then(applyCorner);
    AP().onChange(function () { applyCorner(); if (menu && menu.__fill) menu.__fill(); });
  }
  var btn = document.querySelector ? document.querySelector(AVATAR) : null;
  if (!btn) return;
  syncAccountTitle(btn);
  if (typeof MutationObserver !== 'undefined' && !btn.__atlasTitleObserved) {
    btn.__atlasTitleObserved = true;
    var mo = new MutationObserver(function () {
      if (_titleMutating) return;
      if (btn.getAttribute('title') !== 'No Surf' || btn.getAttribute('aria-label') !== 'No Surf') {
        syncAccountTitle(btn);
      }
    });
    mo.observe(btn, { attributes: true, attributeFilter: ['title', 'aria-label'] });
  }
}

function onHoverOrFocus(e) {
  var btn = e.target && e.target.closest ? e.target.closest(AVATAR) : null;
  if (btn) {
    syncAccountTitle(btn);
    observeAccountButton();
  }
}

['pointerenter', 'mouseenter', 'mouseover', 'focus'].forEach(function (t) {
  document.addEventListener(t, onHoverOrFocus, true);
});

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', observeAccountButton);
  } else {
    observeAccountButton();
  }
  setTimeout(observeAccountButton, 600);
  setTimeout(observeAccountButton, 2000);
}

Atlas.addDropTail = addDropTail;
Atlas.setPanelBlur = setPanelBlur;
Atlas.closeMenu = closeMenu;

