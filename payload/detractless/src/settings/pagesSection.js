// src/settings/pagesSection.js — Settings > Pages: every page with its subtitle,
// in the same order as the page switcher. Edit and Add page open the add popup
// in Page mode; pages move up and down and can be deleted. Home stays first and
// can't be moved or deleted. The page edits themselves live in tabs.js, shared
// with the switcher's right-click dialog.
import { activeTabs } from '../pages/newtab/newtabState.js';
import { displayName, movePage, deletePage } from '../components/tabs/tabs.js';
import { cleanSubtitle, starterSubtitle } from '../services/pageSubtitle.js';
import { openAddPopup } from '../components/addPopup/addPopup.js';
import { card, section } from './markup.js';

/** Which page is asking "delete, are you sure?" (one at a time). */
const state = { confirming: null };

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pageById = (id) => activeTabs.find((t) => String(t.id) === String(id));

function pill(action, id, label, opts = {}) {
  return `<button class="sp-pill sm${opts.danger ? ' danger' : ''}" data-action="${action}" data-id="${esc(id)}"` +
    `${opts.disabled ? ' disabled' : ''}${opts.title ? ` title="${esc(opts.title)}" aria-label="${esc(opts.title)}"` : ''}>${label}</button>`;
}

function controls(t, i) {
  if (t.type === 'search') return pill('page-edit', t.id, 'Edit');
  const last = i === activeTabs.length - 1;
  const firstMovable = i <= 1 || activeTabs[i - 1].type === 'search';
  return pill('page-up', t.id, '&uarr;', { disabled: firstMovable, title: `Move ${t.label} up` }) +
    pill('page-down', t.id, '&darr;', { disabled: last, title: `Move ${t.label} down` }) +
    pill('page-edit', t.id, 'Edit') +
    pill('page-delete', t.id, 'Delete', { danger: true });
}

function pageRow(t, i) {
  const asking = state.confirming === String(t.id);
  const ctrl = asking
    ? `<span class="pg-ask">Delete ${esc(t.label)} and its bookmarks?</span>` +
      `<button class="sp-pill sm" data-action="page-delete-cancel">Cancel</button>` +
      pill('page-delete-go', t.id, 'Delete', { danger: true })
    : controls(t, i);
  return `<div class="sp-row pg-row" data-page-id="${esc(t.id)}">` +
    `<div class="sp-row-text"><div class="sp-row-title">${esc(displayName(t))}</div>` +
    `<div class="sp-row-desc">${esc(cleanSubtitle(t.sub) || starterSubtitle(t))}</div></div>` +
    `<div class="sp-row-ctrl">${ctrl}</div></div>`;
}

/** Settings > Pages, rendered by settings/shell.js. */
export function pagesPage() {
  const list = activeTabs.map((t, i) => pageRow(t, i));
  const add = `<div class="sp-row pg-addrow"><button class="sp-pill" data-action="page-add">+ Add page</button></div>`;
  return section('', [card([...list, add])]) +
    `<p class="sp-row-desc pg-intro">The order here is the order in the page switcher. Right-click a page in the switcher for the same edits.</p>`;
}

/** Clicks on Settings > Pages (data-action="page-..."). `rerender` redraws the page. */
export function pageAction(act, id, rerender) {
  if (act === 'page-add') {
    openAddPopup({ mode: 'page', onSaved: rerender });
    return;
  }
  if (act === 'page-delete-cancel') {
    state.confirming = null;
    rerender();
    return;
  }
  const t = pageById(id);
  if (!t) return;
  if (act === 'page-edit') openAddPopup({ mode: 'page', page: t, onSaved: rerender });
  else if (act === 'page-up' || act === 'page-down') { movePage(t.id, act === 'page-up' ? -1 : 1); rerender(); }
  else if (act === 'page-delete') { state.confirming = String(t.id); rerender(); }
  else if (act === 'page-delete-go') { state.confirming = null; deletePage(t.id); rerender(); }
}

/** Leaving the page forgets an unanswered "are you sure?". */
export function resetPagesSection() {
  state.confirming = null;
}
