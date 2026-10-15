/* ── 24-addbar-screens.js: the screens of the address bar's Add flow, and what they do ──
   Add bookmark: which website, then the name and where it goes. Add page: its name, then a
   subtitle. The question is the bar's own placeholder; a small chip says what is being added and
   the step. Screen 1 has no buttons (Enter or a pill moves on, Esc cancels); screen 2 has one
   small row. Looks: the address bar's own card, at its size (css-mods/03-addressbar.css 4c, 08-addbar.css). */

var AB_ICON_BM = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5h8v11l-4-2.8-4 2.8z"/></svg>';
var AB_ICON_PAGE = '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2.5" y="2.5" width="11" height="11" rx="3"/><path d="M2.5 6.5h11"/></svg>';
var AB_ICON_CHEV = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg>';
var AB_ICON_BACK = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m10 4-4 4 4 4"/></svg>';
var AB_ICON_TICK = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3.5 8.5 3 3 6-7"/></svg>';

function abAddButton() {
  return '<button type="button" class="atlas-addbtn" data-ab-save>Add</button>';
}

function abPills(list, at, attr) {
  return '<div class="atlas-addpills" role="listbox">' + list.map(function (p, i) {
    return '<button type="button" class="atlas-addpill" role="option" ' + attr + '="' + abEsc(p.value) + '" aria-selected="' + (i === at) + '">' + abEsc(p.label) + '</button>';
  }).join('') + '</div>';
}

function abDropdown(key, label, items, value) {
  var cur = items.filter(function (it) { return String(it.value) === String(value); })[0];
  var rows = items.map(function (it) {
    var on = String(it.value) === String(value);
    return '<button type="button" class="atlas-addrow" role="option" data-ab-item="' + key + '" data-value="' + abEsc(it.value) + '" aria-selected="' + on + '">' + abEsc(it.label) + (on ? AB_ICON_TICK : '') + '</button>';
  }).join('');
  var more = items.length > 5 ? '<div class="atlas-addnote">' + (items.length - 5) + ' more, scroll</div>' : '';
  return '<div class="atlas-adddd" data-ab-wrap="' + key + '">' +
    '<button type="button" class="atlas-addddbtn" data-ab-dd="' + key + '" aria-label="' + abEsc(label) + '" title="' + abEsc(label) + '" aria-haspopup="listbox" aria-expanded="false"><span>' + abEsc(cur ? cur.label : 'Choose') + '</span>' + AB_ICON_CHEV + '</button>' +
    '<div class="atlas-addmenu" data-ab-menu="' + key + '" role="listbox" hidden><div class="atlas-addrows">' + rows + '</div>' + more + '</div></div>';
}

function abPageItems() { return ab.pages.map(function (p) { return { value: String(p.id), label: p.label }; }); }
function abGroupItems() {
  return ab.groups.map(function (g) { return { value: g, label: g }; }).concat([{ value: AB_NEW_GROUP, label: '+ New group' }]);
}

/* What each screen shows: { chip, icon, value, placeholder, body, back }. */
function abScreen() {
  var a = ab, bm = a.kind === 'bookmark';
  if (bm && a.step === 1) {
    return { chip: 'Add bookmark', icon: AB_ICON_BM, value: a.urlText, placeholder: 'Which website?',
      body: '<div data-ab-drop>' + abDropInner() + '</div>' };
  }
  if (bm) {
    var names = a.names.map(function (n) { return { label: n, value: n }; });
    var at = names.map(function (n) { return n.value; }).indexOf(a.name);
    return { chip: 'Add bookmark', icon: AB_ICON_BM, value: a.name, placeholder: 'Name', back: true,
      body: (names.length ? abPills(names, at, 'data-ab-name') : '') +
        '<div class="atlas-addtools"><div class="atlas-addcols" data-ab-cols>' + abColsInner() + '</div>' + abNewGroupField() + abAddButton() + '</div>' +
        '<div class="atlas-addhint">Enter adds &middot; Esc cancels</div>' };
  }
  if (a.step === 1) {
    return { chip: 'Add page', icon: AB_ICON_PAGE, value: a.pageName, placeholder: 'What is the page called?',
      body: '<div class="atlas-addhint">Shows in the page switcher on the new tab &middot; empty is <span data-ab-default>Page ' + a.pageCount + '</span> &middot; Enter continues &middot; Esc cancels</div>' };
  }
  return { chip: 'Add page', icon: AB_ICON_PAGE, value: a.sub, placeholder: 'A short subtitle', back: true,
    body: '<div class="atlas-addtools"><span class="atlas-addhint" data-ab-count></span>' + abAddButton() + '</div>' };
}

function abDropInner() {
  var pills = ab.sites.map(function (s) { return { label: s.label, value: s.value }; });
  if (!pills.length) return '<div class="atlas-addhint">Type a website, then Enter &middot; Esc cancels</div>';
  return abPills(pills, ab.siteAt, 'data-ab-site') + '<div class="atlas-addhint">Enter picks ' + abEsc(pills[ab.siteAt].value) + ' &middot; &uarr;&darr; to move &middot; Esc cancels</div>';
}

function abColsInner() {
  return abDropdown('page', 'Page', abPageItems(), ab.page === null ? '' : ab.page) + abDropdown('group', 'Group', abGroupItems(), ab.group);
}

function abNewGroupField() {
  return '<div data-ab-newgroup' + (ab.group === AB_NEW_GROUP ? '' : ' hidden') + '>' +
    '<input class="atlas-addtext" type="text" data-ab-field="newGroup" value="' + abEsc(ab.newGroup) + '" placeholder="New group name" aria-label="New group name" autocomplete="off" spellcheck="false"></div>';
}

function abFieldName() {
  return ab.kind === 'bookmark' ? (ab.step === 1 ? 'url' : 'name') : (ab.step === 1 ? 'pageName' : 'sub');
}

function abRender() {
  if (!ab) return;
  var s = abScreen();
  ab.menu = null;
  ab.field.innerHTML = (s.back ? '<button type="button" class="atlas-addback" data-ab-back aria-label="Back">' + AB_ICON_BACK + '</button>' : '') +
    '<span class="atlas-addicon">' + s.icon + '</span><span class="atlas-addchip">' + abEsc(s.chip) + ' ' + ab.step + '/2</span>' +
    '<input class="atlas-addinput" type="text" data-ab-field="' + abFieldName() + '" value="' + abEsc(s.value) + '" placeholder="' + abEsc(s.placeholder) + '" autocomplete="off" spellcheck="false">';
  ab.card.innerHTML = s.body + '<div class="atlas-adderror" data-ab-error role="alert"></div>';
  abUpdateCount();
  var input = ab.field.querySelector('input');
  setTimeout(function () { if (input && ab) input.focus(); }, 0);
}

function abPaintPills() {
  var drop = ab && ab.card.querySelector('[data-ab-drop]');
  if (!drop) return;
  drop.innerHTML = abDropInner();
}

function abPaintPlace() {
  var cols = ab && ab.card.querySelector('[data-ab-cols]');
  if (!cols) return;
  cols.innerHTML = abColsInner();
  ab.menu = null;
  var wrap = ab.card.querySelector('[data-ab-newgroup]');
  if (wrap) wrap.hidden = ab.group !== AB_NEW_GROUP;
}

function abUpdateCount() {
  var slot = ab && ab.card.querySelector('[data-ab-count]');
  if (!slot) return;
  var c = abSubCount(ab.sub);
  slot.textContent = c.words + ' of ' + AB_SUB_MIN + '-' + AB_SUB_MAX + ' words · ' + c.chars + ' / ' + AB_SUB_CHARS + ' · Enter adds · Esc cancels';
}

function abError(text) {
  var slot = ab && ab.card.querySelector('[data-ab-error]');
  if (slot) slot.textContent = text || '';
}

/* ── the pages' groups, and the drop-down lists ── */

function abLoadGroups() {
  var flow = ab, page = flow.page;
  if (page === null || page === undefined) { flow.groups = []; if (flow.group === null) flow.group = AB_NEW_GROUP; abPaintPlace(); return; }
  abAsk({ action: 'addGroups', db: abDb(), page: page }).then(function (r) {
    if (ab !== flow || flow.page !== page) return;   // the page changed while this was loading
    flow.groups = r.groups || [];
    if (flow.group === null || (flow.group !== AB_NEW_GROUP && flow.groups.indexOf(flow.group) < 0)) {
      flow.group = flow.groups.length ? flow.groups[0] : AB_NEW_GROUP;
    }
    abPaintPlace();
  });
}

function abCloseMenus() {
  if (!ab) return;
  Array.prototype.forEach.call(ab.card.querySelectorAll('[data-ab-menu]'), function (m) { m.hidden = true; });
  Array.prototype.forEach.call(ab.card.querySelectorAll('[data-ab-dd]'), function (b) { b.setAttribute('aria-expanded', 'false'); });
  ab.menu = null;
}

function abToggleMenu(key) {
  var was = ab.menu === key;
  abCloseMenus();
  if (was) return;
  var m = ab.card.querySelector('[data-ab-menu="' + key + '"]');
  if (!m) return;
  m.hidden = false;
  ab.menu = key;
  ab.card.querySelector('[data-ab-dd="' + key + '"]').setAttribute('aria-expanded', 'true');
}

function abChoose(key, value) {
  if (key === 'page') {
    var id = ab.pages.filter(function (p) { return String(p.id) === value; })[0];
    if (!id) return;
    ab.page = id.id; ab.group = null; ab.groups = [];
    abPaintPlace();
    abLoadGroups();
  } else {
    ab.group = value;
    abPaintPlace();
    if (value === AB_NEW_GROUP) { var f = ab.card.querySelector('[data-ab-field="newGroup"]'); if (f) f.focus(); }
  }
  abCloseMenus();
}

/* ── moving on, and saving ── */

function abNext() {
  var flow = ab;
  abError('');
  if (flow.kind === 'bookmark') {
    var text = flow.urlText.trim();
    if (!text) { abError('Give the bookmark a URL.'); return; }
    abAsk({ action: 'addSuggest', db: abDb(), typed: text, thisUrl: '' }).then(function (r) {
      if (ab !== flow) return;
      flow.names = r.names || [];
      if (!flow.nameTouched) flow.name = flow.names[0] || text.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/[\/?#].*$/, '');
      flow.step = 2;
      abRender();
      abLoadGroups();
    });
    return;
  }
  flow.step = 2;
  abRender();
}

function abBack() {
  ab.step = 1;
  abRender();
  abSuggest();
}

function abPickSite(domain) {
  ab.urlText = domain;
  ab.siteAt = 0;
  abNext();
}

function abSave() {
  var flow = ab;
  if (flow.busy) return;
  abError('');
  var job;
  if (flow.kind === 'page') {
    var problem = abSubProblem(flow.sub);
    if (problem) { abError(problem); return; }
    job = abAsk({ action: 'addPage', label: flow.pageName, sub: flow.sub });
  } else {
    var group = flow.group === AB_NEW_GROUP ? flow.newGroup.trim().toUpperCase() : flow.group;
    if (!flow.name.trim()) { abError('Give the bookmark a name.'); return; }
    if (flow.page === null) { abError('Add a page first, then a bookmark to it.'); return; }
    if (!group) { abError(flow.group === AB_NEW_GROUP ? 'Give the new group a name.' : 'Choose a group.'); return; }
    job = abAsk({ action: 'addBookmark', db: abDb(), name: flow.name, url: flow.urlText.trim(), page: flow.page, group: group, newGroup: flow.group === AB_NEW_GROUP });
  }
  flow.busy = true;
  job.then(function (r) {
    flow.busy = false;
    if (ab !== flow) return;
    if (r && r.ok) abClose(); else abError((r && r.error) || 'That did not work. Try again.');
  });
}

/* ── events ── */

function abWire() {
  var flow = ab;
  flow.card.addEventListener('mousedown', function (e) { if (!e.target.closest('input')) e.preventDefault(); });   // keep the cursor in the bar
  flow.card.addEventListener('click', function (e) {
    var t = e.target;
    if (t.closest('[data-ab-save]')) return abSave();
    var site = t.closest('[data-ab-site]');
    if (site) return abPickSite(site.getAttribute('data-ab-site'));
    var np = t.closest('[data-ab-name]');
    if (np) {
      flow.name = np.getAttribute('data-ab-name'); flow.nameTouched = true;
      flow.field.querySelector('input').value = flow.name;
      Array.prototype.forEach.call(flow.card.querySelectorAll('[data-ab-name]'), function (p) { p.setAttribute('aria-selected', String(p === np)); });
      return;
    }
    var dd = t.closest('[data-ab-dd]');
    if (dd) return abToggleMenu(dd.getAttribute('data-ab-dd'));
    var item = t.closest('[data-ab-item]');
    if (item) return abChoose(item.getAttribute('data-ab-item'), item.getAttribute('data-value'));
    if (flow.menu) abCloseMenus();
  });
  function onInput(e) {
    var name = e.target.getAttribute && e.target.getAttribute('data-ab-field');
    if (!name) return;
    abError('');
    if (name === 'url') { flow.urlText = e.target.value; flow.siteAt = 0; abPaintPills(); abSuggest(); }
    else if (name === 'name') { flow.name = e.target.value; flow.nameTouched = true; }
    else if (name === 'newGroup') flow.newGroup = e.target.value;
    else if (name === 'pageName') flow.pageName = e.target.value;
    else if (name === 'sub') { flow.sub = e.target.value; abUpdateCount(); }
  }
  flow.field.addEventListener('click', function (e) { if (e.target.closest('[data-ab-back]')) abBack(); });
  flow.field.addEventListener('input', onInput);
  flow.card.addEventListener('input', onInput);
  function onKey(e) {
    var field = e.target.getAttribute && e.target.getAttribute('data-ab-field');
    if (!field) return;
    if (field === 'url' && (e.key === 'ArrowDown' || e.key === 'ArrowUp') && flow.sites.length) {
      e.preventDefault();
      flow.siteAt = (flow.siteAt + (e.key === 'ArrowDown' ? 1 : flow.sites.length - 1)) % flow.sites.length;
      abPaintPills();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (field === 'url') { if (flow.sites.length) abPickSite(flow.sites[flow.siteAt].value); else abNext(); }
      else if (flow.step === 1) abNext();
      else abSave();
    }
  }
  flow.field.addEventListener('keydown', onKey);
  flow.card.addEventListener('keydown', onKey);
}
