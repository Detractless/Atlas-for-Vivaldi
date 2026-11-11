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
import './add-popup.css';
import { BookmarkDB } from '../../services/bookmarksDB.js';
import { addBookmark } from '../bookmarks/bookmarks.js';
import { createPage, updatePage } from '../tabs/tabs.js';
import { NEW_GROUP, createFlowState, setValue, validateStep } from '../../utils/addBookmarkFlow.js';
import { currentBookmarkPage } from '../../pages/newtab/newtabState.js';
import { cleanSubtitle, subtitleProblem } from '../../services/pageSubtitle.js';
import { loadSites } from '../../services/siteSuggestions.js';
import { close, $, field, showError, clearErrors } from './add-popup-dom.js';
import {
  bookmarkPages, sitePills, render, paintSites, updateCount,
  next, back, pickSite, closeMenus, toggleMenu, choose
} from './add-popup-screens.js';

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
/* ── Events ───────────────────────────────────────────────────────── */

function wire(popup) {
  wireClick(popup);
  wireInput(popup);
  wireKeys(popup);
}

function wireClick(popup) {
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
}

function wireInput(popup) {
  const { overlay } = popup;
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
}

function wireKeys(popup) {
  const { overlay } = popup;
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
