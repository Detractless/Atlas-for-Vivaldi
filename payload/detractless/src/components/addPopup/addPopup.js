/* ═══════════════════════════════════════════════════════
   THE ADD POPUP

   One question per screen. Adding a bookmark is two screens: which website (the address bar's card:
   a field with pills of the sites you visit under it), then the name and where it goes (the name in
   the same card; the page and the group as drop-down pills). Adding a page is two screens too: its
   name, then a short subtitle. Editing a page is one screen with both.

   The question is the title. Which flow opens depends on who asked: the profile menu's "Add
   bookmark" or "Add page", the + button on the new tab (a bookmark), or Settings > Pages.

   Nothing is written until Add: Cancel, Escape and the backdrop all leave no trace. The bookmark
   answers live in the flow state (utils/addBookmarkFlow.js), not in the widgets that show them, and
   are checked with its rules; the subtitle with services/pageSubtitle.js.
   ═══════════════════════════════════════════════════════ */

import './addPopup.css';
import { BookmarkDB } from '../../services/bookmarksDB.js';
import { addBookmark } from '../bookmarks/bookmarks.js';
import { createPage, updatePage } from '../tabs/tabs.js';
import { NEW_GROUP, createFlowState, setValue, validateStep } from '../../utils/addBookmarkFlow.js';
import { activeTabs, currentBookmarkPage, allCachedBookmarks } from '../../pages/newtab/newtabState.js';
import { cleanSubtitle, subtitleProblem, MIN_WORDS, MAX_WORDS, MAX_CHARS } from '../../services/pageSubtitle.js';
import { loadSites, matchSites, mainDomain, hostOf, nameChoices } from '../../services/siteSuggestions.js';
import { frameMarkup, button, websiteScreen, siteDrop, placeScreen, dropdown, plainField } from './addPopupMarkup.js';

const bookmarkPages = () => activeTabs.filter((t) => t.type !== 'search');
/* Sites already saved are not offered again. */
const savedDomains = () => new Set((allCachedBookmarks || []).map((b) => mainDomain(hostOf(b && b.url))).filter(Boolean));

/**
 * @param {object} [opts]
 * @param {'bookmark'|'page'} [opts.mode]  which flow opens
 * @param {object} [opts.page]  a page to edit (one screen, no steps)
 * @param {function} [opts.onSaved]  called after a successful save
 */
export function openAddPopup(opts = {}) {
  document.querySelectorAll('.add-popup').forEach((n) => n.remove());
  const editing = opts.page || null;
  const pages = bookmarkPages();
  const startPage = pages.some((t) => t.id === currentBookmarkPage) ? currentBookmarkPage : (pages[0] && pages[0].id);

  const overlay = document.createElement('div');
  overlay.className = 'modal show picker-modal add-popup';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', editing ? 'Edit page' : opts.mode === 'page' ? 'Add page' : 'Add bookmark');
  document.body.appendChild(overlay);

  const popup = {
    overlay, opts, editing,
    kind: editing || opts.mode === 'page' ? 'page' : 'bookmark',
    step: 1,
    flow: createFlowState(startPage === undefined ? null : startPage),
    urlText: '', nameTouched: false, sites: [], siteAt: 0,
    groups: [], groupsFor: null, menu: null,
    pageName: editing ? editing.label : '', sub: editing ? (editing.sub || '') : '',
    pageCount: pages.length + 1,
  };
  wire(popup);
  render(popup);
  if (popup.kind === 'bookmark') {
    loadSites().then((sites) => {
      popup.sites = sites;
      if (overlay.isConnected && popup.step === 1) paintSites(popup);
    });
  }
  return popup;
}

function close(popup) {
  popup.overlay.remove();
}

const $ = (popup, sel) => popup.overlay.querySelector(sel);
const field = (popup, name) => $(popup, `[data-field="${name}"]`);

function showError(popup, name, message) {
  const slot = $(popup, `[data-error-for="${name}"]`);
  if (slot) slot.textContent = message || '';
}

function clearErrors(popup) {
  popup.overlay.querySelectorAll('[data-error-for]').forEach((s) => { s.textContent = ''; });
}

/* ── Drawing the current screen from the answers so far ───────────────── */

function sitePills(popup) {
  return matchSites(popup.sites, popup.urlText, 8, savedDomains()).map((s) => ({ label: s.domain, value: s.domain }));
}

function pageItems() {
  return bookmarkPages().map((t) => ({ value: String(t.id), label: t.label }));
}

function groupItems(popup) {
  return [...popup.groups.map((g) => ({ value: g, label: g })), { value: NEW_GROUP, label: '+ New group' }];
}

function render(popup) {
  const { kind, step, editing } = popup;
  let frame;
  if (kind === 'bookmark' && step === 1) {
    const pills = sitePills(popup);
    popup.siteAt = Math.min(popup.siteAt, Math.max(pills.length - 1, 0));
    frame = { title: 'Which website?', total: 2, body: websiteScreen({ urlText: popup.urlText, pills, at: popup.siteAt }),
      left: button('data-add-cancel', 'Cancel'), right: button('data-add-next', 'Next', true, !popup.urlText.trim()) };
  } else if (kind === 'bookmark') {
    const names = nameChoices(popup.urlText).map((n) => ({ label: n, value: n }));
    frame = { title: 'Name and place', total: 2,
      body: placeScreen({ name: popup.flow.name, namePills: names, pageItems: pageItems(), page: popup.flow.page === null ? '' : String(popup.flow.page),
        groupItems: groupItems(popup), group: popup.flow.group, newGroup: popup.flow.newGroupName, showNewGroup: popup.flow.group === NEW_GROUP }),
      left: button('data-add-back', 'Back'), right: button('data-add-save', 'Add', true) };
  } else if (editing) {
    frame = { title: 'Edit page', total: 1,
      body: plainField({ field: 'pageName', label: 'Name', value: popup.pageName, placeholder: `Page ${popup.pageCount}` }) +
        plainField({ field: 'sub', label: 'Subtitle', value: popup.sub, placeholder: 'Three to five words', aside: '<span class="ap-count" data-count></span>' }),
      left: button('data-add-cancel', 'Cancel'), right: button('data-add-save', 'Save', true) };
  } else if (step === 1) {
    frame = { title: 'What is the page called?', total: 2,
      body: plainField({ field: 'pageName', value: popup.pageName, placeholder: `Page ${popup.pageCount}` }),
      left: button('data-add-cancel', 'Cancel'), right: button('data-add-next', 'Next', true) };
  } else {
    frame = { title: 'Give it a short subtitle', total: 2,
      body: plainField({ field: 'sub', value: popup.sub, placeholder: 'Three to five words', aside: '<span class="ap-count" data-count></span>' }),
      left: button('data-add-back', 'Back'), right: button('data-add-save', 'Add', true) };
  }
  popup.menu = null;
  popup.overlay.innerHTML = frameMarkup({ ...frame, step });
  popup.overlay.dataset.kind = kind;
  popup.overlay.dataset.step = String(step);
  clearErrors(popup);
  updateCount(popup);
  if (kind === 'bookmark' && step === 2) loadGroups(popup);
  const first = popup.overlay.querySelector('.ap-input');
  if (first) requestAnimationFrame(() => first.focus());
}

/* The pills under the address field follow what is typed, without redrawing the field. */
function paintSites(popup) {
  const drop = $(popup, '[data-drop="url"]');
  if (!drop) return;
  const pills = sitePills(popup);
  popup.siteAt = Math.min(popup.siteAt, Math.max(pills.length - 1, 0));
  const parts = siteDrop(pills, popup.siteAt);
  drop.innerHTML = `${parts.pillsHtml}<div class="ap-hint" data-hint>${parts.hint}</div>`;
  drop.hidden = pills.length === 0;
  const card = $(popup, '[data-card="url"]');
  if (card) card.classList.toggle('ap-card--open', pills.length > 0);
  const next = $(popup, '[data-add-next]');
  if (next) next.disabled = !popup.urlText.trim();
}

/* The page and group drop-downs, after the page or its groups changed. */
function paintPlace(popup) {
  const cols = $(popup, '.ap-cols');
  if (!cols) return;
  cols.innerHTML = dropdown({ key: 'page', label: 'Page', value: popup.flow.page === null ? '' : String(popup.flow.page), items: pageItems() }) +
    dropdown({ key: 'group', label: 'Group', value: popup.flow.group, items: groupItems(popup) });
  popup.menu = null;
  const wrap = $(popup, '[data-newgroup]');
  if (wrap) wrap.hidden = popup.flow.group !== NEW_GROUP;
}

/* The groups on the chosen page. A page with none starts a new group; otherwise the first is chosen. */
async function loadGroups(popup) {
  const id = popup.flow.page;
  const asked = String(id);
  popup.groupsFor = asked;
  const saved = id === null || id === undefined ? null : await BookmarkDB.getBookmarks(id);
  if (popup.groupsFor !== asked || !popup.overlay.isConnected) return; // the page changed while this was loading
  popup.groups = saved ? Object.keys(saved).sort() : [];
  let group = popup.flow.group;
  if (group === null || (group !== NEW_GROUP && !popup.groups.includes(group))) group = popup.groups.length ? popup.groups[0] : NEW_GROUP;
  popup.flow = setValue(popup.flow, 'group', group);
  paintPlace(popup);
}

function updateCount(popup) {
  const slot = $(popup, '[data-count]');
  if (!slot) return;
  const sub = cleanSubtitle(popup.sub);
  const words = sub ? sub.split(' ').length : 0;
  slot.textContent = `${words} of ${MIN_WORDS}-${MAX_WORDS} words · ${sub.length} / ${MAX_CHARS}`;
}

/* ── Moving between screens ───────────────────────────────────────── */

function next(popup) {
  clearErrors(popup);
  if (popup.kind === 'bookmark') {
    popup.flow = setValue(popup.flow, 'url', popup.urlText.trim());
    const problem = validateStep(popup.flow, 'url');
    if (problem) { showError(popup, 'url', problem); return; }
    if (!popup.nameTouched) popup.flow = setValue(popup.flow, 'name', nameChoices(popup.urlText)[0] || hostOf(popup.urlText) || '');
  }
  popup.step = 2;
  render(popup);
}

function back(popup) {
  popup.step = 1;
  render(popup);
}

function pickSite(popup, domain) {
  popup.urlText = domain;
  popup.siteAt = 0;
  next(popup);
}

/* ── Drop-downs ───────────────────────────────────────────────────── */

function closeMenus(popup) {
  popup.overlay.querySelectorAll('[data-dd-menu]').forEach((m) => { m.hidden = true; });
  popup.overlay.querySelectorAll('[data-dd]').forEach((b) => b.setAttribute('aria-expanded', 'false'));
  popup.menu = null;
}

function toggleMenu(popup, key) {
  const wasOpen = popup.menu === key;
  closeMenus(popup);
  if (wasOpen) return;
  const menu = $(popup, `[data-dd-menu="${key}"]`);
  if (!menu) return;
  menu.hidden = false;
  popup.menu = key;
  const btn = $(popup, `[data-dd="${key}"]`);
  if (btn) btn.setAttribute('aria-expanded', 'true');
}

function choose(popup, key, value) {
  if (key === 'page') {
    const tab = bookmarkPages().find((t) => String(t.id) === value);
    if (!tab) return;
    popup.flow = setValue(popup.flow, 'page', tab.id);   // changing the page clears the group
    popup.groups = [];
    paintPlace(popup);
    loadGroups(popup);
  } else if (key === 'group') {
    popup.flow = setValue(popup.flow, 'group', value);
    paintPlace(popup);
    if (value === NEW_GROUP) { const f = field(popup, 'newGroup'); if (f) f.focus(); }
  }
  closeMenus(popup);
}

/* ── Events ───────────────────────────────────────────────────────── */

function wire(popup) {
  const { overlay } = popup;
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) return close(popup);
    const t = e.target;
    if (t.closest('[data-add-cancel]')) return close(popup);
    if (t.closest('[data-add-next]')) return next(popup);
    if (t.closest('[data-add-back]')) return back(popup);
    if (t.closest('[data-add-save]')) return void save(popup);
    const site = t.closest('[data-site]');
    if (site) return pickSite(popup, site.dataset.site);
    const namePill = t.closest('[data-name-pill]');
    if (namePill) {
      popup.flow = setValue(popup.flow, 'name', namePill.dataset.namePill);
      popup.nameTouched = true;
      const input = field(popup, 'name');
      if (input) { input.value = namePill.dataset.namePill; input.focus(); }
      overlay.querySelectorAll('[data-name-pill]').forEach((p) => p.setAttribute('aria-selected', String(p === namePill)));
      return;
    }
    const dd = t.closest('[data-dd]');
    if (dd) return toggleMenu(popup, dd.dataset.dd);
    const item = t.closest('[data-dd-item]');
    if (item) return choose(popup, item.dataset.ddItem, item.dataset.value);
    if (popup.menu) closeMenus(popup);
  });

  overlay.addEventListener('input', (e) => {
    const name = e.target.dataset && e.target.dataset.field;
    if (!name) return;
    showError(popup, name, '');
    if (name === 'url') { popup.urlText = e.target.value; popup.siteAt = 0; paintSites(popup); }
    else if (name === 'name') { popup.flow = setValue(popup.flow, 'name', e.target.value); popup.nameTouched = true; }
    else if (name === 'newGroup') popup.flow = setValue(popup.flow, 'newGroupName', e.target.value);
    else if (name === 'pageName') popup.pageName = e.target.value;
    else if (name === 'sub') { popup.sub = e.target.value; updateCount(popup); }
  });

  overlay.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (popup.menu) closeMenus(popup); else close(popup);
      return;
    }
    const input = e.target && e.target.matches && e.target.matches('input') ? e.target : null;
    if (!input) return;
    const isUrl = input.dataset.field === 'url';
    if (isUrl && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      const n = sitePills(popup).length;
      if (!n) return;
      e.preventDefault();
      popup.siteAt = (popup.siteAt + (e.key === 'ArrowDown' ? 1 : n - 1)) % n;
      paintSites(popup);
      return;
    }
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (isUrl) {
      const pills = sitePills(popup);
      if (pills.length) pickSite(popup, pills[popup.siteAt].value); else next(popup);
    } else if ($(popup, '[data-add-next]')) next(popup);
    else save(popup);
  });
}

async function save(popup) {
  clearErrors(popup);
  const ok = popup.kind === 'page' ? savePage(popup) : await saveBookmark(popup);
  if (!ok) return;
  close(popup);
  if (popup.opts.onSaved) popup.opts.onSaved();
}

/* ── Bookmark ───────────────────────────────────────────────────────── */

async function saveBookmark(popup) {
  const state = setValue(popup.flow, 'newGroupName', popup.flow.newGroupName.trim().toUpperCase());
  const errors = {
    name: validateStep(state, 'name'),
    url: validateStep(state, 'url'),
    page: state.page === null ? 'Add a page first, then a bookmark to it.' : null,
  };
  const groupError = validateStep(state, 'group');
  if (groupError) errors[state.group === NEW_GROUP ? 'newGroup' : 'group'] = groupError;
  if (!errors.page && state.group === NEW_GROUP && state.newGroupName) {
    const existing = await BookmarkDB.getBookmarks(state.page);
    if (existing && existing[state.newGroupName]) errors.newGroup = `${state.newGroupName} already exists on this page.`;
  }
  const wrong = Object.keys(errors).filter((k) => errors[k]);
  if (wrong.length) {
    if (errors.url) { popup.step = 1; render(popup); }   // the address lives on the first screen
    wrong.forEach((k) => showError(popup, k, errors[k]));
    const first = field(popup, wrong[0]);
    if (first) first.focus();
    return false;
  }
  await addBookmark({
    name: state.name.trim(),
    url: state.url.trim(),
    page: state.page,
    group: state.group === NEW_GROUP ? state.newGroupName : state.group,
  });
  return true;
}

/* ── Page ───────────────────────────────────────────────────────────── */

function savePage(popup) {
  const label = popup.pageName.trim() || `Page ${popup.pageCount}`;
  const problem = subtitleProblem(popup.sub);
  if (problem) {
    if (popup.step === 1 && !popup.editing) { popup.step = 2; render(popup); }
    showError(popup, 'sub', problem);
    const el = field(popup, 'sub');
    if (el) el.focus();
    return false;
  }
  if (popup.editing) updatePage(popup.editing.id, { label, sub: cleanSubtitle(popup.sub) });
  else createPage(label, cleanSubtitle(popup.sub));
  return true;
}

/** The + button on the new tab opens the popup for a bookmark. Run once at start. (The profile menu's
    Add bookmark and Add page open in the address bar instead: src/modules/23-addbar-core.js.) */
export function initAddPopup() {
  const plus = document.getElementById('global-add-btn');
  if (plus) plus.addEventListener('click', (e) => { e.stopPropagation(); openAddPopup({ mode: 'bookmark' }); });
}
