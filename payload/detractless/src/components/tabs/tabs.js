/* ══════════════════════════════════════════════════════════════════════
   PAGE SWITCHER (S-004, R-013)

   SELECTION LIVES HERE, not in the DOM. The current page is a module
   variable, and selectTab-through-click plus selectSearchTab() are its only
   writers. The external callers that used to poke radios call
   selectSearchTab().

   The shell (button + listbox) is built ONCE and its list is refilled per
   render. It is a 1:1 replica of dashboard-switcher.html: one button showing
   the current page, a listbox of pages, one highlight that follows focus.
   ══════════════════════════════════════════════════════════════════════ */

import './tabs.css';
import { DEFAULT_TABS } from '../../constants/defaults.js';
import { ContextMenu } from '../contextMenu/contextMenu.js';
import { openTabDialog } from '../bookmarks/bookmarkDialog.js';
import { editInBar } from '../shared/editInBar.js';
import { BookmarkDB } from '../../services/bookmarksDB.js';
// Unused here since the switcher replaced the filtered page list; kept so the
// bundle's module order (and so its start-up order) stays the same.
import '../shared/scrollAffordance.js';
import { storageGet, storageRemove, storageSet } from '../../services/storage.js';
import { cleanSubtitle, fillMissingSubtitles, starterSubtitle, subtitleProblem } from '../../services/pageSubtitle.js';
import {
  activeTabs, setActiveTabs, currentBookmarkPage
} from '../../pages/newtab/newtabState.js';

let _onTabClick = null;
let _onNavigateToSearch = null;

let selectedTabId = 'search';
let els = null; // built once by buildShell()

const checkSVG = '<svg class="check" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 8.5l3 3 6-7"/></svg>';
const chevSVG = '<svg class="chev" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6l4 4 4-4"/></svg>';

/** "AI TOOLS" -> "Ai tools": page names show in sentence case. */
function sentenceCase(t) {
  t = String(t || '');
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

/** Home shows as "Dashboard" unless the user renamed it. Settings > Pages uses it too. */
export function displayName(tab) {
  return (tab.type === 'search' && (!tab.label || tab.label === 'Home')) ? 'Dashboard' : sentenceCase(tab.label);
}

export function setTabNavigationCallbacks({ onTabClick, onNavigateToSearch }) {
  _onTabClick = onTabClick;
  _onNavigateToSearch = onNavigateToSearch;
}

export async function initializeTabs() {
  return new Promise((resolve) => {
    storageGet('sync', ["activeTabs"]).then((result) => {
      if (result.activeTabs && Array.isArray(result.activeTabs)) {
        setActiveTabs(result.activeTabs);
        if (fillMissingSubtitles(activeTabs)) saveTabs();
      } else {
        setActiveTabs([...DEFAULT_TABS]);
        saveTabs();
      }
      renderTabs();
      resolve();
    });
  });
}

export function saveTabs() { storageSet('sync', { activeTabs: activeTabs }); }

/** Select the Home/search page. */
export function selectSearchTab() {
  const home = activeTabs.find((t) => t.type === 'search') || activeTabs[0];
  if (home) {
    selectedTabId = home.id;
    syncSelection();
  }
}

function buildShell(container) {
  container.className = 'switcher';
  container.innerHTML = `
      <button class="switcher-btn" aria-haspopup="listbox" aria-expanded="false">
        <span class="switcher-label"></span>
        ${chevSVG}
      </button>
      <ul class="switcher-menu" role="listbox" tabindex="-1"></ul>
    `;
  const btn = container.querySelector('.switcher-btn');
  const label = container.querySelector('.switcher-label');
  const menu = container.querySelector('.switcher-menu');
  els = { container, btn, label, menu };

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    setOpen(btn.getAttribute('aria-expanded') !== 'true');
  });
  menu.addEventListener('click', (e) => onMenuClick(e, btn));
  document.addEventListener('click', (e) => {
    if (!els || !container.contains(e.target)) setOpen(false);
  });
  menu.addEventListener('mousemove', (e) => {
    const li = e.target.closest('.switcher-item');
    if (li && document.activeElement !== li) li.focus();
  });
  menu.addEventListener('mouseleave', () => {
    if (menu.classList.contains('open')) menu.focus();
  });
  menu.addEventListener('keydown', (e) => onMenuKey(e, menu, btn));
}

function onMenuClick(e, btn) {
  const li = e.target.closest('.switcher-item');
  if (!li) return;
  const targetId = isNaN(Number(li.dataset.id)) ? li.dataset.id : Number(li.dataset.id);
  const tab = activeTabs.find((t) => t.id === targetId || String(t.id) === li.dataset.id);
  if (!tab) return;
  selectedTabId = tab.id;
  syncSelection();
  setOpen(false);
  btn.focus();
  if (_onTabClick) _onTabClick(tab);
}

/* One highlight only: mouse hover moves focus, so :focus is the single source of truth. */
function onMenuKey(e, menu, btn) {
  const items = [...menu.children].filter((el) => el.classList.contains('switcher-item'));
  let i = items.indexOf(document.activeElement);
  if (i === -1 && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
    e.preventDefault();
    (menu.querySelector('[aria-selected="true"]') || items[0])?.focus();
    return;
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    items[(i + 1) % items.length]?.focus();
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault();
    items[(i - 1 + items.length) % items.length]?.focus();
  }
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    if (i !== -1) items[i].click();
  }
  if (e.key === 'Escape') {
    setOpen(false);
    btn.focus();
  }
}

function setOpen(open) {
  if (!els) return;
  els.btn.setAttribute('aria-expanded', String(open));
  els.menu.classList.toggle('open', Boolean(open));
  if (open) els.menu.focus();
}

export function renderTabs() {
  const container = document.getElementById('tabs-container') || document.getElementById('switcher');
  if (!container) return;
  if (!els || els.container !== container) buildShell(container);
  if (!activeTabs.some((t) => t.id === selectedTabId)) {
    const home = activeTabs.find((t) => t.type === 'search') || activeTabs[0];
    selectedTabId = home ? home.id : 'search';
  }
  els.menu.innerHTML = '';
  activeTabs.forEach((tab) => els.menu.appendChild(switcherItem(tab)));
  syncSelection();
}

function switcherItem(tab) {
  const li = document.createElement('li');
  li.className = 'switcher-item';
  li.setAttribute('role', 'option');
  li.setAttribute('tabindex', '-1');
  li.dataset.id = String(tab.id);
  li.setAttribute('aria-selected', String(tab.id === selectedTabId));

  /* Pages loaded at start already have one (initializeTabs); the fallback
     covers pages swapped in later, by an import or a profile switch. */
  const tabSub = cleanSubtitle(tab.sub) || starterSubtitle(tab);
  const spanLabel = document.createElement('span');
  spanLabel.className = 'label';
  spanLabel.textContent = displayName(tab);
  const spanSub = document.createElement('span');
  spanSub.className = 'sub';
  spanSub.textContent = tabSub;
  spanLabel.appendChild(spanSub);
  li.appendChild(spanLabel);
  li.insertAdjacentHTML('beforeend', checkSVG);

  li.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (ContextMenu.disabled) return;
    setOpen(false);
    // The address bar opens for it (editInBar.js); the pop-up is what runs when nothing answers.
    editInBar({ kind: 'page', id: tab.id, label: tab.label, name: displayName(tab), sub: cleanSubtitle(tab.sub) || starterSubtitle(tab), type: tab.type },
      () => openPageDialog(tab));
  });
  return li;
}

/** Rename / subtitle / Delete for one page, on the R-012 card. Home can't be deleted. */
function openPageDialog(tab) {
  openTabDialog({
    title: displayName(tab),
    name: tab.label,
    sub: cleanSubtitle(tab.sub) || starterSubtitle(tab),
    onRename: (newName) => updatePage(tab.id, { label: newName }),
    onSubtitle: (raw) => subtitleProblem(raw) || (updatePage(tab.id, { sub: cleanSubtitle(raw) }), true),
    onDelete: tab.type === 'search' ? null : () => deletePage(tab.id),
  });
}

/* ── Page edits (the page dialog and Settings > Pages share these) ─────── */

/** Change a page's name and/or subtitle. */
export function updatePage(id, patch) {
  const t = activeTabs.find((t2) => t2.id === id);
  if (!t) return;
  Object.assign(t, patch);
  saveTabs();
  renderTabs();
}

/** Delete a page and its bookmarks. Home is never deleted. */
export function deletePage(id) {
  const tab = activeTabs.find((t) => t.id === id);
  if (!tab || tab.type === 'search') return;
  setActiveTabs(activeTabs.filter((t) => t.id !== id));
  if (currentBookmarkPage === id) {
    if (_onNavigateToSearch) _onNavigateToSearch();
    selectSearchTab();
  }
  storageRemove('sync', `page${id}`);
  BookmarkDB.deleteBookmarks(id);
  saveTabs();
  renderTabs();
}

/** Move a page to place `index` in the list (dragging in Settings > Pages).
    Home stays first: nothing goes above it, and it never moves. */
export function movePageTo(id, index) {
  const from = activeTabs.findIndex((t) => t.id === id);
  if (from < 0 || activeTabs[from].type === 'search') return;
  const min = activeTabs[0] && activeTabs[0].type === 'search' ? 1 : 0;
  const to = Math.max(min, Math.min(index, activeTabs.length - 1));
  if (to === from) return;
  const next = activeTabs.slice();
  const [page] = next.splice(from, 1);
  next.splice(to, 0, page);
  setActiveTabs(next);
  saveTabs();
  renderTabs();
}

/** Move a page one place up (-1) or down (+1): the drag handle's arrow keys. */
export function movePage(id, step) {
  const from = activeTabs.findIndex((t) => t.id === id);
  if (from >= 0) movePageTo(id, from + step);
}

function syncSelection() {
  if (!els) return;
  els.menu.querySelectorAll('.switcher-item').forEach((item) => {
    item.setAttribute('aria-selected', String(item.dataset.id === String(selectedTabId)));
  });
  const index = activeTabs.findIndex((t) => t.id === selectedTabId);
  const tab = index === -1 ? null : activeTabs[index];
  const name = tab ? displayName(tab) : 'Dashboard';
  els.label.textContent = name;
  els.btn.title = name;
}

/* ── Page lifecycle ────────────────────────────────────────────────────── */

/** Add a page at the end and open it. The add popup asks for the name and subtitle. */
export function createPage(label, sub) {
  const newId = Date.now();
  const newTab = { id: newId, label, type: 'bookmarks', sub };
  activeTabs.push(newTab); saveTabs();
  // Navigate to the new page instead of announcing it with an alert().
  selectedTabId = newId;
  renderTabs();
  if (_onTabClick) _onTabClick(newTab);
}
