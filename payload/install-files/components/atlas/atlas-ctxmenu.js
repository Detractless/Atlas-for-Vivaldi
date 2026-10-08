/* Atlas context menu — shared component. Injected content script on web pages. Shift+right-click for native menu. */
(function () {
  'use strict';
  if (window.__atlasCtx) return;
  window.__atlasCtx = true;

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

  var host = null;

  function closeMenu() {
    if (host) { host.remove(); host = null; }
    document.removeEventListener('mousedown', onAway, true);
    document.removeEventListener('keydown', onKey, true);
    ['blur', 'resize'].forEach(function (v) { window.removeEventListener(v, closeMenu); });
    window.removeEventListener('scroll', closeMenu, true);
  }
  function onAway(e) { if (host && !host.contains(e.target)) closeMenu(); }
  function onKey(e) { if (e.key === 'Escape') { closeMenu(); e.stopPropagation(); } }

  function send(msg) {
    try { chrome.runtime.sendMessage({ atlas: msg }); } catch (e) { /* extension reloaded since this page loaded: nothing to tell */ }
  }
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener(function (m) {
      if (m && (m.atlas === 'closeContextMenu' || (m.atlas && m.atlas.act === 'closeContextMenu'))) closeMenu();
    });
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

  function openMenu(e, items) {
    closeMenu();
    send({ act: 'ctxmenu-open' });
    host = document.createElement('atlas-ctx');
    host.setAttribute('style', HOST_STYLE);
    var root = host.attachShadow({ mode: 'closed' });
    var style = document.createElement('style'); style.textContent = CSS; root.appendChild(style);
    var dark = pageIsDark();
    var wrap = document.createElement('div'); wrap.className = 'wrap' + (dark ? ' dark' : ''); root.appendChild(wrap);
    var menu = document.createElement('div'); menu.className = 'menu';
    items.forEach(function (it) { menu.appendChild(menuRow(it)); });
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
  }

  function menuRow(it) {
    if (it.sep) {
      var s = document.createElement('div'); s.className = 'sep'; return s;
    }
    var row = document.createElement('div'); row.className = 'mi' + (it.dis ? ' dis' : '');
    var l = document.createElement('span'); l.textContent = it.label; row.appendChild(l);
    if (it.key) {
      var k = document.createElement('span'); k.className = 'k'; k.textContent = it.key; row.appendChild(k);
    }
    row.addEventListener('mouseup', function (ev) {
      if (ev.button !== 0) return;
      closeMenu();
      try { it.run(); } catch (err) { console.warn('[Atlas] menu item "' + it.label + '" failed', err); }
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

  /* Bubble phase: yields when the page already claimed the click (e.defaultPrevented). */
  document.addEventListener('contextmenu', function (e) {
    if (e.shiftKey) return;                    /* escape hatch: native menu */
    if (e.defaultPrevented) return;            /* the page owns this click */
    if (e.target && e.target.closest && e.target.closest('.harper-tooltip, [class*="harper"]')) return; /* Harper extension isolation */
    if (host && host.contains(e.target)) { e.preventDefault(); return; }
    e.preventDefault();
    openMenu(e, itemsFor(e));
  }, false);
})();
