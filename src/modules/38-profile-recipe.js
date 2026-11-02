/* ── 38-profile-recipe.js: the Vivaldi settings Atlas needs in a profile, as one pure function ──
   The installer (installer/preferences.py) writes these settings into the profile it is run for. Every other
   profile gets them from 39-profile-setup.js the first time it opens, by the rules here.

     profileRecipe(snap, facts)  snap: the profile's current values, { 'vivaldi.toolbars.navigation': [...], ... }
                                 facts: what the installer wrote to atlas-profile.json (look folder, new-tab
                                 address, themes, Downloads panel)
                                 returns only what must change: { path: newValue }
     profilePaths()              every path the recipe reads, i.e. what to put in snap

   Merging, not replacing: buttons and themes a profile already has stay. tests/unit/profile_recipe_parity.test.js
   makes preferences.py and this file give the same answer, so change them together. ── */

var PR_TOOLS_PANEL_ID = 'WEBPANEL_atlas_sidebar';
var PR_OMNIBOX_KEYS = ['enabled', 'bookmarks', 'bookmarks_boosted', 'show_bookmarks', 'show_nicknames',
  'show_typed_history', 'show_browser_history', 'show_search_history', 'search_history_enable', 'show_vivaldi_calculator'];
var PR_SEARCH_KEYS = ['direct_match_enabled', 'direct_match_boosted', 'suggest_enabled'];
var PR_INLINE_KEYS = ['suggest_enabled', 'suggest_on_nickname'];
/* Buttons taken off the tab bar's own toolbars: Back/Forward move to the mainbar, WorkspaceButton and TabButton
   (Vivaldi's tab-list button) are not wanted. */
var PR_TABBAR_OUT = ['Back', 'Forward', 'WorkspaceButton', 'TabButton'];

/* The paths holding a list, which the recipe edits in place: a profile whose list could not be read
   must be left alone, not given a list built from nothing. */
var PR_LIST_PATHS = ['vivaldi.toolbars.navigation', 'vivaldi.toolbars.tabbar_before', 'vivaldi.toolbars.tabbar_after',
  'vivaldi.toolbars.panel', 'vivaldi.panels.web.elements', 'vivaldi.themes.user'];

function profilePaths() {
  var paths = ['vivaldi.appearance.css_ui_mods_directory', 'vivaldi.theme.schedule.enabled', 'vivaldi.downloads.open_panel_on_new',
    'vivaldi.address_bar.visible', 'vivaldi.address_bar.extensions.show_all_toggle',
    'vivaldi.address_bar.autocomplete.enabled', 'vivaldi.address_bar.autocomplete.suffix_expansion.enabled',
    'search.suggest_enabled', 'vivaldi.homepage', 'vivaldi.tabs.focus_webview', 'vivaldi.tabs.new_page.link',
    'vivaldi.tabs.new_page.custom_url', 'vivaldi.themes.current', 'extensions.ui.developer_mode'].concat(PR_LIST_PATHS);
  PR_OMNIBOX_KEYS.forEach(function (k) { paths.push('vivaldi.address_bar.omnibox.' + k); });
  PR_SEARCH_KEYS.forEach(function (k) { paths.push('vivaldi.address_bar.search.' + k); });
  PR_INLINE_KEYS.forEach(function (k) { paths.push('vivaldi.address_bar.inline_search.' + k); });
  return paths;
}

function prList(v) { return Array.isArray(v) ? v.slice() : []; }

/* Put btn right after the first anchor found (or before it), else at the end. */
function prInsertAfter(list, btn, anchors, before) {
  list = list.filter(function (x) { return x !== btn; });
  for (var i = 0; i < anchors.length; i++) {
    var at = list.indexOf(anchors[i]);
    if (at >= 0) { list.splice(at + (before ? 0 : 1), 0, btn); return list; }
  }
  list.push(btn);
  return list;
}

/* Back and Forward live on the mainbar, Extensions after the address field, Home after Reload. The tab bar
   keeps neither Back/Forward nor the stock Workspaces and tab-list buttons: Atlas has no use for them there. */
function prNavigation(snap, put) {
  ['vivaldi.toolbars.tabbar_before', 'vivaldi.toolbars.tabbar_after'].forEach(function (p) {
    var arr = snap[p];
    if (Array.isArray(arr) && arr.some(function (x) { return PR_TABBAR_OUT.indexOf(x) >= 0; })) {
      put(p, arr.filter(function (x) { return PR_TABBAR_OUT.indexOf(x) < 0; }));
    }
  });
  var nav = prList(snap['vivaldi.toolbars.navigation']);
  if (!nav.length) nav = ['Reload', 'AddressField'];
  var at = 0;
  ['Back', 'Forward'].forEach(function (b) { if (nav.indexOf(b) < 0) { nav.splice(at, 0, b); at++; } });
  ['Spacer', 'AccountButton'].forEach(function (b) { if (nav.indexOf(b) < 0) nav.push(b); });
  nav = prInsertAfter(nav, 'Extensions', ['AddressField'], false);
  nav = nav.indexOf('Reload') >= 0
    ? prInsertAfter(nav, 'Home', ['Reload'], false)
    : prInsertAfter(nav, 'Home', ['AddressField'], true);
  put('vivaldi.toolbars.navigation', nav);
}

/* The old Tools panel goes; the Downloads panel and its button on the panel bar come. */
function prPanels(snap, facts, put) {
  var dl = facts.downloadsPanel || {};
  var elements = prList(snap['vivaldi.panels.web.elements']).filter(function (e) {
    return !(e && typeof e === 'object' && (e.id === PR_TOOLS_PANEL_ID || String(e.url || '').indexOf('/sidepanel.html') >= 0));
  });
  var ours = elements.filter(function (e) { return e && e.id === dl.id; })[0];
  if (ours) ours.url = dl.url;
  else if (dl.id) {
    elements.push({ id: dl.id, url: dl.url, title: 'Downloads', faviconUrl: '', faviconUrlValid: false, mobileMode: false,
      origin: 'user', resizable: false, width: -1, zoom: 1 });
  }
  put('vivaldi.panels.web.elements', elements);
  var bar = prList(snap['vivaldi.toolbars.panel']).filter(function (x) { return String(x) !== PR_TOOLS_PANEL_ID && x !== 'Extensions'; });
  if (dl.id && bar.indexOf(dl.id) < 0) bar.push(dl.id);
  put('vivaldi.toolbars.panel', bar);
  put('vivaldi.downloads.open_panel_on_new', false);
}

/* Atlas's themes are added by id; a theme the profile already has is kept, and the current one is
   changed only when it is not already an Atlas theme. */
function prThemes(snap, facts, put) {
  var user = prList(snap['vivaldi.themes.user']);
  var have = {};
  user.forEach(function (t) { if (t && typeof t === 'object') have[String(t.id)] = true; });
  (facts.themes || []).forEach(function (t) {
    if (t && !have[String(t.id)]) { user.push(t); have[String(t.id)] = true; }
  });
  put('vivaldi.themes.user', user);
  var cur = String(snap['vivaldi.themes.current']);
  if (cur !== 'AtlasLight' && cur !== 'AtlasDark') put('vivaldi.themes.current', 'AtlasLight');
}

function profileRecipe(snap, facts) {
  var out = {};
  function put(path, value) {
    if (JSON.stringify(snap[path]) !== JSON.stringify(value)) out[path] = value;
  }
  put('vivaldi.appearance.css_ui_mods_directory', facts.cssDir);
  put('vivaldi.theme.schedule.enabled', 'off');
  prPanels(snap, facts, put);
  put('vivaldi.address_bar.visible', true);
  put('vivaldi.address_bar.extensions.show_all_toggle', true);
  put('vivaldi.address_bar.autocomplete.enabled', false);
  put('vivaldi.address_bar.autocomplete.suffix_expansion.enabled', false);
  PR_OMNIBOX_KEYS.forEach(function (k) { put('vivaldi.address_bar.omnibox.' + k, false); });
  PR_SEARCH_KEYS.forEach(function (k) { put('vivaldi.address_bar.search.' + k, false); });
  PR_INLINE_KEYS.forEach(function (k) { put('vivaldi.address_bar.inline_search.' + k, false); });
  put('search.suggest_enabled', false);
  prNavigation(snap, put);
  put('vivaldi.homepage', facts.newTabUrl);
  put('vivaldi.tabs.focus_webview', true);
  put('vivaldi.tabs.new_page.link', 4);
  put('vivaldi.tabs.new_page.custom_url', facts.newTabUrl);
  prThemes(snap, facts, put);
  put('extensions.ui.developer_mode', true);
  return out;
}

Atlas.profileRecipe = profileRecipe;
Atlas.profilePaths = profilePaths;
Atlas.profileListPaths = PR_LIST_PATHS;
