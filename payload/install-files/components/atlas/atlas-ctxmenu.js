/* Atlas context menu on web pages: which items a right-click gets (page, link,
   image, selection, text field with spelling and Harper suggestions) and what
   they do. Injected as a content script after atlas-menu.js, which draws the
   menu. Shift+right-click keeps the native menu. */
(function () {
  'use strict';
  if (window.__atlasCtx) return;
  window.__atlasCtx = true;

  function send(msg) {
    try { chrome.runtime.sendMessage({ atlas: msg }); } catch (e) { /* extension reloaded since this page loaded: nothing to tell */ }
  }
  function copy(text) {
    try { navigator.clipboard.writeText(text); } catch (e) { console.warn('[Atlas] copy failed', e); }
  }
  function copyImage(img) {
    var src = img.currentSrc || img.src;
    if (!navigator.clipboard || !window.ClipboardItem) { copy(src); return; }
    var item = new Promise(function (res, rej) {
      function draw(el, cb, fb) {
        try {
          var c = document.createElement('canvas');
          c.width = el.naturalWidth || el.width || 300; c.height = el.naturalHeight || el.height || 150;
          c.getContext('2d').drawImage(el, 0, 0);
          c.toBlob(function (b) { if (b) cb(b); else fb(); }, 'image/png');
        } catch (x) { fb(); }
      }
      draw(img, res, function () {
        var o = new Image(); o.crossOrigin = 'anonymous';
        o.onload = function () { draw(o, res, byFetch); };
        o.onerror = byFetch; o.src = src;
      });
      function byFetch() {
        fetch(src).then(function (r) { return r.blob(); }).then(function (b) {
          if (b.type === 'image/png') return res(b);
          if (!window.createImageBitmap) return rej();
          createImageBitmap(b).then(function (bmp) { draw(bmp, res, rej); }).catch(rej);
        }).catch(rej);
      }
    });
    navigator.clipboard.write([new ClipboardItem({ 'image/png': item })]).catch(function () { copy(src); });
  }
  function copyField(el, txt) { el.focus(); if (txt) copy(txt); else document.execCommand('copy'); }
  function cutField(el, txt, s, e) {
    el.focus();
    if (txt) {
      copy(txt);
      if (el.setRangeText && el.selectionStart !== undefined) {
        el.setRangeText('', Math.min(s, e), Math.max(s, e), 'end');
        el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
        return;
      }
    }
    document.execCommand('cut');
  }
  function getFieldSel(f, sel) {
    var s = 0, ed = 0, has = false, txt = '';
    try {
      if (f.selectionStart !== undefined) {
        s = f.selectionStart; ed = f.selectionEnd; has = s !== ed;
        if (has && f.value !== undefined) txt = f.value.slice(Math.min(s, ed), Math.max(s, ed));
      }
    } catch (x) { /* this kind of input has no selection range */ }
    if (!has && sel) { has = true; txt = sel; }
    return { s: s, ed: ed, has: has, txt: txt };
  }
  function isEditable(el) {
    if (!el) return null;
    var t = el.closest && el.closest('input, textarea, [contenteditable=""], [contenteditable="true"]');
    if (!t) return null;
    if (t.tagName === 'INPUT' && ['text', 'search', 'url', 'email', 'password', 'number', 'tel'].indexOf((t.type || 'text').toLowerCase()) === -1) return null;
    return t;
  }
  function insertText(t, text) {
    if (!text) return;
    t.focus();
    if (t.setRangeText) {
      t.setRangeText(text, t.selectionStart || 0, t.selectionEnd || 0, 'end');
      t.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      document.execCommand('insertText', false, text);
    }
  }

  function replaceWord(field, wordInfo, cand) {
    field.focus();
    if (field.setRangeText) {
      field.setRangeText(cand, wordInfo.start, wordInfo.end, 'end');
    } else {
      var val = field.value || '';
      field.value = val.slice(0, wordInfo.start) + cand + val.slice(wordInfo.end);
      if (field.selectionStart !== undefined) field.selectionStart = field.selectionEnd = wordInfo.start + cand.length;
    }
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function dispatchPaste(el, blob, txt) {
    el.focus();
    try {
      var dt = new DataTransfer();
      if (blob) dt.items.add(new File([blob], 'image.png', { type: blob.type || 'image/png' }));
      if (txt) dt.setData('text/plain', txt);
      var ev = new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt });
      if (!el.dispatchEvent(ev) && blob) return;
    } catch (e) { /* no DataTransfer/ClipboardEvent: fall back to inserting the text */ }
    if (txt) insertText(el, txt);
  }
  function pasteField(f) {
    f.focus();
    try { if (document.execCommand('paste')) return; } catch (x) { /* execCommand paste refused: read the clipboard instead */ }
    if (navigator.clipboard && navigator.clipboard.read) {
      navigator.clipboard.read().then(function (its) {
        for (var i = 0; i < its.length; i++) {
          var im = its[i].types.filter(function (t) { return /^image\//.test(t); })[0];
          if (im) return its[i].getType(im).then(function (b) { dispatchPaste(f, b, null); });
        }
        navigator.clipboard.readText().then(function (t) { dispatchPaste(f, null, t); }).catch(function () { /* clipboard refused: nothing to paste */ });
      }).catch(function () { navigator.clipboard.readText().then(function (t) { dispatchPaste(f, null, t); }).catch(function () { /* clipboard refused: nothing to paste */ }); });
    } else if (navigator.clipboard && navigator.clipboard.readText) {
      navigator.clipboard.readText().then(function (t) { dispatchPaste(f, null, t); }).catch(function () { /* clipboard refused: nothing to paste */ });
    }
  }

  function itemsFor(e) {
    var t = e.target;
    var field = isEditable(t);
    var sel = String(window.getSelection ? window.getSelection() : '').trim();
    if (field) return fieldItems(field, sel);
    var linkImg = linkImageItems(t);
    if (linkImg) return linkImg;
    if (sel) {
      return [
        { label: 'Copy', key: 'Ctrl+C', run: function () { copy(sel); } },
        { label: 'Search the web', run: function () { send({ act: 'opentab', url: 'https://www.google.com/search?q=' + encodeURIComponent(sel.slice(0, 500)), active: true }); } }
      ];
    }
    return [
      { label: 'Back', key: 'Alt+←', run: function () { history.back(); } },
      { label: 'Forward', key: 'Alt+→', run: function () { history.forward(); } },
      { label: 'Reload', key: 'Ctrl+R', run: function () { location.reload(); } },
      { sep: true }, { label: 'Copy address', run: function () { copy(location.href); } },
      { label: 'Save page as…', key: 'Ctrl+S', run: function () { send({ act: 'savepage', url: location.href }); } },
      { label: 'Print…', key: 'Ctrl+P', run: function () { setTimeout(function () { window.print(); }, 60); } }
    ];
  }

  /* Cut / Copy / Paste / Select all, with spelling suggestions first. */
  function fieldItems(field, sel) {
    var fSel = getFieldSel(field, sel);
    var items = [
      { label: 'Cut', key: 'Ctrl+X', dis: !fSel.has, run: function () { cutField(field, fSel.txt, fSel.s, fSel.ed); } },
      { label: 'Copy', key: 'Ctrl+C', dis: !fSel.has, run: function () { copyField(field, fSel.txt); } },
      { label: 'Paste', key: 'Ctrl+V', run: function () { pasteField(field); } },
      { sep: true },
      { label: 'Select all', key: 'Ctrl+A', run: function () { field.focus(); if (field.select) field.select(); else document.execCommand('selectAll'); } }
    ];
    var sugg = fieldSuggestions(field);
    if (!sugg) return items;
    var suggItems = sugg.words.slice(0, 3).map(function (c) { return { label: c, run: function () { replaceWord(field, sugg.wordInfo, c); } }; });
    suggItems.push({ sep: true });
    return suggItems.concat(items);
  }

  /* Spelling suggestions for the word at the caret, merged with the Harper
     extension's suggestions for that spot. Null when there are none. */
  function fieldSuggestions(field) {
    var sp = window.__atlasSpelling || (typeof Atlas !== 'undefined' && Atlas.spelling);
    if (!(sp && typeof sp.getWordAtInput === 'function')) return null;
    var wordInfo = sp.getWordAtInput(field);
    var suggs = (wordInfo && wordInfo.word && !sp.checkWord(wordInfo.word)) ? sp.getSuggestions(wordInfo.word, 3) : [];
    if (field.dataset && field.dataset.harperIssues) {
      try {
        var hi = JSON.parse(field.dataset.harperIssues);
        var p = (wordInfo && wordInfo.start !== undefined) ? wordInfo.start : (field.selectionStart || 0);
        for (var i = 0; i < hi.length; i++) {
          if (p >= hi[i].start && p <= hi[i].end && hi[i].suggestions) {
            hi[i].suggestions.forEach(function (s) { if (suggs.indexOf(s) === -1) suggs.push(s); });
            if (!wordInfo) wordInfo = { word: hi[i].matchedText, start: hi[i].start, end: hi[i].end };
          }
        }
      } catch (e) { /* Harper's issue list is unreadable: just our own suggestions */ }
    }
    return (suggs.length > 0 && wordInfo) ? { words: suggs, wordInfo: wordInfo } : null;
  }

  /* Link and image are considered TOGETHER: a thumbnail wrapped in a link
     used to show only the link options, so "Save image…" was unreachable on
     exactly the images people most want to save. Now each contributes its
     own group, and a target that is both shows both. Null for neither. */
  function linkImageItems(t) {
    var link = t.closest ? t.closest('a[href]') : null;
    var hasLink = link && /^https?:/i.test(link.href);
    /* the image can be the target itself or sit inside the clicked link */
    var img = (t.closest && t.closest('img')) || (link && link.querySelector && link.querySelector('img'));
    var hasImg = img && img.src && /^(https?|data|blob):/i.test(img.src);
    if (!hasLink && !hasImg) return null;
    var items = [];
    if (hasLink) {
      items.push({ label: 'Open link in this tab', run: function () { send({ act: 'opentab-current', url: link.href }); try { window.location.href = link.href; } catch (e) { /* the page blocks navigation: Atlas opens it instead */ } } });
      items.push({ label: 'Open link in new tab', run: function () { send({ act: 'opentab', url: link.href, active: true }); } });
      items.push({ label: 'Open link in background tab', run: function () { send({ act: 'opentab', url: link.href, active: false }); } });
      items.push({ label: 'Copy link', run: function () { copy(link.href); } });
    }
    if (hasImg) {
      if (items.length) items.push({ sep: true });
      items.push({ label: 'Open image in new tab', run: function () { send({ act: 'opentab', url: img.src, active: true }); } });
      items.push({ label: 'Copy image', run: function () { copyImage(img); } });
      items.push({ label: 'Save image…', run: function () { send({ act: 'download', url: img.src }); } });
    }
    return items;
  }

  /* Bubble phase: yields when the page already claimed the click (e.defaultPrevented). */
  document.addEventListener('contextmenu', function (e) {
    if (e.shiftKey) return;                    /* escape hatch: native menu */
    if (e.defaultPrevented) return;            /* the page owns this click */
    if (e.target && e.target.closest && e.target.closest('.harper-tooltip, [class*="harper"]')) return; /* Harper extension isolation */
    if (e.target && e.target.closest && e.target.closest('atlas-ctx')) { e.preventDefault(); return; }
    if (!window.__atlasMenu) return;            /* atlas-menu.js missing: keep the native menu */
    e.preventDefault();
    send({ act: 'ctxmenu-open' });
    window.__atlasMenu.open(e, itemsFor(e));
  }, false);

  /* Double-tap Command (macOS) or Control (Windows) focuses the address bar */
  var _lastTabModDown = 0;
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Meta' || e.key === 'Control') {
      if (e.repeat) return;
      var now = Date.now();
      if (now - _lastTabModDown < 350) {
        send({ act: 'focus-addressbar' });
        _lastTabModDown = 0;
      } else {
        _lastTabModDown = now;
      }
    } else {
      _lastTabModDown = 0;
    }
  }, true);
})();
