/* Atlas profiles: one shared module for the new tab (index.html) and the Vivaldi
   UI (window.html). Both are the same extension origin, so they read and write
   the same chrome.storage.

   State lives in chrome.storage.local["atlasProfilesV2"]:
     { v:2, active, owner, share:{category:bool}, list:[{id,name,label,color,icon,google,db,settings}] }
   `google` is { email } of the Google account the profile is linked to, or null.
   `owner` is the profile whose values currently sit in the live settings keys
   (chrome.storage.sync). The new tab and its bundle keep reading those live keys,
   so a switch is a snapshot swap: save the live values of every UNSHARED category
   into the owner, then write the target's values (or defaults) over them.
   A shared category is never touched on a switch. */
(function () {
  'use strict';
  if (window.AtlasProfiles) return;

  var SKEY = 'atlasProfilesV2', LKEY = '__atlas_localstorage__', OLD = 'atlasProfiles';
  var MAIN_DB = 'DetractlessBookmarks';
  var COLORS = [['#f5c518', '#6b4e00'], ['#7db4ff', '#0b2a52'], ['#7fd6a0', '#0d3a22'],
    ['#f59ac0', '#5a1233'], ['#c3a6ff', '#2e1566'], ['#ffa970', '#5a2a00']];
  var CATS = [
    { id: 'bookmarks', label: 'Bookmarks & pages', keys: ['activeTabs'],
      on: 'Every profile sees the same bookmarks and pages.',
      off: 'Each profile has its own bookmarks and pages. Profiles other than the current one start empty.' },
    { id: 'theme', label: 'Theme', keys: ['Theme'],
      on: 'Every profile uses the same theme.', off: 'Each profile has its own theme.' },
    { id: 'appearance', label: 'Appearance', keys: ['uiScale', 'fadeInEnabled'],
      on: 'Every profile uses the same UI scale.', off: 'Each profile has its own UI scale.' },
    { id: 'search', label: 'Search', keys: ['spotlightVisible', 'searchEngineBehavior', 'bookmarkPillBehavior',
      'customSearchEngines', 'defaultEngineKey', 'selectedSearchEngine'],
      on: 'Every profile uses the same search bar, engines and pills.',
      off: 'Each profile has its own search bar, engines and pills.' },
    { id: 'focus', label: 'Focus', keys: ['tabLimit', 'managementMethod', 'pendingIncrease', 'searchDelaySeconds',
      'showQueryOnDelay', 'grayscale'],
      on: 'Every profile uses the same tab limit, search delay and grayscale.',
      off: 'Each profile has its own tab limit, search delay and grayscale.' }
  ];
  var DEFAULTS = { active: 'personal', list: [
    { id: 'personal', name: 'Christian Darby-Ward', label: 'Personal', color: 0 },
    { id: 'school', name: 'Christian (School)', label: 'School', color: 1 }] };

  /* Icons are our own resized data URLs. Anything else (a hand-edited backup)
     is dropped, because the value ends up inside a style attribute. */
  var ICON_RE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+\/=]+$/;
  /* A linked Google account is kept only as a plain email address: no spaces,
     quotes or angle brackets, since it is shown in Settings and put in links. */
  var EMAIL_RE = /^[^\s@"'<>]+@[^\s@"'<>]+\.[^\s@"'<>]+$/;
  function googleOf(g) {
    var e = g && typeof g.email === 'string' ? g.email.trim() : '';
    return EMAIL_RE.test(e) ? { email: e } : null;
  }
  var uid = function () { return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); };
  var esc = function (t) { return String(t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var cat = function (id) { return CATS.filter(function (c) { return c.id === id; })[0]; };

  var sget = function (area, keys) { return new Promise(function (r) { chrome.storage[area].get(keys, function (v) { r(v || {}); }); }); };
  var sset = function (area, obj) { return new Promise(function (r) { chrome.storage[area].set(obj, function () { r(); }); }); };
  var sdel = function (area, keys) { return new Promise(function (r) { chrome.storage[area].remove(keys, function () { r(); }); }); };

  function normalize(s) {
    if (!s || !Array.isArray(s.list)) return null;
    var out = { v: 2, active: s.active, owner: s.owner, share: {}, list: [] };
    CATS.forEach(function (c) { out.share[c.id] = !(s.share && s.share[c.id] === false); });
    s.list.forEach(function (p) {
      if (!p || !p.id || typeof p.name !== 'string') return;
      out.list.push({
        id: String(p.id), name: p.name, label: typeof p.label === 'string' ? p.label : (p.plan || ''),
        color: p.color | 0, icon: ICON_RE.test(p.icon) ? p.icon : '', google: googleOf(p.google),
        db: typeof p.db === 'string' ? p.db : '',
        settings: p.settings && typeof p.settings === 'object' ? p.settings : {}
      });
    });
    if (!out.list.length) return null;
    if (!out.list.some(function (p) { return p.id === out.active; })) out.active = out.list[0].id;
    if (!out.list.some(function (p) { return p.id === out.owner; })) out.owner = out.active;
    return out;
  }

  /* Current state from storage. First run migrates the old localStorage-shim
     list (atlasProfiles) and otherwise starts from the defaults. */
  function readState() {
    return sget('local', [SKEY, LKEY]).then(function (g) {
      var s = normalize(g[SKEY]);
      if (s) return { s: s, stored: true };
      var old = null;
      try { old = JSON.parse((g[LKEY] || {})[OLD]); } catch (e) { /* no old list, or unreadable: start from the defaults */ }
      s = normalize(old) || normalize(DEFAULTS);
      s.owner = s.active;
      return { s: s, stored: false };
    });
  }

  var state = null, queue = Promise.resolve(), listeners = [];

  /* Serialised read-modify-write, so two quick actions in one context cannot
     interleave and a write always starts from what is stored right now. */
  function mutate(fn) {
    var run = queue.then(function () {
      return readState().then(function (r) {
        return Promise.resolve(fn(r.s)).then(function (res) {
          return sset('local', { [SKEY]: r.s }).then(function () { state = r.s; return res === undefined ? r.s : res; });
        });
      });
    });
    queue = run.catch(function () { /* the caller gets this failure from `run`; the queue keeps going */ });
    return run;
  }

  var ready = readState().then(function (r) {
    state = r.s;
    return r.stored ? null : sset('local', { [SKEY]: r.s });
  }).catch(function () {
    // No extension storage (page opened outside the browser): run on defaults.
    state = normalize(DEFAULTS); state.owner = state.active;
  }).then(function () { return state; });

  try {
    chrome.storage.onChanged.addListener(function (ch, area) {
      if (area !== 'local' || !ch[SKEY]) return;
      var next = normalize(ch[SKEY].newValue);
      if (!next) return;
      var prev = state;
      state = next;
      listeners.slice().forEach(function (fn) { try { fn(next, prev); } catch (e) { console.warn('[Atlas] profiles: a change listener failed', e); } });
    });
  } catch (e) { /* no chrome.storage (page opened outside the browser): no live updates */ }

  /* ---------- Helpers shared by every UI ---------- */
  var activeOf = function (s) { s = s || state; return s.list.filter(function (p) { return p.id === s.active; })[0] || s.list[0]; };
  var initials = function (n) { return ((String(n).match(/[A-Za-z0-9]+/g) || ['?']).map(function (w) { return w[0]; }).slice(0, 2).join('') || '?').toUpperCase(); };
  var colorOf = function (p) { return COLORS[(p.color || 0) % COLORS.length]; };
  /* Avatar markup: the uploaded image, else the coloured initials circle. */
  function avatar(p, cls) {
    var c = colorOf(p);
    if (p.icon) return '<span class="' + (cls || 'profile-avatar') + '" style="background:#888 center/cover no-repeat url(\'' + p.icon + '\')"></span>';
    return '<span class="' + (cls || 'profile-avatar') + '" style="background:' + c[0] + ';color:' + c[1] + '">' + esc(initials(p.name)) + '</span>';
  }
  /* CSS url() for the toolbar corner button. */
  function cornerUrl(p) {
    if (p.icon) return 'url("' + p.icon + '")';
    var c = colorOf(p);
    var svg = "<svg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 28 28'><circle cx='14' cy='14' r='14' fill='" + c[0] +
      "'/><text x='14' y='14' text-anchor='middle' dominant-baseline='central' font-family='system-ui,-apple-system,sans-serif' font-size='10' font-weight='600' fill='" +
      c[1] + "'>" + esc(initials(p.name)) + '</text></svg>';
    return 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '")';
  }

  /* ---------- Per-profile settings ---------- */
  var unsharedCats = function (s) { return CATS.filter(function (c) { return s.share[c.id] === false; }); };
  var keysOf = function (cs) { return cs.reduce(function (a, c) { return a.concat(c.keys); }, []); };
  function pickKeys(live, keys) {
    var o = {};
    keys.forEach(function (k) { if (live[k] !== undefined) o[k] = live[k]; });
    return o;
  }
  /* Make the live keys equal a snapshot: present values set, absent ones removed
     (a removed key means the default, which is how a new profile starts). */
  function applyLive(snap, keys) {
    var set = {}, del = [];
    keys.forEach(function (k) { if (snap[k] !== undefined) set[k] = snap[k]; else del.push(k); });
    return (Object.keys(set).length ? sset('sync', set) : Promise.resolve()).then(function () {
      return del.length ? sdel('sync', del) : null;
    });
  }
  /* First-paint caches that the new tab reads before the bundle runs. */
  function writeCaches(snap, cs) {
    var add = {}, loc = {};
    cs.forEach(function (c) {
      if (c.id === 'theme') { add._themeCache = (snap.Theme && snap.Theme.Theme) || 'dark'; loc._themeCache = add._themeCache; }
      if (c.id === 'appearance') add._scaleCache = String(snap.uiScale !== undefined ? snap.uiScale : 1);
    });
    if (!Object.keys(add).length) return Promise.resolve();
    return sget('local', LKEY).then(function (g) {
      var m = g[LKEY] && typeof g[LKEY] === 'object' ? g[LKEY] : {};
      Object.keys(add).forEach(function (k) { m[k] = add[k]; });
      loc[LKEY] = m;
      return sset('local', loc);
    });
  }
  function dbNameOf(s, p) { return s.share.bookmarks === false && p && p.db ? p.db : MAIN_DB; }

  /* Move the live values into the owner's snapshot (unshared categories only). */
  function captureOwner(s) {
    var keys = keysOf(unsharedCats(s));
    if (!keys.length) return Promise.resolve();
    return sget('sync', keys).then(function (live) {
      var own = s.list.filter(function (p) { return p.id === s.owner; })[0];
      if (!own) return;
      keys.forEach(function (k) { delete own.settings[k]; });
      Object.assign(own.settings, pickKeys(live, keys));
    });
  }

  function switchTo(id) {
    return mutate(function (s) {
      var to = s.list.filter(function (p) { return p.id === id; })[0];
      if (!to || s.owner === id) { if (to) s.active = id; return; }
      var cs = unsharedCats(s), keys = keysOf(cs);
      return captureOwner(s).then(function () {
        return applyLive(to.settings || {}, keys);
      }).then(function () {
        return writeCaches(to.settings || {}, cs);
      }).then(function () { s.active = s.owner = id; });
    });
  }

  function add(opts) {
    opts = opts || {};
    return mutate(function (s) {
      var id = uid();
      var p = { id: id, name: (opts.name || 'New profile').trim() || 'New profile', label: opts.label || '',
        color: s.list.length % COLORS.length, icon: opts.icon || '', google: null,
        db: s.share.bookmarks === false ? MAIN_DB + '-' + id : '', settings: {} };
      s.list.push(p);
      return p;
    });
  }

  function update(id, patch) {
    return mutate(function (s) {
      var p = s.list.filter(function (q) { return q.id === id; })[0];
      if (!p) return;
      ['name', 'label', 'icon', 'color'].forEach(function (k) {
        if (patch[k] === undefined) return;
        if (k === 'icon' && patch[k] && !ICON_RE.test(patch[k])) return;
        p[k] = patch[k];
      });
      if (!p.name.trim()) p.name = 'Profile';
      /* null unlinks; an address that isn't an email is ignored. */
      if (patch.google === null) p.google = null;
      else if (patch.google !== undefined && googleOf(patch.google)) p.google = googleOf(patch.google);
    });
  }

  function deleteDb(name) {
    return new Promise(function (r) {
      try {
        var q = indexedDB.deleteDatabase(name);
        q.onsuccess = q.onerror = q.onblocked = function () { r(); };
      } catch (e) { r(); }
    });
  }

  /* The last profile cannot be removed. Removing the active one switches to the
     first remaining profile first. */
  function remove(id) {
    return readState().then(function (r) {
      if (r.s.list.length < 2 || !r.s.list.some(function (p) { return p.id === id; })) return false;
      var first = r.s.list.filter(function (p) { return p.id !== id; })[0].id;
      return (r.s.owner === id || r.s.active === id ? switchTo(first) : Promise.resolve()).then(function () {
        return mutate(function (s) {
          var i = s.list.map(function (p) { return p.id; }).indexOf(id);
          if (i < 0 || s.list.length < 2) return false;
          var gone = s.list.splice(i, 1)[0];
          if (gone.db && gone.db !== MAIN_DB) return deleteDb(gone.db).then(function () { return true; });
          return true;
        });
      });
    });
  }

  /* Turn sharing of one category on or off.
     Off: every profile gets a copy of the current values, so nothing changes at
     the moment of the switch (bookmarks are the exception: only the current
     profile keeps them, the rest start empty). On: the current values stay. */
  function setShare(id, on) {
    return mutate(function (s) {
      var c = cat(id);
      if (!c || (s.share[id] !== false) === !!on) return;
      return sget('sync', c.keys).then(function (live) {
        var snap = pickKeys(live, c.keys);
        if (!on) {
          s.share[id] = false;
          if (id === 'bookmarks') {
            s.list.forEach(function (p) {
              if (!p.db) p.db = p.id === s.owner && !s.list.some(function (q) { return q.db === MAIN_DB; }) ? MAIN_DB : MAIN_DB + '-' + p.id;
              c.keys.forEach(function (k) { delete p.settings[k]; });
              if (p.id === s.owner) Object.assign(p.settings, snap);
            });
          } else {
            s.list.forEach(function (p) {
              c.keys.forEach(function (k) { delete p.settings[k]; });
              Object.assign(p.settings, snap);
            });
          }
          return;
        }
        s.share[id] = true;
        var home = id === 'bookmarks' ? s.list.filter(function (p) { return p.db === MAIN_DB; })[0] : null;
        var keep = home && home.id !== s.owner ? (home.settings || {}) : snap;
        s.list.forEach(function (p) { c.keys.forEach(function (k) { delete p.settings[k]; }); });
        return applyLive(keep, c.keys);
      });
    });
  }

  /* ---------- Bookmarks database per profile ---------- */
  var dbName = function () { return state ? dbNameOf(state, activeOf(state)) : MAIN_DB; };
  var allDbNames = function () {
    var names = [MAIN_DB];
    if (state) state.list.forEach(function (p) { if (p.db && names.indexOf(p.db) < 0) names.push(p.db); });
    return names;
  };

  /* ---------- Backup ---------- */
  function dumpDb(BDB, name) {
    var c = Object.create(BDB);
    c.db = null; c.dbName = name; c.fixedName = true;
    return c.getAllBookmarks().then(function (d) { try { c.db.close(); } catch (e) { /* already closed */ } return d; });
  }
  function exportAll(BDB) {
    return readState().then(function (r) {
      var s = r.s;
      return captureOwner(s).then(function () {
        var dbs = {};
        if (s.share.bookmarks !== false) return { v: 2, state: s, dbs: dbs };
        return Promise.all(s.list.filter(function (p) { return p.db; }).map(function (p) {
          return dumpDb(BDB, p.db).then(function (d) { dbs[p.id] = d; });
        })).then(function () { return { v: 2, state: s, dbs: dbs }; });
      });
    });
  }
  /* Replace the profile set with the backup's. The caller then imports the
     config's top-level values, which belong to the backup's active profile. */
  function importAll(BDB, data) {
    var s = normalize(data && data.state);
    if (!s) return Promise.resolve();
    s.owner = s.active;
    var dbs = (data && data.dbs) || {};
    return Promise.all(s.list.filter(function (p) { return p.db && dbs[p.id]; }).map(function (p) {
      var c = Object.create(BDB);
      c.db = null; c.dbName = p.db; c.fixedName = true;
      return c.importAllBookmarks(dbs[p.id]).then(function () { try { c.db.close(); } catch (e) { /* already closed */ } });
    })).then(function () {
      return sset('local', { [SKEY]: s });
    }).then(function () {
      state = s;
      if (BDB.db) { try { BDB.db.close(); } catch (e) { /* already closed */ } BDB.db = null; }
    });
  }

  /* ---------- New tab only: follow a profile change made anywhere ---------- */
  var held = false, pending = false, shown = null, switchHandler = null;
  function reload() {
    var u = new URL(location.href);
    var sp = document.getElementById('sp-root');
    if (sp && !sp.hidden) {
      u.searchParams.set('settings', (window.AtlasSettingsUI && window.AtlasSettingsUI.current()) || 'profiles');
      history.replaceState(null, '', u.pathname + u.search);
    }
    location.reload();
  }
  /* The new tab registers a handler that swaps profiles in place (no reload, so
     an open Settings page stays put). Without one, or if it fails, reload. */
  function maybeReload() {
    if (!shown || !state) return;
    if (state.active === shown.active && dbName() === shown.db) return;
    if (held) { pending = true; return; }
    if (switchHandler) {
      shown = { active: state.active, db: dbName() };
      Promise.resolve().then(switchHandler).catch(function () { reload(); });
      return;
    }
    reload();
  }
  if (/\/index\.html$/.test(location.pathname)) {
    ready.then(function () { shown = { active: state.active, db: dbName() }; });
    listeners.push(maybeReload);
  }

  window.AtlasProfiles = {
    CATS: CATS, MAIN_DB: MAIN_DB, ready: ready,
    get: function () { return state; },
    read: function () { return readState().then(function (r) { return r.s; }); },
    onChange: function (fn) { listeners.push(fn); },
    active: function () { return state ? activeOf(state) : null; },
    switchTo: switchTo, add: add, update: update, remove: remove, setShare: setShare,
    dbName: dbName, allDbNames: allDbNames, exportAll: exportAll, importAll: importAll,
    holdReload: function (on) { held = !!on; if (!held && pending) { pending = false; maybeReload(); } },
    setSwitchHandler: function (fn) { switchHandler = fn; },
    avatar: avatar, cornerUrl: cornerUrl, initials: initials, colorOf: colorOf, esc: esc, googleOf: googleOf
  };
})();
