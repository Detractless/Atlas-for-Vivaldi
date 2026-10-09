/* ── atlas-menu.js: Atlas's right-click menu, drawn the same everywhere ──
   One menu for web pages (atlas-ctxmenu.js, the content script) and for
   Atlas's own pages (Settings in the new tab): a speech-bubble pointer whose
   tip sits just off the click, so the menu never covers the mouse; it opens
   toward the roomier half of the screen, flipping near the edges; light or
   dark with the Atlas theme. Drawn in a closed shadow root, so a web page's
   styles can't reach it.

     window.__atlasMenu.open({ clientX, clientY }, items, { focus })
       items: [{ label, key?, dis?, run }, { sep: true }, ...]
       focus: true when opened from the keyboard (arrow keys and Enter work)
     window.__atlasMenu.close()
     window.__atlasMenu.isOpen()
   The browser closes it with { atlas: 'closeContextMenu' } when one of its
   own menus opens. ── */
(function () {
  'use strict';
  if (window.__atlasMenu) return;
  var HOST_STYLE = 'all: initial; position: fixed; left: 0; top: 0; width: 0; height: 0; z-index: 2147483647;';
  /* Two palettes: light for Atlas menu, dark for Detractless warm-mono family. */
  var CSS = [
    '.wrap { --m-bg: #f6f6f6; --m-border: rgba(0,0,0,.10); --m-text: rgba(0,0,0,.9); --m-dim: rgba(0,0,0,.3); --m-key: rgba(0,0,0,.35); --m-keydim: rgba(0,0,0,.22); --m-hover: rgba(0,0,0,.06); --m-sep: rgba(0,0,0,.08); }',
    '.wrap.dark { --m-bg: #262622; --m-border: rgba(255,255,255,.12); --m-text: rgba(255,255,255,.92); --m-dim: rgba(255,255,255,.32); --m-key: rgba(255,255,255,.4); --m-keydim: rgba(255,255,255,.25); --m-hover: rgba(255,255,255,.07); --m-sep: rgba(255,255,255,.09); }',
    '.menu { position: fixed; min-width: 206px; box-sizing: border-box; background: var(--m-bg); border: 1px solid var(--m-border); border-radius: 12px; padding: 6px; box-shadow: 0 8px 24px rgba(0,0,0,.10), 0 1px 3px rgba(0,0,0,.05); font-family: system-ui, "Segoe UI", sans-serif; }',
    '.mi { display: flex; justify-content: space-between; align-items: center; gap: 18px; height: 30px; padding: 0 10px; border-radius: 7px; font-size: 13px; color: var(--m-text); white-space: nowrap; cursor: default; }',
    '.mi:hover { background: var(--m-hover); } .mi.dis { color: var(--m-dim); pointer-events: none; } .k { font-size: 11.5px; color: var(--m-key); font-variant-numeric: tabular-nums; } .dis .k { color: var(--m-keydim); } .sep { height: 1px; background: var(--m-sep); margin: 5px 4px; } .tail { position: fixed; overflow: visible; }'
  ].join('\n');
  var TAIL_COLORS = { light: { fill: '#f6f6f6', stroke: 'rgba(0,0,0,.10)' }, dark: { fill: '#262622', stroke: 'rgba(255,255,255,.12)' } };

  /* The menu follows the browser theme (Theme key in sync storage), matching atlas-pages.js. */
  var themeDark = false;
  function resolveThemeDark(cfg) {
    var m = (cfg && cfg.Theme) || 'dark';
    if (m === 'system') return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    return m === 'custom' || m === 'dark';
  }
  try {
    var syncTheme = function () { chrome.storage.sync.get('Theme', function (r) { themeDark = resolveThemeDark(r && r.Theme); }); };
    syncTheme();
    if (chrome.storage.onChanged) chrome.storage.onChanged.addListener(function (ch, area) { if (area === 'sync' && ch.Theme) themeDark = resolveThemeDark(ch.Theme.newValue); });
    if (window.matchMedia) window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', syncTheme);
  } catch (e) { /* no extension storage here: the menu stays light */ }
  function pageIsDark() { return themeDark; }

  /* Sharp corner tail points diagonally at click point; flips quadrants on edge clicks. */
  var TAIL = { size: 34, gap: 13, fill: 'M0,0 L27,13 L13,27 Z', stroke: 'M27,13 L0,0 L13,27' };

  var host = null, menuEl = null;

  function closeMenu() {
    if (host) { host.remove(); host = null; menuEl = null; }
    document.removeEventListener('mousedown', onAway, true);
    document.removeEventListener('keydown', onKey, true);
    ['blur', 'resize'].forEach(function (v) { window.removeEventListener(v, closeMenu); });
    window.removeEventListener('scroll', closeMenu, true);
  }
  function onAway(e) { if (host && !host.contains(e.target)) closeMenu(); }
  /* Escape closes (and stops there, so a page or Settings doesn't also act on
     it); the arrow keys and Enter work once the menu has focus (opened from
     the keyboard). */
  function rows() { return menuEl ? [].slice.call(menuEl.querySelectorAll('.mi:not(.dis)')) : []; }
  function onKey(e) {
    if (e.key === 'Escape') { closeMenu(); e.stopPropagation(); e.preventDefault(); return; }
    var list = rows(), at = list.indexOf(shadowFocus());
    if (at < 0) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault(); e.stopPropagation();
      list[(at + (e.key === 'ArrowDown' ? 1 : list.length - 1)) % list.length].focus();
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault(); e.stopPropagation();
      runRow(list[at]);
    }
  }
  function shadowFocus() { return menuEl && menuEl.getRootNode && menuEl.getRootNode().activeElement; }
  function runRow(row) {
    var run = row.__run, label = row.__label;
    closeMenu();
    if (run) { try { run(); } catch (err) { console.warn('[Atlas] menu item "' + label + '" failed', err); } }
  }

  function openMenu(e, items, opts) {
    closeMenu();
    host = document.createElement('atlas-ctx');
    host.setAttribute('style', HOST_STYLE);
    var root = host.attachShadow({ mode: 'closed' });
    var style = document.createElement('style'); style.textContent = CSS; root.appendChild(style);
    var dark = pageIsDark();
    var wrap = document.createElement('div'); wrap.className = 'wrap' + (dark ? ' dark' : ''); root.appendChild(wrap);
    var menu = document.createElement('div'); menu.className = 'menu';
    items.forEach(function (it) { menu.appendChild(menuRow(it)); });
    menuEl = menu;
    menu.addEventListener('mousedown', function (ev) { ev.preventDefault(); });
    wrap.appendChild(menu);

    /* Detractless's UI scale is document.body.style.zoom; the host lives
       inside that zoomed subtree, so it would inherit the scale AND have
       its fixed coordinates multiplied by it. Counter-zoom the host: the
       menu keeps one constant size and event coordinates map 1:1 again.
       On unscaled pages z = 1 and this is a no-op. */
    var z = 1;
    try { z = parseFloat(document.body && document.body.style.zoom) || 1; } catch (err) { /* no body yet: unscaled */ }
    if (z !== 1) host.style.zoom = String(1 / z);
    (document.body || document.documentElement).appendChild(host);

    placeMenu(menu, wrap, e.clientX, e.clientY, dark);

    document.addEventListener('mousedown', onAway, true);
    document.addEventListener('keydown', onKey, true);
    ['blur', 'resize'].forEach(function (v) { window.addEventListener(v, closeMenu); });
    window.addEventListener('scroll', closeMenu, true);
    if (opts && opts.focus) { var first = rows()[0]; if (first) first.focus(); }
  }

  function menuRow(it) {
    if (it.sep) {
      var s = document.createElement('div'); s.className = 'sep'; return s;
    }
    var row = document.createElement('div'); row.className = 'mi' + (it.dis ? ' dis' : '');
    row.setAttribute('role', 'menuitem'); row.tabIndex = -1; row.__run = it.dis ? null : it.run; row.__label = it.label;
    var l = document.createElement('span'); l.textContent = it.label; row.appendChild(l);
    if (it.key) {
      var k = document.createElement('span'); k.className = 'k'; k.textContent = it.key; row.appendChild(k);
    }
    row.addEventListener('mouseup', function (ev) {
      if (ev.button !== 0) return;
      runRow(row);
    });
    return row;
  }

  /* Placement: prefers screen-halves rule, flips opposite if cramped, clamps as last resort. */
  function placeAxis(coord, size, viewport, preferHigh) {
    var pad = 6;
    var hi = coord + 2 + TAIL.gap - 1;           /* menu starts just past click */
    var lo = coord - 2 - TAIL.gap + 1 - size;    /* menu ends just before click */
    var high = preferHigh;
    if (high && hi + size > viewport - pad) high = false;
    else if (!high && lo < pad) high = true;
    var pos = high ? hi : lo;
    pos = Math.max(pad, Math.min(pos, viewport - size - pad));
    return { pos: pos, high: high };
  }

  function placeMenu(menu, wrap, cx, cy, dark) {
    var r = menu.getBoundingClientRect();
    var vw = window.innerWidth, vh = window.innerHeight;
    var H = placeAxis(cx, r.width, vw, cx >= vw / 2);
    var V = placeAxis(cy, r.height, vh, cy < vh / 2);
    var right = H.high, down = V.high;
    menu.style.left = H.pos + 'px';
    menu.style.top = V.pos + 'px';

    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'tail'); svg.setAttribute('width', TAIL.size); svg.setAttribute('height', TAIL.size);
    svg.setAttribute('viewBox', '0 0 ' + TAIL.size + ' ' + TAIL.size);
    var tc = TAIL_COLORS[dark ? 'dark' : 'light'];
    svg.innerHTML =
      '<path d="' + TAIL.fill + '" fill="' + tc.fill + '"/>' +
      '<path d="' + TAIL.stroke + '" fill="none" stroke="' + tc.stroke + '" stroke-width="1"/>';
    svg.style.left = (right ? cx + 2 : cx - 2 - TAIL.size) + 'px';
    svg.style.top = (down ? cy + 2 : cy - 2 - TAIL.size) + 'px';
    /* Mirror about the box's CENTER: an edge origin shoves the flipped
       content a full box-width outside its own box, which is why every
       non-default quadrant rendered a detached, broken tail. */
    svg.style.transform = 'scale(' + (right ? 1 : -1) + ',' + (down ? 1 : -1) + ')';
    svg.style.transformOrigin = '50% 50%';

    /* tail after menu in the tree: its fill paints over the menu border
       underneath, welding the two into one bubble */
    wrap.appendChild(svg);
  }

  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener(function (m) {
      if (m && (m.atlas === 'closeContextMenu' || (m.atlas && m.atlas.act === 'closeContextMenu'))) closeMenu();
    });
  }

  window.__atlasMenu = { open: openMenu, close: closeMenu, isOpen: function () { return !!host; } };
})();
