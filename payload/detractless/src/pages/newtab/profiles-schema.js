/* The saved profile shape and its migration/validation rules. */
(function () {
  'use strict';
  if (window.AtlasProfileSchema) return;

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
    { id: 'appearance', label: 'Appearance', keys: ['fadeInEnabled'],
      on: 'Every profile uses the same page animations.', off: 'Each profile has its own page animations.' },
    { id: 'search', label: 'Search', keys: ['spotlightVisible', 'searchEngineBehavior', 'bookmarkPillBehavior',
      'customSearchEngines', 'defaultEngineKey', 'selectedSearchEngine'],
      on: 'Every profile uses the same engines and pills.',
      off: 'Each profile has its own engines and pills.' },
    { id: 'focus', label: 'Focus', keys: ['tabLimit', 'managementMethod', 'searchDelaySeconds',
      'showQueryOnDelay', 'saturation', 'nsfwAction', 'socialFilter', 'scrollFade'],
      on: 'Every profile uses the same tab limit, search delay, color level, scroll fade and content shield.',
      off: 'Each profile has its own tab limit, search delay, color level, scroll fade and content shield.' }
  ];
  var DEFAULTS = { active: 'personal', list: [
    { id: 'personal', name: 'Christian Darby-Ward', label: 'Personal', color: 0 },
    { id: 'school', name: 'Christian (School)', label: 'School', color: 1 }] };
  var ICON_RE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+\/=]+$/;
  var EMAIL_RE = /^[^\s@"'<>]+@[^\s@"'<>]+\.[^\s@"'<>]+$/;

  function googleOf(g) {
    var email = g && typeof g.email === 'string' ? g.email.trim() : '';
    return EMAIL_RE.test(email) ? { email: email } : null;
  }

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

  window.AtlasProfileSchema = {
    SKEY: SKEY, LKEY: LKEY, OLD: OLD, MAIN_DB: MAIN_DB, COLORS: COLORS, CATS: CATS,
    DEFAULTS: DEFAULTS, ICON_RE: ICON_RE, normalize: normalize, googleOf: googleOf
  };
})();
