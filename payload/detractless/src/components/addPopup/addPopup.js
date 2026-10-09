/* ══════════════════════════════════════════════════════════════════════
   THE ADD POPUP (spec 001, phase 2)

   One popup adds a bookmark or a page. The + button opens it in Bookmark mode;
   Settings > Pages opens it in Page mode, to add a page or edit one. It
   replaced the + menu and the four one-field dialogs that followed it (name,
   URL, page, group), which the user found slow and dated.

   Same dialog look as everything else here (picker-card, picker-well,
   picker-foot in styles/components.css) and the page switcher's way of
   marking the current choice. Nothing is written until Add: Cancel, Escape
   and the backdrop all leave no trace. The bookmark answers are checked with
   the rules the step-by-step flow used (utils/addBookmarkFlow.js), and the
   subtitle with services/pageSubtitle.js.
   ══════════════════════════════════════════════════════════════════════ */

import './addPopup.css';
import { BookmarkDB } from '../../services/bookmarksDB.js';
import { addBookmark } from '../bookmarks/bookmarks.js';
import { createPage, updatePage } from '../tabs/tabs.js';
import { NEW_GROUP, createFlowState, setValue, validateStep } from '../../utils/addBookmarkFlow.js';
import { activeTabs, currentBookmarkPage } from '../../pages/newtab/newtabState.js';
import { cleanSubtitle, subtitleProblem, MIN_WORDS, MAX_WORDS, MAX_CHARS } from '../../services/pageSubtitle.js';
import { popupMarkup, groupOptions } from './addPopupMarkup.js';

const bookmarkPages = () => activeTabs.filter((t) => t.type !== 'search');

/**
 * @param {object} [opts]
 * @param {'bookmark'|'page'} [opts.mode]  which form shows first
 * @param {object} [opts.page]  a page to edit (Page mode only, no mode switch)
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
  overlay.setAttribute('aria-label', editing ? 'Edit page' : 'Add a bookmark or a page');
  overlay.innerHTML = popupMarkup({
    editing, pages, startPage,
    pageCount: pages.length + 1,
  });
  document.body.appendChild(overlay);

  const popup = { overlay, editing, opts, $: (sel) => overlay.querySelector(sel) };
  wire(popup);
  setMode(popup, editing ? 'page' : (opts.mode || 'bookmark'));
  if (!editing) loadGroups(popup);
  return popup;
}

function close(popup) {
  popup.overlay.remove();
}

function field(popup, name) {
  return popup.$(`[data-field="${name}"]`);
}

function showError(popup, name, message) {
  const slot = popup.$(`[data-error-for="${name}"]`);
  if (slot) slot.textContent = message || '';
}

function clearErrors(popup) {
  popup.overlay.querySelectorAll('[data-error-for]').forEach((s) => { s.textContent = ''; });
}

function setMode(popup, mode) {
  popup.mode = mode;
  popup.overlay.querySelectorAll('[data-add-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.addMode === mode)));
  popup.overlay.querySelectorAll('[data-mode-fields]').forEach((w) => { w.hidden = w.dataset.modeFields !== mode; });
  clearErrors(popup);
  updateCount(popup);
  const first = field(popup, mode === 'page' ? 'pageName' : 'name');
  if (first) requestAnimationFrame(() => first.focus());
}

/* The groups on the chosen page, then "New group…". Re-run when the page changes. */
async function loadGroups(popup) {
  const pageSel = field(popup, 'page');
  const groupSel = field(popup, 'group');
  const id = pageIdFrom(pageSel.value);
  const asked = pageSel.value;
  const saved = id === undefined ? null : await BookmarkDB.getBookmarks(id);
  if (pageSel.value !== asked) return; // the page changed while this was loading
  /* Keep a choice made while the list was loading ("New group…" is there from
     the start), so a quick pick is never silently undone. */
  const kept = groupSel.value;
  groupSel.innerHTML = groupOptions(saved ? Object.keys(saved).sort() : []);
  if ([...groupSel.options].some((o) => o.value === kept)) groupSel.value = kept;
  toggleNewGroup(popup);
}

function pageIdFrom(value) {
  const tab = bookmarkPages().find((t) => String(t.id) === String(value));
  return tab ? tab.id : undefined;
}

function toggleNewGroup(popup) {
  const wrap = popup.$('[data-newgroup]');
  if (wrap) wrap.hidden = field(popup, 'group').value !== NEW_GROUP;
}

/* "2 of 3-5 words · 14 / 32" under the subtitle, so the limits are never a surprise. */
function updateCount(popup) {
  const slot = popup.$('.add-popup-count');
  if (!slot) return;
  const sub = cleanSubtitle(field(popup, 'sub').value);
  const words = sub ? sub.split(' ').length : 0;
  slot.textContent = `${words} of ${MIN_WORDS}-${MAX_WORDS} words · ${sub.length} / ${MAX_CHARS}`;
  slot.hidden = popup.mode !== 'page';
}

function wire(popup) {
  const { overlay } = popup;
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) return close(popup);
    const modeBtn = e.target.closest('[data-add-mode]');
    if (modeBtn) return setMode(popup, modeBtn.dataset.addMode);
    if (e.target.closest('[data-add-cancel]') || e.target.closest('.close-btn')) return close(popup);
    if (e.target.closest('[data-add-save]')) save(popup);
  });
  overlay.addEventListener('input', (e) => {
    const name = e.target.dataset && e.target.dataset.field;
    if (!name) return;
    showError(popup, name, '');
    if (name === 'sub') updateCount(popup);
  });
  overlay.addEventListener('change', (e) => {
    const name = e.target.dataset && e.target.dataset.field;
    if (name) showError(popup, name, '');
    if (name === 'page') loadGroups(popup);
    if (name === 'group') toggleNewGroup(popup);
  });
  overlay.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.matches('input')) { e.preventDefault(); save(popup); }
  });
}

async function save(popup) {
  clearErrors(popup);
  const ok = popup.mode === 'page' ? savePage(popup) : await saveBookmark(popup);
  if (!ok) return;
  close(popup);
  if (popup.opts.onSaved) popup.opts.onSaved();
}

/* ── Bookmark ───────────────────────────────────────────────────────── */

function bookmarkAnswers(popup) {
  let state = createFlowState(pageIdFrom(field(popup, 'page').value) ?? null);
  state = setValue(state, 'name', field(popup, 'name').value);
  state = setValue(state, 'url', field(popup, 'url').value);
  const group = field(popup, 'group').value;
  state = setValue(state, 'group', group || null);
  return setValue(state, 'newGroupName', field(popup, 'newGroup').value.trim().toUpperCase());
}

async function saveBookmark(popup) {
  const state = bookmarkAnswers(popup);
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
  wrong.forEach((k) => showError(popup, k, errors[k]));
  if (wrong.length) {
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
  const nameEl = field(popup, 'pageName');
  const label = nameEl.value.trim() || nameEl.placeholder;
  const sub = field(popup, 'sub').value;
  const problem = subtitleProblem(sub);
  if (problem) {
    showError(popup, 'sub', problem);
    field(popup, 'sub').focus();
    return false;
  }
  if (popup.editing) updatePage(popup.editing.id, { label, sub: cleanSubtitle(sub) });
  else createPage(label, cleanSubtitle(sub));
  return true;
}

/** The + button opens the popup. Run once at start. */
export function initAddPopup() {
  const plus = document.getElementById('global-add-btn');
  if (plus) plus.addEventListener('click', (e) => { e.stopPropagation(); openAddPopup({ mode: 'bookmark' }); });
}
