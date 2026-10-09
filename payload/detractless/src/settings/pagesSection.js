// src/settings/pagesSection.js — Settings > Pages: every page with its subtitle,
// in the same order as the page switcher. Drag a page by its handle (or press
// its arrow keys) to reorder; its ⋮ button opens Atlas's own right-click menu
// (components/atlas/atlas-menu.js) with Edit and Delete. Edit and Add
// page open the add popup in Page mode. Home stays first and can't be moved or
// deleted. The page edits themselves live in tabs.js, shared with the
// switcher's right-click dialog.
import { activeTabs } from '../pages/newtab/newtabState.js';
import { displayName, movePage, movePageTo, deletePage } from '../components/tabs/tabs.js';
import { cleanSubtitle, starterSubtitle } from '../services/pageSubtitle.js';
import { openAddPopup } from '../components/addPopup/addPopup.js';
import { card, section, KEBAB, GRIP } from './markup.js';

/* Which page is asking "delete, are you sure?", and which is being dragged. */
const state = { confirming: null, dragging: null };

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pageById = (id) => activeTabs.find((t) => String(t.id) === String(id));
const indexOf = (id) => activeTabs.findIndex((t) => String(t.id) === String(id));

function pill(action, id, label, danger) {
  return `<button class="sp-pill sm${danger ? ' danger' : ''}" data-action="${action}" data-id="${esc(id)}">${label}</button>`;
}

function controls(t) {
  return `<button class="sp-kebab" data-action="page-menu" data-id="${esc(t.id)}" aria-haspopup="menu" ` +
    `aria-label="More for ${esc(t.label)}" title="More">${KEBAB}</button>`;
}

/* The ⋮ menu: Atlas's right-click menu, its pointer at the ⋮ button. */
function openPageMenu(t, button, rerender) {
  if (!window.__atlasMenu) return;
  const items = [{ label: 'Edit', run: () => openAddPopup({ mode: 'page', page: t, onSaved: rerender }) }];
  if (t.type !== 'search') items.push({ label: 'Delete', run: () => { state.confirming = String(t.id); rerender(); } });
  const r = button.getBoundingClientRect();
  window.__atlasMenu.open({ clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }, items);
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

/** Clicks on Settings > Pages (data-action="page-..."). `rerender` redraws the
    page; `el` is the button clicked. */
export function pageAction(act, id, rerender, el) {
  if (act === 'page-drag') return; // the handle only drags
  if (act === 'page-add') { openAddPopup({ mode: 'page', onSaved: rerender }); return; }
  if (act === 'page-delete-cancel') { state.confirming = null; rerender(); return; }
  const t = pageById(id);
  if (!t) return;
  if (act === 'page-menu') { state.confirming = null; openPageMenu(t, el, rerender); }
  else if (act === 'page-delete-go') { state.confirming = null; deletePage(t.id); rerender(); }
}

/* Drop target: the row under the pointer. The dragged page takes its place. */
function rowAt(e, content) {
  const row = e.target && e.target.closest && e.target.closest('.pg-row[data-page-id]');
  return row && content.contains(row) ? row : null;
}

function clearDrop(content) {
  content.querySelectorAll('.pg-drop').forEach((r) => r.classList.remove('pg-drop'));
}

/** Dragging and the handle's arrow keys. Run once by settings/shell.js. */
export function wirePagesSection(content, rerender) {
  content.addEventListener('dragstart', (e) => {
    const h = e.target.closest && e.target.closest('[data-action="page-drag"]');
    if (!h) return;
    state.dragging = h.dataset.id;
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
}

/** Leaving the page forgets an unanswered "are you sure?". */
export function resetPagesSection() {
  state.confirming = null;
  state.dragging = null;
}
