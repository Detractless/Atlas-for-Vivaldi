/* A small three-dot tab joined to the top-right corner of the open sidebar. Click it for a card that
   drops down from it, in the style of the profile and shield menus: Close sidebar, Reload, Open in a
   new tab, Copy address. It lives in the browser window, outside the page, so it works for every
   sidebar, including pages Atlas can't put its own right-click menu into (another extension's
   panel, ChatGPT, Claude). */
var ATLAS_HANDLE_W = 26;
var ATLAS_HANDLE_H = 24;
var ATLAS_POP_W = 250;
var ATLAS_POP_GAP = 6; // space between the tab and the card, where the arrow sits
var atlasHandle = null;
var atlasPop = null;
var atlasHandleUntil = 0;
var ATLAS_POP_ICONS = {
  close: 'M6 6l12 12M18 6L6 18',
  reload: 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7',
  external: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  copy: 'M11 9h7a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2zM5 15V6a2 2 0 0 1 2-2h8',
};

function atlasPanelContainer() { return document.getElementById('panels-container'); }

/* The page in the sidebar that is showing: the panel webview with a width. */
function atlasPanelView() {
  var views = document.querySelectorAll('#panels-container webview'), i;
  for (i = 0; i < views.length; i++) if (views[i].getBoundingClientRect().width > 0) return views[i];
  return null;
}

/* The panel's own button in the (hidden) switch strip; pressing it again closes the sidebar. */
function atlasPanelSwitch(view) {
  var src = view.getAttribute('src') || '', id = null, m;
  if (/\/components\/atlas\/downloads-panel\.html/.test(src)) id = 'WEBPANEL_atlas_downloads';
  else if ((m = /^chrome-extension:\/\/([a-p]{32})\//.exec(src))) id = 'EXT_PANEL_' + m[1];
  var named = id && document.querySelector('[data-name="' + id + '"]');
  return named || document.querySelector('#switch button.button-on');
}

function atlasCloseSidebar() {
  var view = atlasPanelView(), button = view && atlasPanelSwitch(view);
  if (!button) return;
  ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(function (type) {
    var Kind = type.indexOf('pointer') === 0 && typeof PointerEvent === 'function' ? PointerEvent : MouseEvent;
    button.dispatchEvent(new Kind(type, { bubbles: true, cancelable: true, composed: true, button: 0 }));
  });
}

/* Extension panels show a page the browser UI can't read (ChatGPT's panel is an extension page holding
   chatgpt.com), so the address line for those is set here. */
var ATLAS_PANEL_HOSTS = { hehggadaopoacecdllhhajmbjkdcmajg: 'chatgpt.com' };

/* The card's heading: the page's tab title, and the website's address under it. Calls done(info). */
function atlasPanelInfo(view, done) {
  var src = view.getAttribute('src') || '', m = /^https?:\/\/([^\/?#]+)/.exec(src), ext = /^chrome-extension:\/\/([a-p]{32})\//.exec(src);
  if (/\/components\/atlas\/downloads-panel\.html/.test(src)) return done({ title: 'Downloads', sub: 'Atlas' });
  var host = m ? m[1].replace(/^www\./, '') : (ext && ATLAS_PANEL_HOSTS[ext[1]]) || '';
  var fallback = view.getAttribute('title') || host || 'Sidebar';
  if (!chrome.tabs || !chrome.tabs.query) return done({ title: fallback, sub: host });
  chrome.tabs.query({}, function (tabs) {
    var tab = (tabs || []).filter(function (t) { return t.url === src; })[0];
    done({ title: (tab && tab.title) || fallback, sub: host });
  });
}

function atlasPanelMenuItems(view) {
  var src = view.getAttribute('src') || '';
  return [
    { label: 'Close sidebar', icon: 'close', run: atlasCloseSidebar },
    { label: 'Reload sidebar', icon: 'reload', run: function () { if (view.reload) view.reload(); } },
    { label: 'Open in a new tab', icon: 'external', run: function () { chrome.tabs.create({ url: src }); } },
    { label: 'Copy address', icon: 'copy', run: function () { try { navigator.clipboard.writeText(src); } catch (err) { atlasWarn('copy address failed', err); } } },
  ];
}

function atlasPopIcon(name) {
  var NS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(NS, 'svg'), path = document.createElementNS(NS, 'path');
  svg.setAttribute('viewBox', '0 0 24 24');
  path.setAttribute('d', ATLAS_POP_ICONS[name]);
  svg.appendChild(path);
  return svg;
}

function atlasPopNode(tag, cls, text) {
  var el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text) el.textContent = text;
  return el;
}

function atlasClosePop() {
  if (!atlasPop) return;
  atlasPop.remove();
  atlasPop = null;
  document.removeEventListener('mousedown', atlasPopOutside, true);
  document.removeEventListener('keydown', atlasPopKey, true);
  window.removeEventListener('blur', atlasClosePop);
  window.removeEventListener('resize', atlasClosePop);
}

function atlasPopOutside(e) {
  if (atlasPop && !atlasPop.contains(e.target) && e.target !== atlasHandle) atlasClosePop();
}

function atlasPopKey(e) { if (e.key === 'Escape') atlasClosePop(); }

function atlasOpenPanelMenu(e) {
  e.preventDefault();
  e.stopPropagation();
  if (atlasPop) { atlasClosePop(); return; }
  var view = atlasPanelView(), box = atlasPanelContainer(), host = document.getElementById('browser');
  if (!view || !box || !host) return;
  var rect = box.getBoundingClientRect();
  atlasPanelInfo(view, function (info) {
    if (atlasPop) return;
    atlasBuildPop(view, info, rect, host);
  });
}

function atlasBuildPop(view, info, rect, host) {
  var pop = atlasPopNode('div', 'atlas-panel-pop');
  pop.setAttribute('role', 'menu');
  var head = atlasPopNode('div', 'atlas-panel-pop-head');
  head.appendChild(atlasPopNode('b', '', info.title));
  if (info.sub) head.appendChild(atlasPopNode('span', '', info.sub));
  pop.appendChild(head);
  atlasPanelMenuItems(view).forEach(function (it) {
    var row = atlasPopNode('button', 'atlas-panel-pop-item');
    row.type = 'button';
    row.setAttribute('role', 'menuitem');
    row.appendChild(atlasPopIcon(it.icon));
    row.appendChild(document.createTextNode(it.label));
    row.addEventListener('click', function (ev) { ev.stopPropagation(); atlasClosePop(); it.run(); });
    pop.appendChild(row);
  });
  // The card lines up with the sidebar's right edge; the arrow points up at the dots, 13px in from it.
  var right = rect.right, left = Math.max(rect.left + 6, right - ATLAS_POP_W);
  var dots = rect.right - ATLAS_HANDLE_W / 2;
  pop.style.left = Math.round(left) + 'px';
  pop.style.top = Math.round(rect.top + ATLAS_HANDLE_H + ATLAS_POP_GAP) + 'px';
  pop.style.width = Math.round(right - left) + 'px';
  pop.style.setProperty('--atlas-pop-arrow', Math.round(dots - left - 7) + 'px'); // the arrow is 14px wide, centred on the dots
  host.appendChild(pop);
  atlasPop = pop;
  document.addEventListener('mousedown', atlasPopOutside, true);
  document.addEventListener('keydown', atlasPopKey, true);
  window.addEventListener('blur', atlasClosePop);
  window.addEventListener('resize', atlasClosePop);
}

function atlasEnsureHandle() {
  if (atlasHandle && atlasHandle.isConnected) return atlasHandle;
  var host = document.getElementById('browser');
  if (!host) return null;
  atlasHandle = document.createElement('button');
  atlasHandle.type = 'button';
  atlasHandle.className = 'atlas-panel-handle';
  atlasHandle.title = 'Sidebar menu';
  atlasHandle.setAttribute('aria-label', 'Sidebar menu');
  atlasHandle.hidden = true;
  atlasHandle.addEventListener('click', atlasOpenPanelMenu);
  atlasHandle.addEventListener('contextmenu', atlasOpenPanelMenu);
  host.appendChild(atlasHandle);
  return atlasHandle;
}

/* Sit flush in the container's top-right corner while a sidebar page is showing; hide otherwise. */
function atlasPlaceHandle() {
  var box = atlasPanelContainer(), handle = atlasEnsureHandle();
  if (!box || !handle) return;
  var rect = box.getBoundingClientRect();
  var show = box.classList.contains('expanded') && rect.width > 40 && !!atlasPanelView();
  handle.hidden = !show;
  if (!show) { atlasClosePop(); return; }
  handle.style.left = Math.round(rect.right - ATLAS_HANDLE_W) + 'px';
  handle.style.top = Math.round(rect.top) + 'px';
}

/* The sidebar slides open and shut, so follow its edge for a moment after any change. */
function atlasTrackHandle() {
  atlasHandleUntil = Date.now() + 600;
  if (atlasTrackHandle.running) return;
  atlasTrackHandle.running = true;
  (function frame() {
    atlasPlaceHandle();
    if (Date.now() < atlasHandleUntil) requestAnimationFrame(frame);
    else atlasTrackHandle.running = false;
  })();
}

(function atlasWatchPanels() {
  var box = atlasPanelContainer();
  if (!box) { setTimeout(atlasWatchPanels, 500); return; } // the window is still being drawn
  if (typeof MutationObserver === 'function') new MutationObserver(atlasTrackHandle).observe(box, { attributes: true, childList: true, subtree: true, attributeFilter: ['class', 'style', 'src'] });
  if (typeof ResizeObserver === 'function') new ResizeObserver(atlasTrackHandle).observe(box);
  window.addEventListener('resize', atlasTrackHandle);
  atlasTrackHandle();
})();
