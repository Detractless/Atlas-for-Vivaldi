/* ── 39-profile-setup.js: every Vivaldi profile gets Atlas's settings the first time it opens ──
   The installer sets up the profile it was run for. This window code runs in every profile, so on a profile's
   first open it applies the same settings (38-profile-recipe.js), writes a mark in the profile's own storage so
   it never runs again for that recipe version, and then swaps the window for a new one: the look (CSS mods) is
   read when a window opens, so only a new window shows it. The new window gets the old one's tabs and size.

   Careful by design:
   - a profile that already matches the recipe (the one the installer set up) is only marked, never changed; one
     that matches all but a newer rule gets that rule, without a new window (the look folder did not change);
   - nothing is changed unless every list it edits (toolbars, panels, themes) could be read;
   - the mark is written before anything else, so a failure can't make it run in a loop;
   - the swap waits until the window's tabs have stopped changing (a session still restoring would lose
     tabs), and keeps the old window if any tab fails to move.
   atlas-profile.json (written by the installer next to atlas.js) holds the facts; without it nothing happens. ── */

var PS_FACTS_FILE = 'atlas-profile.json';
var PS_LOOK_PATH = 'vivaldi.appearance.css_ui_mods_directory';
/* start: wait before the first look; settle: for the new setting to be saved before a window reads it;
   poll/polls: the tab count must hold still for this many checks in a row; tries: give up after this many. */
var PS_TIMING = (typeof window !== 'undefined' && window.__atlasProfileSetupTiming) ||
  { start: 1500, settle: 800, poll: 700, polls: 3, tries: 20 };

function psValue(x) { return x && typeof x === 'object' && 'value' in x ? x.value : x; }

function psFacts() {
  return fetch(PS_FACTS_FILE).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
}

function psReadMark() {
  return new Promise(function (resolve) {
    chrome.storage.local.get('atlas_profile_setup', function (r) { void chrome.runtime.lastError; resolve(r && r.atlas_profile_setup); });
  });
}

function psWriteMark(facts, applied) {
  return new Promise(function (resolve) {
    chrome.storage.local.set({ atlas_profile_setup: { v: facts.version, applied: applied, at: Date.now() } },
      function () { void chrome.runtime.lastError; resolve(); });
  });
}

/* The current value of every path, or null when any answer is late (5 s). */
function psSnapshot(paths) {
  return new Promise(function (resolve) {
    var snap = {}, left = paths.length, done = false;
    var timer = setTimeout(function () { if (!done) { done = true; resolve(null); } }, 5000);
    paths.forEach(function (p) {
      function got(r) {
        snap[p] = psValue(r);
        if (--left === 0 && !done) { done = true; clearTimeout(timer); resolve(snap); }
      }
      try { vivaldi.prefs.get(p, got); } catch (e) { got(undefined); }
    });
  });
}

function psApply(changes) {
  Object.keys(changes).forEach(function (p) {
    try { vivaldi.prefs.set({ path: p, value: changes[p] }); } catch (e) { atlasWarn('profile setup: could not set ' + p, e); }
  });
}

/* True once the window's tab count has held still for PS_TIMING.polls checks in a row. */
function psTabsStable(windowId) {
  return new Promise(function (resolve) {
    var last = -1, same = 0, tries = 0;
    (function check() {
      chrome.tabs.query({ windowId: windowId }, function (tabs) {
        void chrome.runtime.lastError;
        var n = tabs ? tabs.length : -1;
        same = n === last ? same + 1 : 1;
        last = n;
        if (same >= PS_TIMING.polls) return resolve(true);
        if (++tries >= PS_TIMING.tries) return resolve(false);
        setTimeout(check, PS_TIMING.poll);
      });
    })();
  });
}

/* A new window with this window's tabs (same order, same one active) and size; the old window closes by itself
   when its last tab leaves. The active tab is adopted by the new window as it is created, so it never opens a start
   page of its own; the tabs before it go in at the front, the tabs after it at the end.
   Resolves true when every tab moved, false when the swap was skipped or stopped. (The last move ends this window's
   own script, so on the usual path nothing after it runs: it must be the last step.) */
function psReopen() {
  var w = chrome.windows;
  if (!(w && w.getCurrent && w.create && w.remove && chrome.tabs && chrome.tabs.move)) return Promise.resolve(false);
  return new Promise(function (resolve) {
    setTimeout(function () {
      w.getCurrent({}, function (probe) {
        if (!probe || probe.type !== 'normal' || probe.incognito) return resolve(false);
        psTabsStable(probe.id).then(function (stable) {
          if (!stable) return resolve(false);
          w.getCurrent({ populate: true }, function (old) {
            var tabs = old && old.tabs ? old.tabs.slice().sort(function (a, b) { return a.index - b.index; }) : [];
            if (!tabs.length) return resolve(false);
            var active = tabs.filter(function (t) { return t.active; })[0] || tabs[0];
            var ids = function (list) { return list.map(function (t) { return t.id; }); };
            var lower = ids(tabs.filter(function (t) { return t.index < active.index; }));
            var upper = ids(tabs.filter(function (t) { return t.index > active.index; }));
            var spec = old.state && old.state !== 'normal'
              ? { tabId: active.id, state: old.state }
              : { tabId: active.id, left: old.left, top: old.top, width: old.width, height: old.height };
            w.create(spec, function (fresh) {
              void chrome.runtime.lastError;
              if (!fresh || fresh.id === undefined) return resolve(false);
              var into = function (list, index, next) {
                if (!list.length) return next();
                chrome.tabs.move(list, { windowId: fresh.id, index: index }, function (moved) {
                  void chrome.runtime.lastError;
                  var n = Array.isArray(moved) ? moved.length : (moved ? 1 : 0);
                  if (n !== list.length) { atlasWarn('profile setup: tabs did not all move; the old window was kept', n + '/' + list.length); return resolve(false); }
                  next();
                });
              };
              into(lower, 0, function () {
                into(upper, -1, function () { w.remove(old.id, function () { void chrome.runtime.lastError; resolve(true); }); });
              });
            });
          });
        });
      });
    }, PS_TIMING.settle);
  });
}

function psRun() {
  if (!(window.vivaldi && vivaldi.prefs && chrome.storage && chrome.storage.local)) return Promise.resolve('no api');
  return psFacts().then(function (facts) {
    if (!facts || !facts.cssDir) return 'no facts';
    return psReadMark().then(function (mark) {
      if (mark && mark.v >= facts.version) return 'done before';
      return psSnapshot(profilePaths()).then(function (snap) {
        var readable = snap && PR_LIST_PATHS.every(function (p) { return Array.isArray(snap[p]); });
        if (!readable) { atlasWarn('profile setup: could not read this profile, left alone', null); return 'unreadable'; }
        var changes = profileRecipe(snap, facts);
        var changed = Object.keys(changes).length > 0;
        return psWriteMark(facts, changed).then(function () {
          if (!changed) return 'already set up';
          psApply(changes);
          if (!(PS_LOOK_PATH in changes)) return 'set up';
          return psReopen().then(function (swapped) { return swapped ? 'set up, window reopened' : 'set up'; });
        });
      });
    });
  }).catch(function (err) { atlasWarn('profile setup', err); return 'failed'; });
}

/* One window at a time per profile: the second window to open finds the mark the first one wrote. */
function psRunLocked() {
  if (typeof navigator !== 'undefined' && navigator.locks && navigator.locks.request) {
    return navigator.locks.request('atlas-profile-setup', psRun);
  }
  return psRun();
}

setTimeout(psRunLocked, PS_TIMING.start);
Atlas.profileSetup = { run: psRunLocked };
