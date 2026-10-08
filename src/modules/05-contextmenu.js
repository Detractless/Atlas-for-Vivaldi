/* ── 03-contextmenu.js: UI context menu manager, tab active state, address bar menu & spelling ── */

var uiMenu = null;
var activeContextTab = null;

function closeUiMenu() {
  var bHost = document.getElementById('browser') || document.body;
  if (bHost) bHost.classList.remove('atlas-menu-open');
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

function dismissPageMenu() {
  try {
    if (chrome.tabs && chrome.tabs.query) {
      chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        if (tabs && tabs[0] && tabs[0].id) chrome.tabs.sendMessage(tabs[0].id, { atlas: 'closeContextMenu' }, function () { void chrome.runtime.lastError; });
      });
    }
  } catch (err) {}
}

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
  var host = document.getElementById('browser') || document.body;
  host.classList.add('atlas-menu-open');
  uiMenu = document.createElement('div');
  uiMenu.className = 'atlas-profile-menu';
  items.forEach(function (it) {
    if (it.sep) {
      var s = document.createElement('div'); s.className = 'apm-sep'; uiMenu.appendChild(s); return;
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
      try { it.run(); } catch (err) {}
    });
    uiMenu.appendChild(b);
  });
  uiMenu.addEventListener('mousedown', function (ev) { ev.preventDefault(); });
  host.appendChild(uiMenu);

  /* Sharp-corner bubble: tail grows out of menu corner pointing diagonally at click point */
  var TS = 34, TG = 13;
  var r = uiMenu.getBoundingClientRect();
  var vw = window.innerWidth, vh = window.innerHeight;

  function place(coord, size, viewport, preferHigh) {
    var pad = 6;
    var hi = coord + 2 + TG - 1;
    var lo = coord - 2 - TG + 1 - size;
    var high = preferHigh;
    if (high && hi + size > viewport - pad) high = false;
    else if (!high && lo < pad) high = true;
    var pos = high ? hi : lo;
    pos = Math.max(pad, Math.min(pos, viewport - size - pad));
    return { pos: pos, high: high };
  }
  var H = place(x, r.width, vw, x >= vw / 2);
  var V = place(y, r.height, vh, y < vh / 2);
  var right = H.high, down = V.high;
  uiMenu.style.left = H.pos + 'px';
  uiMenu.style.top = V.pos + 'px';
  uiMenu.style.right = 'auto';

  var tail = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  tail.setAttribute('class', 'atlas-ui-tail');
  tail.setAttribute('width', TS);
  tail.setAttribute('height', TS);
  tail.setAttribute('viewBox', '0 0 ' + TS + ' ' + TS);
  tail.innerHTML =
    '<path d="M0,0 L27,13 L13,27 Z" style="fill: var(--atlas-menu)"/>' +
    '<path d="M27,13 L0,0 L13,27" style="fill: none; stroke: var(--atlas-border); stroke-width: 1"/>';
  tail.style.position = 'fixed';
  tail.style.left = (right ? x + 2 : x - 2 - TS) + 'px';
  tail.style.top = (down ? y + 2 : y - 2 - TS) + 'px';
  tail.style.zIndex = '10001';
  tail.style.transform = 'scale(' + (right ? 1 : -1) + ',' + (down ? 1 : -1) + ')';
  tail.style.transformOrigin = '50% 50%';
  uiMenu.appendChild(tail);

  document.addEventListener('mousedown', uiMenuAway, true);
  document.addEventListener('keydown', uiMenuKey, true);
  if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('blur', closeUiMenu);
}

function pasteAndGo(text) {
  if (!text) return;
  text = text.trim();
  if (!text) return;
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    var t = tabs && tabs[0];
    if (!t) return;
    var target = text;
    if (!/^https?:\/\//i.test(target) && !/^(chrome|vivaldi|edge|file|view-source):/i.test(target)) {
      if (target.indexOf('.') > 0 && target.indexOf(' ') === -1 && target.indexOf('\n') === -1) {
        target = 'https://' + target;
      } else {
        target = 'https://www.google.com/search?q=' + encodeURIComponent(target);
      }
    }
    chrome.tabs.update(t.id, { url: target });
  });
}

function copyFieldText(txt) { try { navigator.clipboard.writeText(txt); } catch (x) {} }
function copyFieldEl(el, sel) { el.focus(); if (sel.txt) copyFieldText(sel.txt); else document.execCommand('copy'); }
function getElSel(el) {
  var s = 0, ed = 0, has = false, txt = '';
  try {
    if (el.selectionStart !== undefined) {
      s = el.selectionStart; ed = el.selectionEnd; has = s !== ed;
      if (has && el.value !== undefined) txt = el.value.slice(Math.min(s, ed), Math.max(s, ed));
    }
  } catch (x) {}
  return { s: s, ed: ed, has: has, txt: txt };
}
function cutFieldEl(el, sel) {
  el.focus();
  if (sel.txt) {
    copyFieldText(sel.txt);
    if (el.setRangeText && el.selectionStart !== undefined) {
      el.setRangeText('', Math.min(sel.s, sel.ed), Math.max(sel.s, sel.ed), 'end');
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
  }
  document.execCommand('cut');
}
function applyWord(el, info, cand) {
  el.focus();
  if (el.setRangeText) {
    el.setRangeText(cand, info.start, info.end, 'end');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  } else { document.execCommand('insertText', false, cand); }
}

document.addEventListener('contextmenu', function (e) {
  if (e.shiftKey) return;
  if (e.target.closest && e.target.closest('webview')) return;

  var tabEl = e.target.closest && e.target.closest('.tab-position, .tab');
  if (tabEl) {
    var idEl = tabEl.querySelector('[id^="tab-"]') || tabEl;
    var m = /tab-(\d+)/.exec(idEl.id || '');
    if (m) {
      e.preventDefault(); e.stopImmediatePropagation();
      var tid = parseInt(m[1], 10);
      var px = e.clientX, py = e.clientY;
      var tabNode = tabEl.classList.contains('tab') ? tabEl : (tabEl.querySelector('.tab') || tabEl);

      if (activeContextTab && activeContextTab !== tabNode) {
        activeContextTab.classList.remove('atlas-tab-context-active');
        var prevP = activeContextTab.closest ? activeContextTab.closest('.tab-position') : null;
        if (prevP) prevP.classList.remove('atlas-tab-context-active');
      }
      tabNode.classList.add('atlas-tab-context-active');
      var curP = tabNode.closest ? tabNode.closest('.tab-position') : null;
      if (curP) curP.classList.add('atlas-tab-context-active');
      activeContextTab = tabNode;
      try { tabEl.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true })); } catch (err) {}

      chrome.tabs.get(tid, function (t) {
        if (!t) { closeUiMenu(); return; }
        showUiMenu(px, py, [
          { label: 'Reload', run: function () { chrome.tabs.reload(tid); } },
          { label: 'Duplicate', run: function () { chrome.tabs.duplicate(tid); } },
          { label: t.pinned ? 'Unpin' : 'Pin', run: function () { chrome.tabs.update(tid, { pinned: !t.pinned }); } },
          { label: (t.mutedInfo && t.mutedInfo.muted) ? 'Unmute' : 'Mute', run: function () { chrome.tabs.update(tid, { muted: !(t.mutedInfo && t.mutedInfo.muted) }); } },
          { sep: true },
          { label: 'Copy address', run: function () { try { navigator.clipboard.writeText(t.url || ''); } catch (err) {} } },
          { label: 'Close', run: function () { chrome.tabs.remove(tid); } }
        ], tabNode);
      });
    }
    return;
  }

  /* ── Address field context menu (Undo/Redo removed, spellcheck suggestions prepended) ── */
  var addrField = e.target.closest && e.target.closest('.UrlBar-AddressField, .url-input, [data-name="AddressField"]');
  if (addrField) {
    if (e.target.closest('.toolbar-extensions, .ExtensionToggleIcon')) return;
    var input = addrField.querySelector('input') || (e.target.tagName === 'INPUT' ? e.target : null);
    if (input) {
      e.preventDefault(); e.stopImmediatePropagation();
      var ax = e.clientX, ay = e.clientY;
      var aSel = getElSel(input);
      var items = [
        { label: 'Cut', key: 'Ctrl+X', dis: !aSel.has, run: function () { cutFieldEl(input, aSel); } },
        { label: 'Copy', key: 'Ctrl+C', dis: !aSel.has, run: function () { copyFieldEl(input, aSel); } },
        { label: 'Paste', key: 'Ctrl+V', run: function () {
            input.focus();
            navigator.clipboard.readText().then(function (txt) {
              if (!txt) return;
              if (input.setRangeText) {
                input.setRangeText(txt, input.selectionStart || 0, input.selectionEnd || 0, 'end');
                input.dispatchEvent(new Event('input', { bubbles: true }));
              } else {
                document.execCommand('insertText', false, txt);
              }
            }).catch(function () {
              document.execCommand('paste');
            });
          } },
        { label: 'Paste and go', run: function () {
            navigator.clipboard.readText().then(function (txt) {
              pasteAndGo(txt);
            }).catch(function () {});
          } },
        { sep: true },
        { label: 'Select all', key: 'Ctrl+A', run: function () { input.focus(); input.select(); } }
      ];

      /* Prepend spelling suggestions if right-clicking a misspelled word */
      if (Atlas.spelling && typeof Atlas.spelling.getWordAtInput === 'function') {
        var wordInfo = Atlas.spelling.getWordAtInput(input);
        if (wordInfo && wordInfo.word && !Atlas.spelling.checkWord(wordInfo.word)) {
          var suggestions = Atlas.spelling.getSuggestions(wordInfo.word, 3);
          if (suggestions && suggestions.length > 0) {
            var suggItems = suggestions.map(function (cand) {
              return { label: cand, run: function () { applyWord(input, wordInfo, cand); } };
            });
            suggItems.push({ sep: true });
            items = suggItems.concat(items);
          }
        }
      }

      showUiMenu(ax, ay, items);
      return;
    }
  }

  /* ── Web page / startpage fallback context menu ── */
  if (e.target.closest && e.target.closest('.webpageview, #webpage-stack')) {
    var fieldEl = e.target.closest('input, textarea, [contenteditable="true"]');
    if (fieldEl && fieldEl.tagName === 'INPUT') {
      var itype = (fieldEl.type || 'text').toLowerCase();
      if (['text', 'search', 'url', 'email', 'password', 'number', 'tel'].indexOf(itype) === -1) {
        fieldEl = null;
      }
    }
    if (fieldEl) {
      e.preventDefault(); e.stopImmediatePropagation();
      var fx = e.clientX, fy = e.clientY;
      var fSel = getElSel(fieldEl);
      var editItems = [
        { label: 'Cut', key: 'Ctrl+X', dis: !fSel.has, run: function () { cutFieldEl(fieldEl, fSel); } },
        { label: 'Copy', key: 'Ctrl+C', dis: !fSel.has, run: function () { copyFieldEl(fieldEl, fSel); } },
        { label: 'Paste', key: 'Ctrl+V', run: function () {
            fieldEl.focus();
            navigator.clipboard.readText().then(function (txt) {
              if (!txt) return;
              if (fieldEl.setRangeText) {
                fieldEl.setRangeText(txt, fieldEl.selectionStart || 0, fieldEl.selectionEnd || 0, 'end');
                fieldEl.dispatchEvent(new Event('input', { bubbles: true }));
                fieldEl.dispatchEvent(new Event('change', { bubbles: true }));
              } else {
                document.execCommand('insertText', false, txt);
              }
            }).catch(function () { document.execCommand('paste'); });
          } },
        { sep: true },
        { label: 'Select all', key: 'Ctrl+A', run: function () { fieldEl.focus(); if (fieldEl.select) fieldEl.select(); } }
      ];
      if (Atlas.spelling && typeof Atlas.spelling.getWordAtInput === 'function') {
        var wordInfo = Atlas.spelling.getWordAtInput(fieldEl);
        if (wordInfo && wordInfo.word && !Atlas.spelling.checkWord(wordInfo.word)) {
          var suggestions = Atlas.spelling.getSuggestions(wordInfo.word, 3);
          if (suggestions && suggestions.length > 0) {
            var suggItems = suggestions.map(function (cand) {
              return { label: cand, run: function () { applyWord(fieldEl, wordInfo, cand); } };
            });
            suggItems.push({ sep: true });
            editItems = suggItems.concat(editItems);
          }
        }
      }
      showUiMenu(fx, fy, editItems);
      return;
    }

    e.preventDefault(); e.stopImmediatePropagation();
    var qx = e.clientX, qy = e.clientY;
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      var t = tabs && tabs[0];
      if (!t) return;
      showUiMenu(qx, qy, [
        { label: 'Back', run: function () { chrome.tabs.goBack(t.id); } },
        { label: 'Forward', run: function () { chrome.tabs.goForward(t.id); } },
        { label: 'Reload', run: function () { chrome.tabs.reload(t.id); } },
        { sep: true },
        { label: 'Copy address', run: function () { try { navigator.clipboard.writeText(t.url || ''); } catch (err) {} } }
      ]);
    });
    return;
  }
}, true);

document.addEventListener('mousedown', function (e) {
  if (e.target && e.target.closest && !e.target.closest('.webpageview, #webpage-stack')) dismissPageMenu();
}, true);
if (chrome.tabs && chrome.tabs.onActivated) chrome.tabs.onActivated.addListener(dismissPageMenu);

Atlas.showUiMenu = showUiMenu;
Atlas.closeUiMenu = closeUiMenu;
