/* ── 15-addressbar-engine.js: the address bar searches with the new tab's engine ──
   The new tab keeps its default engine in chrome.storage.sync: defaultEngineKey,
   and customSearchEngines[key].url, the prefix a query is appended to. This makes
   the matching engine Vivaldi's own default search, adding it to Vivaldi first if
   Vivaldi has none, so a search typed in the address bar goes to the same place.
   Runs at start and again whenever the new tab's engine changes. ── */

function engineTemplate(eng) {
  return eng.url.indexOf('{searchTerms}') !== -1 ? eng.url : eng.url + '{searchTerms}';
}

/* Vivaldi lists an engine's address with %s where the query goes, but stores
   and accepts {searchTerms}. Compare addresses with both read as the same
   placeholder; an exact compare never matched, so a new copy of the engine was
   added at every start (24 identical Google engines by 2026-10-08). */
function engineUrlKey(url) {
  return String(url || '').replace(/\{searchTerms\}|%s/g, '%s');
}

/* A Vivaldi search-engine record for an engine it doesn't have yet. */
function newTemplateUrl(key, eng, tmpl, list) {
  return {
    guid: '', extensionId: '', readOnly: false, name: eng.name || 'Atlas default', keyword: 'atlas-' + key,
    faviconUrl: '', url: tmpl, postParams: '', suggestUrl: '', suggestPostParams: '', imageUrl: '',
    imagePostParams: '', prepopulateId: 0, starterPackId: 0,
    isActive: list.length ? list[0].isActive : 0
  };
}

/* Clean up after that bug: keep one copy of each engine Atlas added (keyword
   "atlas-..."), preferring the one Vivaldi uses, and remove the others. Engines
   in use for any default (search, private, image, speed dials...) are never
   removed, the same rule as Vivaldi's own isRemovable, and engines the user
   added are never touched. Returns the list without the removed copies. */
function removeDuplicateEngines(res, list) {
  var inUse = {};
  Object.keys(res).forEach(function (k) { if (k.indexOf('default') === 0 && res[k]) inUse[res[k]] = true; });
  var groups = {};
  list.forEach(function (t) {
    if (!t.guid || String(t.keyword || '').indexOf('atlas-') !== 0) return;
    var id = t.keyword + ' ' + engineUrlKey(t.url);
    (groups[id] = groups[id] || []).push(t);
  });
  var removed = {};
  Object.keys(groups).forEach(function (id) {
    var copies = groups[id];
    var keep = copies.find(function (t) { return inUse[t.guid]; }) || copies[0];
    copies.forEach(function (t) {
      if (t === keep || inUse[t.guid]) return;
      removed[t.guid] = true;
      var p = vivaldi.searchEngines.removeTemplateUrl(t.guid);
      if (p && p.catch) p.catch(function (e) { atlasWarn('address-bar engine: removing a duplicate failed', e); });
    });
  });
  return list.filter(function (t) { return !removed[t.guid]; });
}

/* One sync at a time; a change that arrives mid-sync runs once more at the end. */
var engineSyncBusy = false, engineSyncAgain = false;

function finishEngineSync() {
  engineSyncBusy = false;
  if (engineSyncAgain) { engineSyncAgain = false; syncAddressBarEngine(); }
}

function makeDefaultEngine(res, guid) {
  if (guid && res.defaultSearch !== guid) vivaldi.searchEngines.setDefault('defaultSearch', guid);
  finishEngineSync();
}

function applyEngine(key, eng) {
  var tmpl = engineTemplate(eng);
  vivaldi.searchEngines.getTemplateUrls(function (res) {
    res = res || {};
    var list = removeDuplicateEngines(res, res.templateUrls || []);
    var hit = list.find(function (t) { return engineUrlKey(t.url) === engineUrlKey(tmpl); });
    if (hit) return makeDefaultEngine(res, hit.guid);
    /* addTemplateUrl answers through its callback or its promise, depending on
       the Vivaldi build; act on whichever comes first. */
    var done = false;
    function added(g) {
      if (done) return;
      done = true;
      var guid = g && g.guid ? g.guid : g;
      if (!guid) atlasWarn('address-bar engine: Vivaldi gave no id for ' + key);
      makeDefaultEngine(res, guid);
    }
    var p = vivaldi.searchEngines.addTemplateUrl(newTemplateUrl(key, eng, tmpl, list), added);
    if (p && p.then) {
      p.then(added, function (e) { atlasWarn('address-bar engine: adding ' + key + ' failed', e); finishEngineSync(); });
    }
  });
}

function syncAddressBarEngine() {
  if (engineSyncBusy) { engineSyncAgain = true; return; }
  engineSyncBusy = true;
  chrome.storage.sync.get(['defaultEngineKey', 'customSearchEngines'], function (r) {
    var key = (r && r.defaultEngineKey) || 'default';
    var eng = r && r.customSearchEngines && r.customSearchEngines[key];
    if (!eng || !eng.url) return finishEngineSync();
    applyEngine(key, eng);
  });
}

if (window.vivaldi && vivaldi.searchEngines && chrome.storage && chrome.storage.sync) {
  syncAddressBarEngine();
  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area === 'sync' && (changes.defaultEngineKey || changes.customSearchEngines)) syncAddressBarEngine();
  });
}
