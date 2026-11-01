/* ── downloads-panel.js: the Downloads sidebar, laid out like chrome://downloads ──
   Draws chrome.downloads items as Chromium's page does: a "Download History" bar
   with search and Clear all, a heading per day, and one card per download.
   The words and grouping live in downloads-core.js. Opened as a web panel by
   src/modules/34-downloads-panel.js when a download starts. ── */
(function () {
  'use strict';
  var Core = window.AtlasDownloadsCore;
  var dl = window.chrome && chrome.downloads;
  var SVG = 'http://www.w3.org/2000/svg';
  var PATHS = {
    copy: 'M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z',
    show: 'M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 12H4V8h16v10z',
    remove: 'M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z',
    cancel: 'M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z',
    pause: 'M6 19h4V5H6v14zm8-14v14h4V5h-4z',
    resume: 'M8 5v14l11-7z',
    retry: 'M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z',
    search: 'M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z',
  };
  var LABELS = { copy: 'Copy download link', show: 'Show in folder', remove: 'Remove from list', cancel: 'Cancel',
    pause: 'Pause', resume: 'Resume', retry: 'Retry' };
  var BLANK = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path d="M8 3h11l7 7v19H8z" fill="#c4c7c5"/><path d="M19 3v7h7z" fill="#a8abaa"/></svg>');
  var items = {}, icons = {}, query = '';
  var $ = function (id) { return document.getElementById(id); };

  function icon(name) {
    var s = document.createElementNS(SVG, 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    var p = document.createElementNS(SVG, 'path');
    p.setAttribute('d', PATHS[name]);
    s.appendChild(p);
    return s;
  }
  function node(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text) e.textContent = text;
    return e;
  }
  function button(act) {
    var b = node('button', 'icon-button');
    b.type = 'button';
    b.dataset.act = act;
    b.title = b.ariaLabel = LABELS[act];
    b.appendChild(icon(act));
    return b;
  }

  function fileIcon(item) {
    var img = node('img', 'file-icon');
    img.alt = '';
    img.dataset.id = item.id;
    img.src = icons[item.id] || BLANK;
    return img;
  }

  function progressBar(p) {
    var bar = node('div', 'progress' + (p.indeterminate ? ' indeterminate' : ''));
    var fill = node('div', 'progress-fill');
    fill.style.width = Math.round(p.value * 100) + '%';
    bar.appendChild(fill);
    return bar;
  }

  function nameNode(item, d) {
    var name = Core.fileName(item);
    if (item.state === 'complete' && d.active) {
      var a = node('a', 'name link', name);
      a.href = item.url;
      a.dataset.act = 'open';
      a.title = name;
      return a;
    }
    var s = node('span', 'name', name);
    s.title = name;
    return s;
  }

  function details(item, d) {
    var box = node('div', 'details'), top = node('div', 'title-area');
    top.appendChild(nameNode(item, d));
    if (d.tag) top.appendChild(node('span', 'tag', d.tag));
    box.appendChild(top);
    if (d.from) box.appendChild(node('div', 'origin', 'From ' + d.from));
    if (d.by) box.appendChild(node('div', 'origin', 'Downloaded by extension: ' + d.by));
    if (d.text) box.appendChild(node('div', 'description', d.text));
    if (d.progress) box.appendChild(progressBar(d.progress));
    return box;
  }

  function card(item, now) {
    var d = Core.describe(item, now);
    var c = node('div', 'card ' + (d.active ? 'is-active' : 'is-inactive'));
    c.dataset.id = item.id;
    c.appendChild(fileIcon(item));
    c.appendChild(details(item, d));
    var acts = node('div', 'actions');
    Core.actions(item).forEach(function (a) { acts.appendChild(button(a)); });
    c.appendChild(acts);
    return c;
  }

  function visible() {
    return Object.keys(items).map(function (k) { return items[k]; }).filter(function (i) { return Core.matches(i, query); });
  }

  function render() {
    var list = $('list'), top = list.scrollTop, now = Date.now(), shown = visible();
    list.textContent = '';
    if (!shown.length) {
      list.appendChild(node('div', 'empty', query ? 'No search results found' : 'No downloads'));
    }
    Core.groupByDay(shown, now).forEach(function (g) {
      var h = node('div', 'date', g.label);
      h.setAttribute('role', 'heading');
      list.appendChild(h);
      g.items.forEach(function (item) { list.appendChild(card(item, now)); });
    });
    list.scrollTop = top;
    $('clear-all').hidden = !Object.keys(items).some(function (k) { return items[k].state !== 'in_progress'; });
    loadIcons(shown);
  }

  function loadIcons(shown) {
    shown.forEach(function (item) {
      if (icons[item.id] || !dl.getFileIcon || item.exists === false) return;
      dl.getFileIcon(item.id, { size: 32 }, function (url) {
        void chrome.runtime.lastError;
        if (!url) return;
        icons[item.id] = url;
        var img = document.querySelector('img.file-icon[data-id="' + item.id + '"]');
        if (img) img.src = url;
      });
    });
  }

  function put(item) { if (item) { items[item.id] = item; render(); } }
  function refresh(id) { dl.search({ id: id }, function (r) { put(r && r[0]); }); }

  var actions = {
    open: function (item) { dl.open(item.id); },
    copy: function (item) { navigator.clipboard.writeText(item.finalUrl || item.url); },
    show: function (item) { dl.show(item.id); },
    remove: function (item) { dl.erase({ id: item.id }); },
    cancel: function (item) { dl.cancel(item.id, function () { refresh(item.id); }); },
    pause: function (item) { dl.pause(item.id, function () { refresh(item.id); }); },
    resume: function (item) { dl.resume(item.id, function () { refresh(item.id); }); },
    retry: function (item) { dl.download({ url: item.url }); },
  };

  function onClick(e) {
    var t = e.target.closest('[data-act]'), c = e.target.closest('.card');
    if (!t || !c || !items[c.dataset.id]) return;
    e.preventDefault();
    actions[t.dataset.act](items[c.dataset.id]);
    void chrome.runtime.lastError;
  }

  function setSearch(on) {
    $('bar').classList.toggle('searching', on);
    $('search').hidden = !on;
    if (on) $('search').focus();
    else { $('search').value = ''; query = ''; render(); }
  }

  function wire() {
    $('list').addEventListener('click', onClick);
    $('search-toggle').addEventListener('click', function () { setSearch(!$('bar').classList.contains('searching')); });
    $('search').addEventListener('input', function () { query = $('search').value; render(); });
    $('search').addEventListener('keydown', function (e) { if (e.key === 'Escape') setSearch(false); });
    $('clear-all').addEventListener('click', function () {
      dl.erase({ state: 'complete' });
      dl.erase({ state: 'interrupted' });
    });
    window.addEventListener('storage', function (e) {
      if (e.key === '_themeCache' && window.__applyTheme) window.__applyTheme(e.newValue);
    });
  }

  function listen() {
    dl.onCreated.addListener(put);
    dl.onChanged.addListener(function (delta) { refresh(delta.id); });
    dl.onErased.addListener(function (id) { delete items[id]; render(); });
    // bytesReceived does not raise onChanged, so a running download is re-read every second.
    setInterval(function () {
      var running = Object.keys(items).filter(function (k) { return items[k].state === 'in_progress'; });
      running.forEach(function (k) { refresh(items[k].id); });
    }, 1000);
  }

  function start() {
    if (!dl) { $('list').appendChild(node('div', 'empty', 'Downloads are not available here')); return; }
    wire();
    listen();
    dl.search({ orderBy: ['-startTime'], limit: 300 }, function (all) {
      (all || []).forEach(function (i) { items[i.id] = i; });
      render();
    });
  }
  start();
})();
