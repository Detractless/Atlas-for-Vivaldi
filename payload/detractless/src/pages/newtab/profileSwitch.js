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
