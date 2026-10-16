// Switching profile WITHOUT reloading the page. profilesCore.js calls this when
// the active profile changes (in this tab or any other). The live settings keys
// have already been swapped by then, and the registry applies those as they
// change; what is left is the bookmarks database (when profiles keep separate
// bookmarks), the page list, the engines and the open view.
import { BookmarkDB } from '../../services/bookmarksDB.js';
import { loadBookmarkData, closeBookmarkData } from './bookmarkData.js';
import { refreshBookmarkCache, loadBookmarks } from '../../components/bookmarks/bookmarks.js';
import { loadSettings } from '../../settings/registry.js';
import { initializeTabs, selectSearchTab } from '../../components/tabs/tabs.js';
import { loadSearchEngines, loadSavedEngine } from '../../components/engines/enginesUI.js';
import { showPage } from './displayEffects.js';
import { activeTabs, currentPage, currentBookmarkPage } from './newtabState.js';

export function installProfileSwitch() {
  const ap = window.AtlasProfiles;
  if (ap && ap.setSwitchHandler) ap.setSwitchHandler(applyProfileSwitch);
}

/** Bookmarks or pages were added or changed from the address bar (background/addFlow.js, editFlow.js): show them. */
export function installDataChanged() {
  try {
    chrome.runtime.onMessage.addListener((msg) => { if (msg && msg.atlas && msg.atlas.act === 'data-changed') refreshAfterOutsideAdd(); });
  } catch (e) { /* not an extension page: nothing to listen to */ }
}

async function refreshAfterOutsideAdd() {
  await refreshBookmarkCache();
  await initializeTabs();
  if (currentPage === 'bookmarks') {
    if (activeTabs.some((t) => String(t.id) === String(currentBookmarkPage))) loadBookmarks();
    else { selectSearchTab(); showPage('search'); }   // the page on screen was deleted from the address bar: back to Home
  }
  if (window.AtlasSettingsUI) window.AtlasSettingsUI.rerender();
}

export async function applyProfileSwitch() {
  const ap = window.AtlasProfiles;
  if (ap && BookmarkDB.dbName !== ap.dbName()) {
    closeBookmarkData();
    await loadBookmarkData();
  } else {
    await refreshBookmarkCache();
  }
  await loadSettings();
  await initializeTabs();
  if (currentPage === 'bookmarks') {
    if (activeTabs.some((t) => String(t.id) === String(currentBookmarkPage))) loadBookmarks();
    else { selectSearchTab(); showPage('search'); }
  }
  await loadSearchEngines();
  loadSavedEngine();
  if (window.AtlasSettingsUI) window.AtlasSettingsUI.rerender();
}
