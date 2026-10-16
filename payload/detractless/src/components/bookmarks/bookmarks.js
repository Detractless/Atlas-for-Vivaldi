import './bookmarks.css';
import { BookmarkDB } from '../../services/bookmarksDB.js';
// ContextMenu is imported only for its `disabled` flag now (R-012): this screen
// no longer opens a menu, but the flag still gates whether right-click does
// anything at all, so the setting behind it keeps meaning something.
import { ContextMenu } from '../contextMenu/contextMenu.js';
import { openGroupDialog, openBookmarkItemDialog } from './bookmarkDialog.js';
import {
  currentBookmarkPage,
  bookmarks, setBookmarks,
  activeTabs
} from '../../pages/newtab/newtabState.js';
/* addBookmark takes resolved values from whatever collected them (today the
   add popup), so the writer never depends on the widget. */
import { attachScrollAffordance } from '../shared/scrollAffordance.js';
import { editInBar } from '../shared/editInBar.js';
import { refreshBookmarkCache } from './bookmarkCache.js';
import { forActiveAccount } from '../../services/googleAccount.js';

export { refreshBookmarkCache } from './bookmarkCache.js';
export { renderBookmarkSearchResults, updateSearchDropdownSelection, hideBookmarkSearchResults, sortByUsage } from './bookmarkSearch.js';

/* ── Read failure is not emptiness (R-020) ───────────────────────────────
   An unreadable database and an empty one used to render identically: the
   catch here did setBookmarks({}) and drew the "No bookmarks yet" state. That
   matters because this extension's IndexedDB is the ONLY copy of a user's
   bookmarks, and Chrome may clear it under disk pressure, so the one moment
   the user most needs to be told something went wrong was the one moment the
   UI confidently said nothing had.

   It was also a latent destroyer. Module state became {} on a failed read, and
   saveBookmarks writes module state, so any later save would have persisted
   that emptiness over data that was merely unreadable at the time.

   Two rules, and they are the whole fix:
     1. A failed read NEVER becomes module state.
     2. While the last read is known-failed, saving is refused.
   Which page failed is tracked, not just THAT one did, so switching to a page
   that reads fine clears the block instead of stranding the whole screen. */
let _loadFailedPage = null;

const loadFailed = () => _loadFailedPage !== null && _loadFailedPage === currentBookmarkPage;

export function initializeBookmarks() { loadBookmarks(); }

export async function loadBookmarks() {
  try {
    const savedBookmarks = await BookmarkDB.getBookmarks(currentBookmarkPage);
    if (_loadFailedPage === currentBookmarkPage) _loadFailedPage = null;
    setBookmarks((savedBookmarks && Object.keys(savedBookmarks).length > 0) ? savedBookmarks : {});
  } catch (error) {
    /* Deliberately NOT setBookmarks({}). Leaving the previous value alone keeps
       rule 1: nothing derived from a failed read reaches state that a save
       could write back. renderBookmarks reads the flag first, so what is left
       in `bookmarks` is never what gets drawn. */
    _loadFailedPage = currentBookmarkPage;
    console.error('Detractless: could not read bookmarks for page', currentBookmarkPage, error);
  }
  renderBookmarks();
}

export async function saveBookmarks() {
  if (loadFailed()) {
    // Rule 2. Writing here would turn a page we merely could not READ into a
    // page that is genuinely empty on disk.
    console.error('Detractless: refusing to save, the last read of page',
      currentBookmarkPage, 'failed. Reload before changing anything.');
    return;
  }
  try {
    await BookmarkDB.saveBookmarks(currentBookmarkPage, bookmarks);
    await refreshBookmarkCache();
  } catch (error) {
    console.error('Error saving bookmarks:', error);
  }
}

// ── Well geometry (R-008) ────────────────────────────────────────────────
// A list must be a whole number of rows tall. At any other height the last row
// is cut part way through, and the fade then paints over a row the user can
// still see. Measurements come from the --bm-* tokens at the top of
// bookmarks.css so this file and that one cannot disagree about what a row is.
// `chrome` is what a group needs outside its list: the name line and the gap under it.
// 0 is a real value here (no row gap, no padding), so only a missing token falls back.
function rowMetrics(host) {
  const cs = getComputedStyle(host);
  const num = (name, fallback) => { const v = parseFloat(cs.getPropertyValue(name)); return Number.isFinite(v) ? v : fallback; };
  return {
    pitch: num('--bm-row-pitch', 36), gap: num('--bm-row-gap', 0), pad: num('--bm-well-padding', 0),
    chrome: num('--bm-title-height', 24) + num('--bm-title-gap', 8), groupGap: num('--bm-group-gap', 32),
  };
}
// Height of a well showing exactly `rows` rows. The last row has no gap under
// it, hence the single subtraction.
function wellHeight(rows, m) { return rows * m.pitch - m.gap + m.pad * 2; }
// How many WHOLE rows fit in `px` of well. Always at least one.
function rowsThatFit(px, m) { return Math.max(1, Math.floor((px - m.pad * 2 + m.gap) / m.pitch)); }

export function renderBookmarks() {
  const container = document.getElementById("bookmarks-content"); if (!container) return; container.innerHTML = ""; const groups = Object.keys(bookmarks);
  /* R-020: checked BEFORE the empty state, and before `groups` is trusted, so a
     page that could not be read can never be drawn as a page with nothing on
     it. Built from the empty-state classes rather than new ones: this is the
     same slot on the same screen saying a different thing, and it needs no
     rule the stylesheet does not already have. */
  if (loadFailed()) { renderLoadError(container); return; }
  if (groups.length === 0) { renderEmptyPage(container); return; }
  const columnsCount = Math.ceil(groups.length / Math.ceil(groups.length / 3)); const groupsPerColumn = Math.ceil(groups.length / columnsCount);
  const allFadeChecks = [];
  const metrics = rowMetrics(container);
  for (let i = 0; i < columnsCount; i++) {
    const startIndex = i * groupsPerColumn; const endIndex = Math.min(startIndex + groupsPerColumn, groups.length);
    container.appendChild(renderColumn(groups.slice(startIndex, endIndex), metrics, allFadeChecks));
  }
  requestAnimationFrame(() => allFadeChecks.forEach(fn => fn()));
}

function renderLoadError(container) {
  container.innerHTML = `<div class="empty-bookmarks-message">
      <div class="empty-state-icon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="32" height="32"><path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.24 3.957a2 2 0 0 1 3.52 0l8.03 14.06A2 2 0 0 1 20.06 21H3.94a2 2 0 0 1-1.73-2.983z"/></svg></div>
      <p class="empty-state-title">Could not read your bookmarks</p>
      <p class="empty-state-hint">They have not been changed. This page is not
        showing them because the database did not answer, so nothing will be
        saved over them until it does.</p>
      <button class="save-btn" id="bookmarks-retry" type="button">Try again</button>
    </div>`;
  container.querySelector('#bookmarks-retry')?.addEventListener('click', loadBookmarks);
}

function renderEmptyPage(container) {
  container.innerHTML = `<div class="empty-bookmarks-message">
      <div class="empty-state-icon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="32" height="32"><path d="M17 3a2 2 0 0 1 2 2v15a1 1 0 0 1-1.496.868l-4.512-2.578a2 2 0 0 0-1.984 0l-4.512 2.578A1 1 0 0 1 5 20V5a2 2 0 0 1 2-2z"/></svg></div>
      <p class="empty-state-title">No bookmarks yet</p>
      <p class="empty-state-hint">Click <strong>+ Add</strong> to add your first bookmark to this page.</p>
    </div>`;
}

/** One column of groups. Each group's fade refresh is pushed onto fadeChecks. */
function renderColumn(columnGroups, metrics, fadeChecks) {
  const columnDiv = document.createElement("div"); columnDiv.className = "bookmark-column";
  const _n = columnGroups.length;
  const _avail = window.innerHeight - 160;
  // Chrome each group needs outside its list: the name line and the gap under
  // it (metrics.chrome). Groups in a column are separated by metrics.groupGap.
  const perWell = Math.min(480, Math.max(48, Math.floor((_avail - _n * metrics.chrome - (_n - 1) * metrics.groupGap) / _n)));
  // Whole rows the allotted space can hold. Rounding DOWN is the rule, so a
  // group never claims more room than the column budgeted for it.
  const capacity = rowsThatFit(perWell, metrics);
  columnGroups.forEach((groupName) => {
    const { groupDiv, refresh } = renderGroup(groupName, capacity, metrics);
    fadeChecks.push(refresh);
    columnDiv.appendChild(groupDiv);
  });
  return columnDiv;
}

function renderGroup(groupName, capacity, metrics) {
  const groupDiv = document.createElement("div"); groupDiv.className = "bookmark-group";
  const titleDiv = document.createElement("div"); titleDiv.className = "group-title";
  const rowBookmarks = new Map();
  groupDiv.addEventListener("contextmenu", (e) => onGroupContextMenu(e, groupName, rowBookmarks));
  const titleText = document.createElement("span"); titleText.textContent = groupName; titleDiv.appendChild(titleText);
  const wellDiv = document.createElement("div"); wellDiv.className = "bookmark-well";
  // A group made with Add group has nothing in it yet: its name, and a quiet line saying so. No list, so no scroll chrome.
  if (bookmarks[groupName].length === 0) {
    const empty = document.createElement("div"); empty.className = "group-empty"; empty.textContent = "No bookmarks yet";
    wellDiv.appendChild(empty); groupDiv.appendChild(titleDiv); groupDiv.appendChild(wellDiv);
    return { groupDiv, refresh: () => {} };
  }
  const listDiv = document.createElement("ul"); listDiv.className = "bookmark-list";
  // Round down, with one exception: if rounding UP swallows the whole
  // group, take it. That is the only case where the extra row changes what
  // is shown (scroll chrome vs none at all) rather than just how much.
  const _total = bookmarks[groupName].length;
  const _rows = (_total === capacity + 1) ? _total : Math.min(capacity, _total);
  listDiv.style.maxHeight = wellHeight(_rows, metrics) + 'px';
  bookmarks[groupName].forEach((bookmark) => {
    const listItem = document.createElement("li"); const itemDiv = document.createElement("div"); itemDiv.className = "bookmark-link";
    // R-018: the row no longer listens; the card does, and finds its way
    // back here through this Map.
    rowBookmarks.set(itemDiv, bookmark);
    const link = document.createElement("a"); link.href = forActiveAccount(bookmark.url); link.target = "_self"; link.rel = "noopener noreferrer";
    // The active profile's Google account may change while the page is open; read it again just before opening.
    const refresh = () => { link.href = forActiveAccount(bookmark.url); };
    link.addEventListener("mousedown", refresh); link.addEventListener("focus", refresh);
    link.textContent = bookmark.name; link.style.flex = "1"; link.style.textDecoration = "none"; link.style.color = "inherit";
    itemDiv.appendChild(link); listItem.appendChild(itemDiv); listDiv.appendChild(listItem);
  });
  wellDiv.appendChild(listDiv);
  // Fade and counts are the shared control now (R-010). The well is passed
  // as the host because it already exists and is already positioned.
  const refresh = attachScrollAffordance(listDiv, { host: wellDiv }).refresh;
  groupDiv.appendChild(titleDiv); groupDiv.appendChild(wellDiv);
  return { groupDiv, refresh };
}

/* R-018: ONE listener, on the whole card, replacing two that sat on the
   title strip and on each row and left everything between them falling
   through to Chrome's own menu. .group-title is line-height:1 at 10px, so
   the group menu had been reachable only from a ~10px strip.

   R-019 then split the card in two, which is the rule you can actually
   SEE: the WELL is the bookmarks, the CARD CHROME is the group.
     row            -> that bookmark's dialog
     anywhere else in the well -> NOTHING
     the name line, the gap under it -> the group's dialog
   (The card is gone: the name line, which runs the width of the column, is
   now the whole of the group's chrome.)
   The dead middle is deliberate. The row gaps are 2px, so treating them
   as the group turned a one pixel miss while aiming at a bookmark into
   the wrong dialog. Nothing happens there instead of Chrome's menu
   appearing, because a native menu in a 2px sliver is the same arbitrary
   feeling R-018 set out to remove. The scroll fade and count pills are
   inside the well, so they fall on the quiet side too. */
function onGroupContextMenu(e, groupName, rowBookmarks) {
  e.preventDefault();
  // ContextMenu.disabled is still honoured so the flag keeps meaning what
  // it meant, even though nothing currently sets it (R-012).
  if (ContextMenu.disabled) return;
  /* A Map rather than a data-index: renderBookmarks rebuilds these nodes
     on every mutation, so the Map is never stale, and there is no number
     to parse or bounds-check. */
  const row = e.target.closest?.('.bookmark-link');
  const bookmark = row && rowBookmarks.get(row);
  /* The address bar opens for it (editInBar.js); the pop-up below is what runs when nothing answers. */
  if (bookmark) {
    editInBar({ kind: 'bookmark', page: currentBookmarkPage, group: groupName, name: bookmark.name, url: bookmark.url },
      () => openBookmarkMenu(groupName, bookmark));
    return;
  }
  // Tested AFTER the row, since every row is itself inside the well.
  if (e.target.closest?.('.bookmark-well')) return;
  editInBar({ kind: 'group', page: currentBookmarkPage, group: groupName, count: bookmarks[groupName].length },
    () => openGroupMenu(groupName));
}

/* ── Right-click dialogs (R-012, hit area widened in R-018) ──────────────
   Lifted out of renderBookmarks when the two listeners became one. They were
   already closures over nothing but groupName and bookmark, so as functions
   they read the same and the render loop stops carrying 60 lines of dialog
   spec per group. */

function openGroupMenu(groupName) {
  const pages = activeTabs
    .filter(t => t.type !== 'search' && t.id !== currentBookmarkPage)
    .map(t => ({ label: t.label, value: t.id }));
  openGroupDialog({
    name: groupName,
    count: bookmarks[groupName].length,
    pages,
    onRename: (raw) => {
      const newName = raw.trim().toUpperCase();
      if (!newName) return 'Give the group a name.';
      if (newName === groupName) return true;
      // This used to return early and silently, so a colliding rename looked
      // like the menu had simply failed. Now it says so.
      if (bookmarks[newName]) return 'A group called that already exists.';
      const newBookmarks = {};
      Object.keys(bookmarks).forEach(key => {
        if (key === groupName) newBookmarks[newName] = bookmarks[key];
        else newBookmarks[key] = bookmarks[key];
      });
      setBookmarks(newBookmarks); saveBookmarks(); renderBookmarks();
      return true;
    },
    onMove: (targetPage) => moveGroupToPage(groupName, targetPage),
    onDelete: () => { delete bookmarks[groupName]; saveBookmarks(); renderBookmarks(); },
  });
}

function openBookmarkMenu(groupName, bookmark) {
  // Re-found on every save rather than captured: a rename changes the very
  // fields this index is matched on, so a stale index would edit the wrong
  // bookmark after two edits in one sitting.
  const indexOf = () => bookmarks[groupName]
    .findIndex(b => b.name === bookmark.name && b.url === bookmark.url);
  openBookmarkItemDialog({
    name: bookmark.name,
    url: bookmark.url,
    onRename: (raw) => {
      const newName = raw.trim();
      if (!newName) return 'Give the bookmark a name.';
      const idx = indexOf();
      if (idx === -1) return true;
      bookmarks[groupName][idx].name = newName;
      bookmark.name = newName;
      saveBookmarks(); renderBookmarks();
      return true;
    },
    onEditUrl: (raw) => {
      const value = raw.trim();
      if (!value) return 'Give the bookmark a URL.';
      const idx = indexOf();
      if (idx === -1) return true;
      const finalUrl = value.match(/^https?:\/\//) ? value : 'https://' + value;
      bookmarks[groupName][idx].url = finalUrl;
      bookmark.url = finalUrl;
      saveBookmarks(); renderBookmarks();
      return true;
    },
    onDelete: () => {
      bookmarks[groupName] = bookmarks[groupName].filter(b => b.name !== bookmark.name || b.url !== bookmark.url);
      if (bookmarks[groupName].length === 0) delete bookmarks[groupName];
      saveBookmarks(); renderBookmarks();
    },
  });
}

/* R-015: the three alert() calls here are gone. R-021 moved validation again,
   out of this file entirely: each of the four dialogs validates its own answer
   as it is given and reports on that dialog's error line, and resolveFlow
   re-checks all four before the write. So there is nothing left to validate
   here beyond the guard below. */
/**
 * Write one bookmark. Takes RESOLVED values from the add flow rather than
 * reading a form: the flow owns its own state now (utils/addBookmarkFlow.js) and
 * this no longer has to know which widget held what.
 *
 * @param {{name: string, url: string, group: string, page: any}} form
 */
export async function addBookmark(form) {
  if (!form || form.error) return;

  const { name, group: targetGroup, page: targetPage } = form;
  const finalUrl = form.url.match(/^https?:\/\//) ? form.url : "https://" + form.url;

  try {
    const targetBookmarks = await BookmarkDB.getBookmarks(targetPage) || {};
    if (!targetBookmarks[targetGroup]) targetBookmarks[targetGroup] = [];
    targetBookmarks[targetGroup].push({ name, url: finalUrl });
    await BookmarkDB.saveBookmarks(targetPage, targetBookmarks);
    await refreshBookmarkCache();
    if (targetPage === currentBookmarkPage) {
      /* R-020: safe to clear the block. This path did its OWN fresh read of the
         target page a few lines up and would have thrown if that failed, so
         targetBookmarks is known-good data rather than anything inherited from
         the read that failed. */
      if (_loadFailedPage === currentBookmarkPage) _loadFailedPage = null;
      setBookmarks(targetBookmarks); renderBookmarks();
    }
    /* No modal to hide and no form to clear: the flow's last dialog closed
       itself when its save returned, and the flow state is discarded by the
       caller. */
  } catch (error) {
    console.error('[Detractless] could not save the bookmark', error);
  }
}

/* R-017: findGroupPage stood here, resolving a group name to a page through
   groupPageMap. It was already dead (nothing called it after the add form
   started returning a resolved page), and the map it read is gone: choosing the
   page first means a group never has to imply one. The map was also unsound,
   since two pages may hold a group of the same name and it kept whichever was
   swept last. */

export function renameGroup(oldName) {
  const newName = prompt("Enter new group name:", oldName);
  if (newName && newName.trim() && newName.toUpperCase() !== oldName) {
    const upperNewName = newName.trim().toUpperCase(); if (bookmarks[upperNewName]) { alert("A group with this name already exists."); return; }
    const newBookmarks = {}; Object.keys(bookmarks).forEach(key => { if (key === oldName) newBookmarks[upperNewName] = bookmarks[key]; else newBookmarks[key] = bookmarks[key]; });
    setBookmarks(newBookmarks); saveBookmarks(); renderBookmarks();
  }
}

export function deleteGroup(groupName) { if (confirm(`Are you sure you want to delete the group "${groupName}" and all its bookmarks?`)) { delete bookmarks[groupName]; saveBookmarks(); renderBookmarks(); } }

export async function moveGroupToPage(groupName, targetPage) {
  if (targetPage === currentBookmarkPage) return; const groupData = bookmarks[groupName]; if (!groupData) return;
  delete bookmarks[groupName]; await saveBookmarks();
  try {
    const targetBookmarks = await BookmarkDB.getBookmarks(targetPage) || {}; targetBookmarks[groupName] = groupData;
    await BookmarkDB.saveBookmarks(targetPage, targetBookmarks);
    await refreshBookmarkCache();
    renderBookmarks();
  } catch (error) { alert('Error moving group.'); }
}

export function renameBookmark(groupName, bookmark) {
  const newName = prompt("Enter new name:", bookmark.name); if (newName === null || !newName.trim()) return;
  const bookmarkIndex = bookmarks[groupName].findIndex((b) => b.name === bookmark.name && b.url === bookmark.url);
  if (bookmarkIndex !== -1) { bookmarks[groupName][bookmarkIndex].name = newName.trim(); saveBookmarks(); renderBookmarks(); }
}

export function editBookmarkUrl(groupName, bookmark) {
  const newUrl = prompt("Enter new URL:", bookmark.url); if (newUrl === null || !newUrl.trim()) return;
  const bookmarkIndex = bookmarks[groupName].findIndex((b) => b.name === bookmark.name && b.url === bookmark.url);
  if (bookmarkIndex !== -1) { let finalUrl = newUrl.trim().match(/^https?:\/\//) ? newUrl.trim() : "https://" + newUrl.trim(); bookmarks[groupName][bookmarkIndex].url = finalUrl; saveBookmarks(); renderBookmarks(); }
}

export function deleteBookmark(groupName, bookmark) {
  if (confirm(`Are you sure you want to delete "${bookmark.name}"?`)) {
    bookmarks[groupName] = bookmarks[groupName].filter((b) => b.name !== bookmark.name || b.url !== bookmark.url); if (bookmarks[groupName].length === 0) delete bookmarks[groupName]; saveBookmarks(); renderBookmarks();
  }
}