/* ── 25-addbar-place.js: the Page and Group choices of the address bar's Add flow ──
   Add bookmark's screen 3 (page and group) and Add group's screen 2 (page) both draw them: two labelled
   rows and a button, with the lists dropping down from the choices. Only groups a page already has are
   offered. A page with none says "None yet" and the button becomes "Add group", which runs the Add group
   flow (24-addbar-screens.js) and comes back to screen 3 with the new group chosen.
   The state, `ab`, is in 23-addbar-core.js. */

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
function abGroupItems() { return ab.groups.map(function (g) { return { value: g, label: g }; }); }

function abPageLabel() {
  var p = ab.pages.filter(function (x) { return x.id === ab.page; })[0];
  return p ? p.label : '';
}

/* The page's groups have been read and there are none. */
function abGroupsEmpty() { return ab.groupsLoaded && !ab.groups.length; }
/* There is a page, and it has no group to put a bookmark in. */
function abNoGroups() { return ab.page !== null && abGroupsEmpty(); }

/* The card of screen 3 (bookmark) or screen 2 (group): Page, and for a bookmark Group, each named, and the button. */
function abPlaceInner() {
  if (ab.kind === 'edit') return abEditPlaceInner();
  var page = '<span class="atlas-addlbl">Page</span>' + abDropdown('page', 'Page', abPageItems(), ab.page === null ? '' : ab.page);
  if (ab.kind === 'group') {
    return '<div class="atlas-addplace">' + page + '</div>' +
      '<div class="atlas-addtools"><span class="atlas-addhint">Enter adds the group &middot; Esc cancels</span>' + abAddButton() + '</div>';
  }
  var none = abNoGroups();
  var group = abGroupsEmpty() ? '<span class="atlas-addnone">None yet</span>' : abDropdown('group', 'Group', abGroupItems(), ab.group);
  var hint = none ? abEsc(abPageLabel()) + ' has no groups yet &middot; Enter adds a group' : 'Enter adds &middot; Esc cancels';
  return '<div class="atlas-addplace">' + page + '<span class="atlas-addlbl">Group</span>' + group + '</div>' +
    '<div class="atlas-addtools"><span class="atlas-addhint">' + hint + '</span>' + abAddButton(none ? 'Add group' : 'Add') + '</div>';
}

function abPaintPlace() {
  var place = ab && ab.card.querySelector('[data-ab-place]');
  if (!place) return;
  place.innerHTML = abPlaceInner();
  ab.menu = null;
}

/* ── the page's groups, and the drop-down lists ── */

function abLoadGroups() {
  var flow = ab, page = flow.page;
  if (page === null || page === undefined) { flow.groups = []; flow.groupsLoaded = true; abPaintPlace(); return; }
  abAsk({ action: 'addGroups', db: abDb(), page: page }).then(function (r) {
    if (ab !== flow || flow.page !== page) return;   // the page changed while this was loading
    flow.groups = r.groups || [];
    flow.groupsLoaded = true;
    if (flow.group === null || flow.groups.indexOf(flow.group) < 0) flow.group = flow.groups.length ? flow.groups[0] : null;
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
  if (ab.kind === 'edit') { abEditChoose(value); abCloseMenus(); return; }
  if (key === 'page') {
    var id = ab.pages.filter(function (p) { return String(p.id) === value; })[0];
    if (!id) return;
    ab.page = id.id; ab.group = null; ab.groups = []; ab.groupsLoaded = false;
    abPaintPlace();
    if (ab.kind === 'bookmark') abLoadGroups();   // a group is only made on the page it is for, so it needs no list
  } else {
    ab.group = value;
    abPaintPlace();
  }
  abCloseMenus();
}

/* ── making a group from a bookmark's screen 3, and coming back ── */

/* "Add group" on screen 3, for a page with no groups: the Add group flow, with the page already chosen. */
function abStartGroup() {
  ab.returnTo = 'bookmark';
  ab.kind = 'group';
  ab.step = 1;
  abRender();
}

/* The group is made: back to the bookmark's screen 3 with it chosen. The page's groups are read again, as the page may have changed. */
function abBackWithGroup(group) {
  ab.kind = 'bookmark';
  ab.step = 3;
  ab.returnTo = null;
  ab.groupName = '';
  ab.group = group;
  ab.groups = [];
  ab.groupsLoaded = false;
  abRender();
  abLoadGroups();
}
