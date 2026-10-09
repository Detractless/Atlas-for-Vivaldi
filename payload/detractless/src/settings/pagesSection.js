// src/settings/pagesSection.js — Settings > Pages: every page with its subtitle,
// in the same order as the page switcher. Drag a page by its handle (or press
// its arrow keys) to reorder; its ⋮ menu holds Edit and Delete. Edit and Add
// page open the add popup in Page mode. Home stays first and can't be moved or
// deleted. The page edits themselves live in tabs.js, shared with the
// switcher's right-click dialog.
import { activeTabs } from '../pages/newtab/newtabState.js';
import { displayName, movePage, movePageTo, deletePage } from '../components/tabs/tabs.js';
import { cleanSubtitle, starterSubtitle } from '../services/pageSubtitle.js';
import { openAddPopup } from '../components/addPopup/addPopup.js';
import { card, section, KEBAB, GRIP } from './markup.js';

/* Which page's ⋮ menu is open, and which is asking "delete, are you sure?". */
const state = { menuFor: null, confirming: null, dragging: null };

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pageById = (id) => activeTabs.find((t) => String(t.id) === String(id));
const indexOf = (id) => activeTabs.findIndex((t) => String(t.id) === String(id));

function pill(action, id, label, danger) {
  return `<button class="sp-pill sm${danger ? ' danger' : ''}" data-action="${action}" data-id="${esc(id)}">${label}</button>`;
}

function menu(t) {
  if (state.menuFor !== String(t.id)) return '';
  const id = esc(t.id);
  return `<div class="sp-popmenu" role="menu">` +
    `<button role="menuitem" data-action="page-edit" data-id="${id}">Edit</button>` +
    (t.type === 'search' ? '' : `<button role="menuitem" class="danger" data-action="page-delete" data-id="${id}">Delete</button>`) +
    `</div>`;
}

function controls(t) {
  const id = esc(t.id), name = esc(t.label);
  return `<span class="sp-menuwrap"><button class="sp-kebab" data-action="page-menu" data-id="${id}" aria-haspopup="menu" ` +
    `aria-expanded="${state.menuFor === String(t.id)}" aria-label="More for ${name}" title="More">${KEBAB}</button>${menu(t)}</span>`;
}

function pageRow(t) {
  const asking = state.confirming === String(t.id);
  const ctrl = asking
    ? `<span class="pg-ask">Delete ${esc(t.label)} and its bookmarks?</span>` +
      `<button class="sp-pill sm" data-action="page-delete-cancel">Cancel</button>` +
      pill('page-delete-go', t.id, 'Delete', true)
    : controls(t);
  const handle = t.type === 'search'
    ? '<span class="pg-grip pg-grip--fixed" aria-hidden="true"></span>'
    : `<button class="pg-grip" draggable="true" data-action="page-drag" data-id="${esc(t.id)}" ` +
      `aria-label="Move ${esc(t.label)}: drag, or use the arrow keys" title="Drag to reorder">${GRIP}</button>`;
  return `<div class="sp-row pg-row" data-page-id="${esc(t.id)}">${handle}` +
    `<div class="sp-row-text"><div class="sp-row-title">${esc(displayName(t))}</div>` +
    `<div class="sp-row-desc">${esc(cleanSubtitle(t.sub) || starterSubtitle(t))}</div></div>` +
    `<div class="sp-row-ctrl">${ctrl}</div></div>`;
}

/** Settings > Pages, rendered by settings/shell.js. */
export function pagesPage() {
  const list = activeTabs.map((t) => pageRow(t));
  const add = `<div class="sp-row pg-addrow"><button class="sp-pill" data-action="page-add">+ Add page</button></div>`;
  return section('', [card([...list, add])]) +
    `<p class="sp-row-desc pg-intro">Drag a page to change its place in the page switcher. Right-click a page in the switcher for the same edits.</p>`;
}

/** Clicks on Settings > Pages (data-action="page-..."). `rerender` redraws the page. */
export function pageAction(act, id, rerender) {
  if (act === 'page-drag') return; // the handle only drags
  if (act === 'page-add') { state.menuFor = null; openAddPopup({ mode: 'page', onSaved: rerender }); return; }
  if (act === 'page-delete-cancel') { state.confirming = null; rerender(); return; }
  const t = pageById(id);
  if (!t) return;
  if (act === 'page-menu') {
    state.menuFor = state.menuFor === String(t.id) ? null : String(t.id);
    state.confirming = null;
    rerender();
  } else if (act === 'page-edit') {
    state.menuFor = null;
    rerender();
    openAddPopup({ mode: 'page', page: t, onSaved: rerender });
  } else if (act === 'page-delete') {
    state.menuFor = null; state.confirming = String(t.id); rerender();
  } else if (act === 'page-delete-go') {
    state.confirming = null; deletePage(t.id); rerender();
  }
}

/* Drop target: the row under the pointer. The dragged page takes its place. */
function rowAt(e, content) {
  const row = e.target && e.target.closest && e.target.closest('.pg-row[data-page-id]');
  return row && content.contains(row) ? row : null;
}

function clearDrop(content) {
  content.querySelectorAll('.pg-drop').forEach((r) => r.classList.remove('pg-drop'));
}

/** Dragging, the handle's arrow keys, and closing the ⋮ menu. Run once by settings/shell.js. */
export function wirePagesSection(content, rerender, isOpen) {
  content.addEventListener('dragstart', (e) => {
    const h = e.target.closest && e.target.closest('[data-action="page-drag"]');
    if (!h) return;
    state.dragging = h.dataset.id;
    state.menuFor = null;
    if (e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', h.dataset.id); }
  });
  content.addEventListener('dragover', (e) => {
    const row = state.dragging !== null && rowAt(e, content);
    if (!row) return;
    e.preventDefault();
    clearDrop(content);
    row.classList.add('pg-drop');
  });
  content.addEventListener('drop', (e) => {
    const row = state.dragging !== null && rowAt(e, content);
    if (!row) return;
    e.preventDefault();
    const page = pageById(state.dragging);
    state.dragging = null;
    clearDrop(content);
    if (page) { movePageTo(page.id, indexOf(row.dataset.pageId)); rerender(); }
  });
  content.addEventListener('dragend', () => { state.dragging = null; clearDrop(content); });
  content.addEventListener('keydown', (e) => {
    const h = e.target.closest && e.target.closest('[data-action="page-drag"]');
    if (!h || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    e.preventDefault();
    const page = pageById(h.dataset.id);
    if (!page) return;
    movePage(page.id, e.key === 'ArrowUp' ? -1 : 1);
    rerender();
    const again = [...content.querySelectorAll('[data-action="page-drag"]')].find((b) => b.dataset.id === String(page.id));
    if (again) again.focus();
  });
  /* The ⋮ menu closes on Escape (before Settings' own Escape closes Settings)
     and on any click outside it. */
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || state.menuFor === null || !isOpen()) return;
    e.preventDefault();
    e.stopPropagation();
    state.menuFor = null;
    rerender();
  }, true);
  document.addEventListener('click', (e) => {
    if (state.menuFor === null || !isOpen()) return;
    if (e.target.closest && e.target.closest('.sp-popmenu, [data-action="page-menu"]')) return;
    state.menuFor = null;
    rerender();
  }, true);
}

/** Leaving the page forgets an open menu and an unanswered "are you sure?". */
export function resetPagesSection() {
  state.menuFor = null;
  state.confirming = null;
  state.dragging = null;
}
