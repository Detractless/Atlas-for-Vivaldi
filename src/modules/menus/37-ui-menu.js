/* ── 37-ui-menu.js: the right-click menu Atlas draws in the browser window ──
   One menu for the tab, the address field, the toolbar and the extension buttons: 05, 06 and 10 ask for it
   through showUiMenu. Like the page menu (atlas-menu.js) it is drawn in a shadow root with its own style
   sheet instead of being styled by the CSS mods. The CSS mods load per profile (the installer writes that
   setting only to the profile it was run for), and in every other profile an unstyled menu was a transparent
   strip along the bottom edge of the window with only its arrow at the click.
   So: every colour lives in UI_MENU_CSS below, and nothing here may rely on a --atlas-* variable. ── */

var uiMenu = null;
var activeContextTab = null;

var UI_TAIL_SIZE = 34, UI_TAIL_GAP = 13;

/* The page menu's two palettes, so a tab menu and a page menu look the same. */
var UI_MENU_HOST_STYLE = 'all: initial; position: fixed; left: 0; top: 0; width: 0; height: 0; z-index: 2147483647;';
var UI_MENU_CSS = [
  '.wrap { --m-bg: #f6f6f6; --m-border: rgba(0,0,0,.10); --m-text: rgba(0,0,0,.9); --m-dim: rgba(0,0,0,.3); --m-key: rgba(0,0,0,.35); --m-keydim: rgba(0,0,0,.22); --m-hover: rgba(0,0,0,.06); --m-press: rgba(0,0,0,.08); --m-sep: rgba(0,0,0,.08); --m-shadow: 0 8px 24px rgba(0,0,0,.10), 0 1px 3px rgba(0,0,0,.05); }',
  '.wrap.dark { --m-bg: #262622; --m-border: rgba(255,255,255,.12); --m-text: rgba(255,255,255,.92); --m-dim: rgba(255,255,255,.32); --m-key: rgba(255,255,255,.4); --m-keydim: rgba(255,255,255,.25); --m-hover: rgba(255,255,255,.07); --m-press: rgba(255,255,255,.12); --m-sep: rgba(255,255,255,.09); --m-shadow: 0 8px 24px rgba(0,0,0,.30), 0 1px 3px rgba(0,0,0,.30); }',
  '.menu { position: fixed; min-width: 206px; box-sizing: border-box; background: var(--m-bg); border: 1px solid var(--m-border); border-radius: 12px; padding: 6px; box-shadow: var(--m-shadow); font-family: system-ui, "Segoe UI", sans-serif; }',
  '.apm-item { display: flex; justify-content: space-between; align-items: center; gap: 18px; width: 100%; height: 30px; box-sizing: border-box; padding: 0 10px; border: 0; border-radius: 7px; background: transparent; color: var(--m-text); font: inherit; font-size: 13px; text-align: left; white-space: nowrap; cursor: default; }',
  '.apm-item:hover { background: var(--m-hover); } .apm-item:active { background: var(--m-press); }',
  '.apm-item.dis { color: var(--m-dim); pointer-events: none; }',
  '.apm-key { font-size: 11.5px; color: var(--m-key); font-variant-numeric: tabular-nums; } .dis .apm-key { color: var(--m-keydim); }',
  '.apm-sep { height: 1px; margin: 5px 4px; background: var(--m-sep); }',
  '.tail { position: fixed; overflow: visible; pointer-events: none; } .tail .f { fill: var(--m-bg); } .tail .s { fill: none; stroke: var(--m-border); stroke-width: 1; }'
].join('\n');

function closeUiMenu() {
  atlasMark('atlas-menu-open', false);
  if (activeContextTab) {
    activeContextTab.classList.remove('atlas-tab-context-active');
    var p = activeContextTab.closest ? activeContextTab.closest('.tab-position') : null;
    if (p) p.classList.remove('atlas-tab-context-active');
    activeContextTab = null;
  }
  document.querySelectorAll('.atlas-tab-context-active').forEach(function (el) { el.classList.remove('atlas-tab-context-active'); });
  if (!uiMenu) return;
  uiMenu.remove();
  uiMenu = null;
  document.removeEventListener('mousedown', uiMenuAway, true);
  document.removeEventListener('keydown', uiMenuKey, true);
  if (typeof window !== 'undefined' && window.removeEventListener) window.removeEventListener('blur', closeUiMenu);
}

function uiMenuAway(e) { if (uiMenu && !uiMenu.contains(e.target)) closeUiMenu(); }
function uiMenuKey(e) { if (e.key === 'Escape') { closeUiMenu(); e.stopPropagation(); } }

function showUiMenu(x, y, items, tabNode) {
  closeUiMenu();
  dismissPageMenu();
  if (typeof Atlas.closeMenu === 'function') Atlas.closeMenu();
  else if (typeof closeMenu === 'function') closeMenu();

  if (tabNode) {
    tabNode.classList.add('atlas-tab-context-active');
    var pNode = tabNode.closest ? tabNode.closest('.tab-position') : null;
    if (pNode) pNode.classList.add('atlas-tab-context-active');
    activeContextTab = tabNode;
  }
  var browser = document.getElementById('browser');
  atlasMark('atlas-menu-open', true);
  uiMenu = document.createElement('div');
  uiMenu.className = 'atlas-ui-menu';
  uiMenu.setAttribute('style', UI_MENU_HOST_STYLE);
  var root = uiMenu.attachShadow({ mode: 'open' });
  var style = document.createElement('style');
  style.textContent = UI_MENU_CSS;
  root.appendChild(style);
  var wrap = document.createElement('div');
  wrap.className = 'wrap' + (browser && browser.classList.contains('theme-dark') ? ' dark' : '');
  var menuEl = document.createElement('div');
  menuEl.className = 'menu';
  items.forEach(function (it) { menuEl.appendChild(uiMenuEntry(it)); });
  wrap.appendChild(menuEl);
  root.appendChild(wrap);
  uiMenu.addEventListener('mousedown', function (ev) { ev.preventDefault(); });
  (browser || document.body).appendChild(uiMenu);
  placeUiMenu(x, y, menuEl, wrap);

  document.addEventListener('mousedown', uiMenuAway, true);
  document.addEventListener('keydown', uiMenuKey, true);
  if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('blur', closeUiMenu);
}

/* One row of the menu: a separator, or a button running it.run(). */
function uiMenuEntry(it) {
  if (it.sep) {
    var s = document.createElement('div'); s.className = 'apm-sep'; return s;
  }
  var b = document.createElement('button');
  b.className = 'apm-item' + (it.dis ? ' dis' : '');
  b.type = 'button';
  if (it.dis) b.disabled = true;
  var l = document.createElement('span');
  l.textContent = it.label;
  b.appendChild(l);
  if (it.key) {
    var k = document.createElement('span');
    k.className = 'apm-key';
    k.textContent = it.key;
    b.appendChild(k);
  }
  b.addEventListener('click', function (ev) {
    if (it.dis) return;
    ev.preventDefault(); ev.stopPropagation();
    closeUiMenu();
    try { it.run(); } catch (err) { atlasWarn('menu item ' + it.label + ' failed', err); }
  });
  return b;
}

/* Where the menu goes along one axis: past the click on the preferred side
   unless that overflows the viewport, then on the other side. */
function placeAxis(coord, size, viewport, preferHigh) {
  var pad = 6;
  var hi = coord + 2 + UI_TAIL_GAP - 1;
  var lo = coord - 2 - UI_TAIL_GAP + 1 - size;
  var high = preferHigh;
  if (high && hi + size > viewport - pad) high = false;
  else if (!high && lo < pad) high = true;
  var pos = high ? hi : lo;
  pos = Math.max(pad, Math.min(pos, viewport - size - pad));
  return { pos: pos, high: high };
}

/* Sharp-corner bubble: tail grows out of menu corner pointing diagonally at click point */
function placeUiMenu(x, y, menuEl, wrap) {
  var TS = UI_TAIL_SIZE;
  var r = menuEl.getBoundingClientRect();
  var vw = window.innerWidth, vh = window.innerHeight;
  var H = placeAxis(x, r.width, vw, x >= vw / 2);
  var V = placeAxis(y, r.height, vh, y < vh / 2);
  var right = H.high, down = V.high;
  menuEl.style.left = H.pos + 'px';
  menuEl.style.top = V.pos + 'px';

  var tail = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  tail.setAttribute('class', 'tail atlas-ui-tail');
  tail.setAttribute('width', TS);
  tail.setAttribute('height', TS);
  tail.setAttribute('viewBox', '0 0 ' + TS + ' ' + TS);
  tail.innerHTML =
    '<path class="f" d="M0,0 L27,13 L13,27 Z"/>' +
    '<path class="s" d="M27,13 L0,0 L13,27"/>';
  tail.style.left = (right ? x + 2 : x - 2 - TS) + 'px';
  tail.style.top = (down ? y + 2 : y - 2 - TS) + 'px';
  tail.style.transform = 'scale(' + (right ? 1 : -1) + ',' + (down ? 1 : -1) + ')';
  tail.style.transformOrigin = '50% 50%';
  wrap.appendChild(tail);
}

Atlas.showUiMenu = showUiMenu;
Atlas.closeUiMenu = closeUiMenu;
