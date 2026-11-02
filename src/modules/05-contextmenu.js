/* ── 05-contextmenu.js: right-click handlers for the tab, the address field and the web page, with spelling help in the field menus. The menu itself is drawn by 37-ui-menu.js. ── */

function dismissPageMenu() {
  try {
    if (chrome.tabs && chrome.tabs.query) {
      chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        if (tabs && tabs[0] && tabs[0].id) chrome.tabs.sendMessage(tabs[0].id, { atlas: 'closeContextMenu' }, function () { void chrome.runtime.lastError; });
      });
    }
  } catch (err) { /* no tabs API in this context: there is no page menu to close */ }
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

function copyFieldText(txt) { try { navigator.clipboard.writeText(txt); } catch (x) { atlasWarn('copy failed', x); } }
function copyFieldEl(el, sel) { el.focus(); if (sel.txt) copyFieldText(sel.txt); else document.execCommand('copy'); }
function getElSel(el) {
  var s = 0, ed = 0, has = false, txt = '';
  try {
    if (el.selectionStart !== undefined) {
      s = el.selectionStart; ed = el.selectionEnd; has = s !== ed;
      if (has && el.value !== undefined) txt = el.value.slice(Math.min(s, ed), Math.max(s, ed));
    }
  } catch (x) { /* this kind of input has no selection range: treat as nothing selected */ }
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

/* Spelling suggestions for the word under the caret go above the edit items. */
function withSpellingSuggestions(field, items) {
  if (!(Atlas.spelling && typeof Atlas.spelling.getWordAtInput === 'function')) return items;
  var wordInfo = Atlas.spelling.getWordAtInput(field);
  if (!(wordInfo && wordInfo.word && !Atlas.spelling.checkWord(wordInfo.word))) return items;
  var suggestions = Atlas.spelling.getSuggestions(wordInfo.word, 3);
  if (!(suggestions && suggestions.length > 0)) return items;
  var suggItems = suggestions.map(function (cand) {
    return { label: cand, run: function () { applyWord(field, wordInfo, cand); } };
  });
  suggItems.push({ sep: true });
  return suggItems.concat(items);
}

/* Paste into a field at the caret. A page field also hears "change". */
function pasteInto(field, alsoChange) {
  field.focus();
  navigator.clipboard.readText().then(function (txt) {
    if (!txt) return;
    if (field.setRangeText) {
      field.setRangeText(txt, field.selectionStart || 0, field.selectionEnd || 0, 'end');
      field.dispatchEvent(new Event('input', { bubbles: true }));
      if (alsoChange) field.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      document.execCommand('insertText', false, txt);
    }
  }).catch(function () { document.execCommand('paste'); });
}

/* Right-click on a tab: tab actions. True when the click was on a tab. */
function tabContextMenu(e) {
  var tabEl = e.target.closest && e.target.closest('.tab-position, .tab');
  if (!tabEl) return false;
  var idEl = tabEl.querySelector('[id^="tab-"]') || tabEl;
  var m = /tab-(\d+)/.exec(idEl.id || '');
  if (!m) return true;
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
  try { tabEl.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true })); } catch (err) { /* only hides the hover card; harmless if it fails */ }

  chrome.tabs.get(tid, function (t) {
    if (!t) { closeUiMenu(); return; }
    showUiMenu(px, py, [
      { label: 'Reload', run: function () { chrome.tabs.reload(tid); } },
      { label: 'Duplicate', run: function () { chrome.tabs.duplicate(tid); } },
      { label: t.pinned ? 'Unpin' : 'Pin', run: function () { chrome.tabs.update(tid, { pinned: !t.pinned }); } },
      { label: (t.mutedInfo && t.mutedInfo.muted) ? 'Unmute' : 'Mute', run: function () { chrome.tabs.update(tid, { muted: !(t.mutedInfo && t.mutedInfo.muted) }); } },
      { sep: true },
      { label: 'Copy address', run: function () { try { navigator.clipboard.writeText(t.url || ''); } catch (err) { atlasWarn('copy address failed', err); } } },
      { label: 'Close', run: function () { chrome.tabs.remove(tid); } }
    ], tabNode);
  });
  return true;
}

/* ── Address field context menu (Undo/Redo removed, spellcheck suggestions prepended) ──
   True when nothing more should handle the click. */
function addressContextMenu(e) {
  var addrField = e.target.closest && e.target.closest('.UrlBar-AddressField, .url-input, [data-name="AddressField"]');
  if (!addrField) return false;
  if (e.target.closest('.toolbar-extensions, .ExtensionToggleIcon')) return true;
  var input = addrField.querySelector('input') || (e.target.tagName === 'INPUT' ? e.target : null);
  if (!input) return false;
  e.preventDefault(); e.stopImmediatePropagation();
  var aSel = getElSel(input);
  var items = [
    { label: 'Cut', key: 'Ctrl+X', dis: !aSel.has, run: function () { cutFieldEl(input, aSel); } },
    { label: 'Copy', key: 'Ctrl+C', dis: !aSel.has, run: function () { copyFieldEl(input, aSel); } },
    { label: 'Paste', key: 'Ctrl+V', run: function () { pasteInto(input, false); } },
    { label: 'Paste and go', run: function () {
        navigator.clipboard.readText().then(function (txt) {
          pasteAndGo(txt);
        }).catch(function () { /* clipboard refused: nothing to paste */ });
      } },
    { sep: true },
    { label: 'Select all', key: 'Ctrl+A', run: function () { input.focus(); input.select(); } }
  ];
  showUiMenu(e.clientX, e.clientY, withSpellingSuggestions(input, items));
  return true;
}

/* The editable field under a web-page right-click, or null. */
function editableTarget(e) {
  var fieldEl = e.target.closest('input, textarea, [contenteditable="true"]');
  if (fieldEl && fieldEl.tagName === 'INPUT') {
    var itype = (fieldEl.type || 'text').toLowerCase();
    if (['text', 'search', 'url', 'email', 'password', 'number', 'tel'].indexOf(itype) === -1) return null;
  }
  return fieldEl;
}

/* ── Web page / startpage fallback context menu ── */
function pageContextMenu(e) {
  if (!(e.target.closest && e.target.closest('.webpageview, #webpage-stack'))) return;
  var fieldEl = editableTarget(e);
  e.preventDefault(); e.stopImmediatePropagation();
  if (fieldEl) {
    var fSel = getElSel(fieldEl);
    var editItems = [
      { label: 'Cut', key: 'Ctrl+X', dis: !fSel.has, run: function () { cutFieldEl(fieldEl, fSel); } },
      { label: 'Copy', key: 'Ctrl+C', dis: !fSel.has, run: function () { copyFieldEl(fieldEl, fSel); } },
      { label: 'Paste', key: 'Ctrl+V', run: function () { pasteInto(fieldEl, true); } },
      { sep: true },
      { label: 'Select all', key: 'Ctrl+A', run: function () { fieldEl.focus(); if (fieldEl.select) fieldEl.select(); } }
    ];
    showUiMenu(e.clientX, e.clientY, withSpellingSuggestions(fieldEl, editItems));
    return;
  }
  var qx = e.clientX, qy = e.clientY;
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    var t = tabs && tabs[0];
    if (!t) return;
    showUiMenu(qx, qy, [
      { label: 'Back', run: function () { chrome.tabs.goBack(t.id); } },
      { label: 'Forward', run: function () { chrome.tabs.goForward(t.id); } },
      { label: 'Reload', run: function () { chrome.tabs.reload(t.id); } },
      { sep: true },
      { label: 'Copy address', run: function () { try { navigator.clipboard.writeText(t.url || ''); } catch (err) { atlasWarn('copy address failed', err); } } }
    ]);
  });
}

document.addEventListener('contextmenu', function (e) {
  if (e.shiftKey) return;
  if (e.target.closest && e.target.closest('webview')) return;
  if (tabContextMenu(e)) return;
  if (addressContextMenu(e)) return;
  pageContextMenu(e);
}, true);

document.addEventListener('mousedown', function (e) {
  if (e.target && e.target.closest && !e.target.closest('.webpageview, #webpage-stack')) dismissPageMenu();
}, true);
if (chrome.tabs && chrome.tabs.onActivated) chrome.tabs.onActivated.addListener(dismissPageMenu);
