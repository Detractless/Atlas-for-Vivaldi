/* ── 26-addbar-edit.js: right-click on the new tab, in the address bar ──
   Right-clicking a bookmark, a group's name or a page in the new tab's page switcher sends the window a
   message (04-bridge-messages.js) and the bar opens here, as Add does, with the page behind dimmed.
   Screen 1 names what was clicked and offers pills: Rename, Edit URL, Delete for a bookmark; Rename, Move
   to page, Delete group for a group; Rename, Subtitle, Move, Delete for a page (Home has no Move or Delete:
   it always stays first). A page's Move picks the page it goes after, so pages can be put in order. Picking one
   turns the bar into that job, and the back arrow returns to the pills. A save is asked of the service
   worker script in this page (background/editFlow.js), which tells the new tab to show it.
   The state, `ab`, is in 23-addbar-core.js; its `edit` is what the new tab sent:
     { kind: 'bookmark', page, group, name, url } | { kind: 'group', page, group, count }
     | { kind: 'page', id, label, name, sub, type } */

var AB_ICON_TRASH = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 4.5h9M6.5 4.5V3h3v1.5M5 4.5l.5 8h5l.5-8"/></svg>';

function abEditPills() {
  var k = ab.edit.kind;
  if (k === 'bookmark') return [{ job: 'rename', label: 'Rename' }, { job: 'url', label: 'Edit URL' }, { job: 'delete', label: 'Delete' }];
  if (k === 'group') return [{ job: 'rename', label: 'Rename' }, { job: 'move', label: 'Move to page' }, { job: 'delete', label: 'Delete group' }];
  var pills = [{ job: 'rename', label: 'Rename' }, { job: 'sub', label: 'Subtitle' }];
  if (ab.edit.type !== 'search') pills.push({ job: 'move', label: 'Move' }, { job: 'delete', label: 'Delete' });
  return pills;
}

/* What the bar calls it, what is beside that, and its picture. */
function abEditName() {
  var e = ab.edit;
  return e.kind === 'group' ? e.group : (e.name || e.label || '');
}
function abEditWhere() {
  var e = ab.edit;
  if (e.kind === 'bookmark') return String(e.url || '').replace(/^https?:\/\//, '').replace(/^www\./, '');
  if (e.kind === 'group') return e.count === 1 ? '1 bookmark' : (e.count || 0) + ' bookmarks';
  return 'Page';
}
function abEditIcon() { return ab.edit.kind === 'bookmark' ? AB_ICON_BM : ab.edit.kind === 'group' ? AB_ICON_GROUP : AB_ICON_PAGE; }

/* The text the job starts from. */
function abEditStart(job) {
  var e = ab.edit;
  if (job === 'rename') return e.kind === 'group' ? e.group : e.kind === 'page' ? (e.label || e.name || '') : e.name;
  if (job === 'url') return e.url || '';
  return job === 'sub' ? (e.sub || '') : '';
}

function abEditField() {
  if (ab.step === 1) return 'editPick';
  return ab.job === 'move' ? 'editMove' : ab.job === 'delete' ? 'editDelete' : 'editValue';
}

function abEditPickInner() {
  var pills = abEditPills(), at = Math.min(ab.pillAt, pills.length - 1);
  return abPills(pills.map(function (p) { return { label: p.label, value: p.job }; }), at, 'data-ab-job') +
    '<div class="atlas-addhint">Enter picks ' + abEsc(pills[at].label) + ' &middot; &larr;&rarr; to move &middot; Esc cancels</div>';
}

function abEditQuestion() {
  var e = ab.edit;
  if (e.kind === 'group') return 'Delete ' + e.group + (e.count ? ' and ' + (e.count === 1 ? 'its bookmark' : 'its ' + e.count + ' bookmarks') : '') + '?';
  return e.kind === 'page' ? 'Delete ' + abEditName() + ' and its bookmarks?' : 'Delete ' + e.name + '?';
}

var AB_EDIT_ASK = { rename: ['Name this bookmark', 'Name this group', 'Name this page'], url: ['Address, like example.com'], sub: ['Add a short subtitle, 3 to 5 words'] };

/* What each screen shows, in the shape abScreen() returns. */
function abEditScreen() {
  var a = ab, e = a.edit;
  if (a.step === 1) {
    return { icon: abEditIcon(), value: abEditName(), placeholder: '', readonly: true, where: abEditWhere(),
      body: '<div data-ab-drop>' + abEditPickInner() + '</div>' };
  }
  if (a.job === 'move') {
    return { icon: abEditIcon(), value: abEditName(), placeholder: '', back: true, readonly: true, where: abEditWhere(),
      body: '<div data-ab-place>' + abEditPlaceInner() + '</div>' };
  }
  if (a.job === 'delete') {
    return { icon: AB_ICON_TRASH, value: abEditQuestion(), placeholder: '', back: true, readonly: true,
      body: '<div class="atlas-addtools"><span class="atlas-addhint">It goes for good &middot; Enter deletes &middot; Esc cancels</span>' +
        '<button type="button" class="atlas-addbtn is-soft" data-ab-cancel>Cancel</button>' +
        '<button type="button" class="atlas-addbtn is-danger" data-ab-save>Delete</button></div>' };
  }
  var asks = AB_EDIT_ASK[a.job], ask = asks[a.job === 'rename' ? ['bookmark', 'group', 'page'].indexOf(e.kind) : 0];
  var hint = a.job === 'sub' ? '<span class="atlas-addhint" data-ab-count></span>' : '<span class="atlas-addhint">Enter saves &middot; Esc cancels</span>';
  return { icon: abEditIcon(), value: a.value, placeholder: ask, back: true,
    body: '<div class="atlas-addtools">' + hint + abAddButton('Save') + '</div>' };
}

/* ── the pills ── */

function abEditMove(by) {
  var n = abEditPills().length;
  ab.pillAt = (ab.pillAt + by + n) % n;
  var drop = ab.card.querySelector('[data-ab-drop]');
  if (drop) drop.innerHTML = abEditPickInner();
}

function abEditPick(job) {
  if (!ab || ab.kind !== 'edit') return;
  ab.job = job;
  ab.step = 2;
  ab.value = abEditStart(job);
  abRender();
}

/* ── moving: a group goes to another page; a page goes after another page ──
   ab.pages leaves Home out (it holds no bookmarks), so a page's first choice is Home, value '': right after it. */

function abEditOthers() {
  var self = ab.edit.kind === 'page' ? ab.edit.id : ab.edit.page;
  return ab.pages.filter(function (p) { return String(p.id) !== String(self); });
}

function abEditAfterItems() {
  return [{ value: '', label: 'Home' }].concat(abEditOthers().map(function (p) { return { value: String(p.id), label: p.label }; }));
}

/* A group starts on the first other page; a page starts after the page it is after now. */
function abEditPagesLoaded(flow) {
  if (flow.edit.kind === 'page') {
    var at = -1;
    flow.pages.forEach(function (p, i) { if (String(p.id) === String(flow.edit.id)) at = i; });
    if (flow.moveTo === null) flow.moveTo = at > 0 ? String(flow.pages[at - 1].id) : '';
    return;
  }
  var others = abEditOthers();
  if (flow.moveTo === null && others.length) flow.moveTo = others[0].id;
}

function abEditChoose(value) {
  if (ab.edit.kind === 'page') {
    if (!abEditAfterItems().some(function (x) { return x.value === value; })) return;
    ab.moveTo = value;
  } else {
    var p = abEditOthers().filter(function (x) { return String(x.id) === value; })[0];
    if (!p) return;
    ab.moveTo = p.id;
  }
  abPaintPlace();
}

function abEditPlaceInner() {
  if (ab.edit.kind === 'page') {
    return '<div class="atlas-addplace"><span class="atlas-addlbl">After</span>' + abDropdown('page', 'After', abEditAfterItems(), ab.moveTo === null ? '' : ab.moveTo) + '</div>' +
      '<div class="atlas-addtools"><span class="atlas-addhint">Home always stays first &middot; Enter moves &middot; Esc cancels</span>' + abAddButton('Move') + '</div>';
  }
  var others = abEditOthers();
  if (!others.length) return '<div class="atlas-addtools"><span class="atlas-addhint">There is only one page, so there is nowhere to move it &middot; Esc cancels</span></div>';
  var items = others.map(function (p) { return { value: String(p.id), label: p.label }; });
  return '<div class="atlas-addplace"><span class="atlas-addlbl">Page</span>' + abDropdown('page', 'Page', items, ab.moveTo === null ? '' : ab.moveTo) + '</div>' +
    '<div class="atlas-addtools"><span class="atlas-addhint">Moves the group, with its bookmarks &middot; Enter moves &middot; Esc cancels</span>' + abAddButton('Move') + '</div>';
}

/* ── Enter, or the button: pick the highlighted pill, or do the job ── */

function abEditNext() {
  if (ab.step === 1) {
    var pills = abEditPills();
    abEditPick(pills[Math.min(ab.pillAt, pills.length - 1)].job);
    return;
  }
  abEditSave();
}

function abEditSave() {
  var flow = ab, e = flow.edit, job = flow.job;
  if (flow.busy) return;
  abError('');
  var msg;
  if (job === 'move' && flow.moveTo === null) { abError(e.kind === 'page' ? 'The pages are still loading. Try again.' : 'There is only one page.'); return; }
  if (e.kind === 'bookmark') msg = { action: 'editBookmark', db: abDb(), page: e.page, group: e.group, name: e.name, url: e.url, op: job, value: flow.value };
  else if (e.kind === 'group') msg = { action: 'editGroup', db: abDb(), page: e.page, group: e.group, op: job, value: flow.value, to: job === 'move' ? flow.moveTo : undefined };
  else msg = { action: 'editPage', db: abDb(), id: e.id, op: job, value: flow.value, after: job === 'move' ? flow.moveTo : undefined };
  flow.busy = true;
  abAsk(msg).then(function (r) {
    flow.busy = false;
    if (ab !== flow) return;
    if (r && r.ok) abClose(); else abError((r && r.error) || 'That did not work. Try again.');
  });
}
