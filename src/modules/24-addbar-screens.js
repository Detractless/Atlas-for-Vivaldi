/* ── 24-addbar-screens.js: the screens of the address bar's Add flow, and what they do ──
   Add bookmark: 1 which website, 2 the name, 3 the page and group it goes on. Add group: 1 its name, 2 the
   page it goes on. Add page: its name, then a subtitle. A page with no groups offers "Add group" on a
   bookmark's screen 3, which runs the group flow and comes back there with the new group chosen. Like the
   address bar's "Search Google or enter address", the bar's placeholder is an instruction. Screen 1 of a
   bookmark has no buttons (Enter takes the highlighted pill, Shift+Enter takes exactly what was typed, Esc
   cancels); the others have at most one small row. The page and group lists are in 25-addbar-place.js.
   Looks: the address bar's own card, at its size (css-mods/03-addressbar.css 4c, 08-addbar.css). */

var AB_ICON_BM = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5h8v11l-4-2.8-4 2.8z"/></svg>';
var AB_ICON_GROUP = '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2.5" y="3" width="11" height="4" rx="1.5"/><rect x="2.5" y="9" width="11" height="4" rx="1.5"/></svg>';
var AB_ICON_PAGE = '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2.5" y="2.5" width="11" height="11" rx="3"/><path d="M2.5 6.5h11"/></svg>';
var AB_ICON_CHEV = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg>';
var AB_ICON_BACK = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m10 4-4 4 4 4"/></svg>';
var AB_ICON_TICK = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3.5 8.5 3 3 6-7"/></svg>';

function abAddButton(label) {
  return '<button type="button" class="atlas-addbtn" data-ab-save>' + (label || 'Add') + '</button>';
}

function abPills(list, at, attr) {
  return '<div class="atlas-addpills" role="listbox">' + list.map(function (p, i) {
    return '<button type="button" class="atlas-addpill" role="option" ' + attr + '="' + abEsc(p.value) + '" aria-selected="' + (i === at) + '">' + abEsc(p.label) + '</button>';
  }).join('') + '</div>';
}

/* What each screen shows: { icon, value, placeholder, body, back, where (the address, beside the name), readonly }. */
function abScreen() {
  var a = ab;
  if (a.kind === 'bookmark') {
    if (a.step === 1) {
      return { icon: AB_ICON_BM, value: a.urlText, placeholder: 'Type a website to bookmark, or pick one below',
        body: '<div data-ab-drop>' + abDropInner() + '</div>' };
    }
    if (a.step === 2) {
      var names = a.names.map(function (n) { return { label: n, value: n }; });
      var at = names.map(function (n) { return n.value; }).indexOf(a.name);
      return { icon: AB_ICON_BM, value: a.name, placeholder: 'Name this bookmark, or pick a name below', back: true,
        body: (names.length ? abPills(names, at, 'data-ab-name') : '') +
          '<div class="atlas-addhint">Name this bookmark, or pick a name above &middot; Enter continues &middot; Esc cancels</div>' };
    }
    // what is being added stays in the bar; the card is where it goes
    return { icon: AB_ICON_BM, value: a.name, placeholder: '', back: true, readonly: true, where: a.urlText.trim().replace(/^https?:\/\//, '').replace(/^www\./, ''),
      body: '<div data-ab-place>' + abPlaceInner() + '</div>' };
  }
  if (a.kind === 'group') {
    if (a.step === 1) {
      return { icon: AB_ICON_GROUP, value: a.groupName, placeholder: 'Name the new group, like Streaming', back: !!a.returnTo,
        body: '<div class="atlas-addhint">Enter continues &middot; Esc cancels</div>' };
    }
    return { icon: AB_ICON_GROUP, value: a.groupName, placeholder: '', back: true, readonly: true,
      body: '<div data-ab-place>' + abPlaceInner() + '</div>' };
  }
  if (a.step === 1) {
    return { icon: AB_ICON_PAGE, value: a.pageName, placeholder: 'Give the new page a name, like Streaming',
      body: '<div class="atlas-addhint">Shows in the page switcher on the new tab &middot; empty is <span data-ab-default>Page ' + a.pageCount + '</span> &middot; Enter continues &middot; Esc cancels</div>' };
  }
  return { icon: AB_ICON_PAGE, value: a.sub, placeholder: 'Add a short subtitle, 3 to 5 words', back: true,
    body: '<div class="atlas-addtools"><span class="atlas-addhint" data-ab-count></span>' + abAddButton() + '</div>' };
}

function abDropInner() {
  var pills = ab.sites.map(function (s) { return { label: s.label, value: s.value }; });
  if (!pills.length) return '<div class="atlas-addhint">Type a website, then Enter &middot; Esc cancels</div>';
  var typed = ab.urlText.trim() ? ' &middot; Shift+Enter uses what you typed' : '';
  return abPills(pills, ab.siteAt, 'data-ab-site') + '<div class="atlas-addhint">Enter picks ' + abEsc(pills[ab.siteAt].value) + typed + ' &middot; &uarr;&darr; to move &middot; Esc cancels</div>';
}

function abFieldName() {
  if (ab.kind === 'page') return ab.step === 1 ? 'pageName' : 'sub';
  if (ab.kind === 'group') return ab.step === 1 ? 'groupName' : 'place';
  return ['url', 'name', 'place'][ab.step - 1];
}

function abRender() {
  if (!ab) return;
  var s = abScreen();
  ab.menu = null;
  ab.card.setAttribute('aria-label', AB_LABELS[ab.kind]);
  ab.field.innerHTML = (s.back ? '<button type="button" class="atlas-addback" data-ab-back aria-label="Back">' + AB_ICON_BACK + '</button>' : '') +
    '<span class="atlas-addicon">' + s.icon + '</span>' +
    '<input class="atlas-addinput" type="text" data-ab-field="' + abFieldName() + '" value="' + abEsc(s.value) + '" placeholder="' + abEsc(s.placeholder) + '" autocomplete="off" spellcheck="false"' + (s.readonly ? ' readonly' : '') + '>' +
    (s.where ? '<span class="atlas-addwhere">' + abEsc(s.where) + '</span>' : '');
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

/* ── moving on, and saving ── */

/* Enter, or the button: on to the next screen, and on the last one save. */
function abNext() {
  var flow = ab;
  abError('');
  if (flow.kind === 'bookmark') {
    if (flow.step === 1) {
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
    if (flow.step === 2) {
      if (!flow.name.trim()) { abError('Give the bookmark a name.'); return; }
      flow.step = 3;
      abRender();
      return;
    }
    if (flow.page === null) { abError('Add a page first, then a bookmark to it.'); return; }
    if (abNoGroups()) { abStartGroup(); return; }   // nothing to put it in yet: make the group, then come back
    abSave();
    return;
  }
  if (flow.kind === 'group' && flow.step === 1) {
    if (!flow.groupName.trim()) { abError('Give the new group a name.'); return; }
    flow.step = 2;
    abRender();
    return;
  }
  if (flow.kind === 'page' && flow.step === 1) {
    flow.step = 2;
    abRender();
    return;
  }
  abSave();
}

function abBack() {
  if (ab.kind === 'group' && ab.step === 1 && ab.returnTo) {   // out of a group made from a bookmark's screen 3, back to it
    ab.kind = 'bookmark'; ab.step = 3; ab.returnTo = null;
    abRender();
    return;
  }
  ab.step = Math.max(1, ab.step - 1);
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
  var job, group;
  if (flow.kind === 'page') {
    var problem = abSubProblem(flow.sub);
    if (problem) { abError(problem); return; }
    job = abAsk({ action: 'addPage', label: flow.pageName, sub: flow.sub });
  } else if (flow.kind === 'group') {
    group = flow.groupName.trim().toUpperCase();
    if (!group) { abError('Give the new group a name.'); return; }
    if (flow.page === null) { abError('Add a page first, then a group to it.'); return; }
    job = abAsk({ action: 'addGroup', db: abDb(), page: flow.page, group: group });
  } else {
    group = flow.group;
    if (!flow.name.trim()) { abError('Give the bookmark a name.'); return; }
    if (flow.page === null) { abError('Add a page first, then a bookmark to it.'); return; }
    if (!group) { abError('Choose a group.'); return; }
    job = abAsk({ action: 'addBookmark', db: abDb(), name: flow.name, url: flow.urlText.trim(), page: flow.page, group: group });
  }
  flow.busy = true;
  job.then(function (r) {
    flow.busy = false;
    if (ab !== flow) return;
    if (!(r && r.ok)) { abError((r && r.error) || 'That did not work. Try again.'); return; }
    if (flow.kind === 'group' && flow.returnTo) abBackWithGroup(group); else abClose();
  });
}

/* ── events ── */

function abWire() {
  var flow = ab;
  flow.card.addEventListener('mousedown', function (e) { if (!e.target.closest('input')) e.preventDefault(); });   // keep the cursor in the bar
  flow.card.addEventListener('click', function (e) {
    var t = e.target;
    if (t.closest('[data-ab-save]')) return abNext();
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
    else if (name === 'groupName') flow.groupName = e.target.value;
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
      if (field === 'url' && flow.sites.length && !e.shiftKey) abPickSite(flow.sites[flow.siteAt].value);   // Shift+Enter: what was typed, as it is
      else abNext();
    }
  }
  flow.field.addEventListener('keydown', onKey);
  flow.card.addEventListener('keydown', onKey);
}
