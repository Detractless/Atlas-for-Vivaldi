import '../../styles/tokens.css';
import '../../styles/themes.css';
import '../../styles/base.css';
import '../../styles/components.css';
import './newtab.css';
import { BookmarkDB } from '../../services/bookmarksDB.js';
import { ContextMenu } from '../../components/contextMenu/contextMenu.js';
import { refreshBookmarkCache, initializeBookmarks, loadBookmarks } from '../../components/bookmarks/bookmarks.js';
import { initBookmarkAddModal } from '../../components/bookmarks/bookmarkModal.js';
import { initializeTheme, initThemePicker } from './theme.js';
import { initializeFadeIn, initializeSpotlightVisibility, initializeScale, showPage } from './displayEffects.js';
import { initializeTabs, setTabNavigationCallbacks, renderTabs, selectSearchTab } from '../../components/tabs/tabs.js';
import { showModal, hideModal } from './modalVisibility.js';
import { initializeTabLimiter } from '../../components/tabLimiter/tabLimiterUI.js';
import { initializeSearchDelaySettings } from '../../components/searchDelay/searchDelay.js';
import { loadSearchEngines, loadSavedEngine, setManageEnginesCallback, renderEngineDropdown, updateCurrentEngine } from '../../components/engines/enginesUI.js';
import { initEngineModal } from '../../components/engines/engineModal.js';
import { initializeSearch } from '../../components/search/search.js';
import { initSettingsModal } from './settingsModal.js';
import { setImportCompleteCallback } from './importExport.js';
import { seedStarterContent } from '../../services/starterContent.js';
import { applyFadeIn, applySpotlightVisibility } from './displayEffects.js';
import { applyThemeConfig } from './theme.js';
import { runOrphanRepairOnce } from '../../services/orphanCleanup.js';
import {
  spotlightVisible, setCurrentBookmarkPage, activeTabs,
  appThemeConfig, currentEngine, searchEngineBehavior, bookmarkPillBehavior, setBookmarkPillBehavior
} from './newtabState.js';
// Styles for the full-page Settings UI (settingsPage.js loads outside the bundle).
// Imported last so these rules land at the end of newtab.bundle.css.
import './settingsPage.css';

/* R-015: initOptionsModal stood here, wiring the two tiles of the separate
   "What would you like to add?" modal. Both destinations are rows on the Add
   card's home list now, and initBookmarkAddModal owns them, so the chooser has
   no markup and no init of its own left. */

document.addEventListener("DOMContentLoaded", async () => {
  await loadBookmarkData();
  ContextMenu.init();
  const versionEl = document.getElementById('version-trigger');
  if (versionEl) versionEl.textContent = 'v' + chrome.runtime.getManifest().version;
  initializeTheme(); initializeFadeIn(); initializeSpotlightVisibility(); initializeScale();
  window.chrome.storage.sync.get(["bookmarkPillBehavior"], (res) => {
    if (res && res.bookmarkPillBehavior) setBookmarkPillBehavior(res.bookmarkPillBehavior);
  });
  await initializeTabs();

  /* REPAIR for profiles that already carry orphaned pages, from imports made
     before the sweep in dataImport.js existed. It runs HERE, after
     initializeTabs, because it needs a loaded tab list to decide what is
     orphaned; running it any earlier would read an empty list, which the guard
     inside treats as "delete nothing" and would silently never repair anything.
     Flag-gated, so a profile is swept once rather than on every new tab. */
  const removedPages = await runOrphanRepairOnce(activeTabs);
  if (removedPages.length > 0) await refreshBookmarkCache();

  wireCallbacks();
  initFeatures();
  const checkSettingsHash = wireSettingsOpeners();

  document.querySelectorAll(".modal").forEach(modal => modal.addEventListener("click", e => e.stopPropagation()));

  await loadSearchEngines(); initializeSearch(); loadSavedEngine();

  showPage("search");
  const isSettingsTarget = location.hash === '#settings' || location.search.includes('settings');
  const searchInput = document.getElementById("search-input");
  if (searchInput && spotlightVisible && !isSettingsTarget) setTimeout(() => searchInput.focus(), 100);
  if (isSettingsTarget) setTimeout(checkSettingsHash, 50);

});

/** Open the bookmarks database, run its migrations, and seed a first-run profile. */
async function loadBookmarkData() {
  await BookmarkDB.init(); await BookmarkDB.migrateFromChromeStorage();
  await BookmarkDB.migrateBookmarksToRecords(); // Phase 12, non-destructive
  await refreshBookmarkCache();
  const didSeed = await seedStarterContent();
  if (didSeed) await refreshBookmarkCache();
}

function wireCallbacks() {
  setTabNavigationCallbacks({
    onTabClick: (tab) => {
      if (tab.type === "search") { showPage("search"); }
      else { setCurrentBookmarkPage(tab.id); showPage("bookmarks"); loadBookmarks(); }
    },
    onNavigateToSearch: () => showPage("search")
  });
  setManageEnginesCallback(() => showModal('engine-modal'));
  setImportCompleteCallback(onImportComplete);
}

/** After a backup is restored: redraw everything the import may have changed. */
async function onImportComplete(importData) {
  renderTabs();
  loadBookmarks();
  if (importData.fadeInEnabled !== undefined) applyFadeIn();
  if (importData.spotlightVisible !== undefined) applySpotlightVisibility();
  if (importData.Theme) applyThemeConfig(appThemeConfig);
  if (importData.searchEngineBehavior !== undefined) {
    const behaviorRadios = document.querySelectorAll('input[name="search-behavior"]');
    behaviorRadios.forEach(radio => { if (radio.value === searchEngineBehavior) radio.checked = true; });
  }
  if (importData.bookmarkPillBehavior !== undefined) {
    const pillRadios = document.querySelectorAll('input[name="bookmark-pill-behavior"]');
    pillRadios.forEach(radio => { if (radio.value === bookmarkPillBehavior) radio.checked = true; });
  }
  if (importData.selectedSearchEngine) updateCurrentEngine(currentEngine);
  renderEngineDropdown();
}

function initFeatures() {
  initializeBookmarks();
  initBookmarkAddModal();
  initEngineModal();
  initSettingsModal();
  initializeTabLimiter();
  initThemePicker();
  initializeSearchDelaySettings();

  const globalSettingsBtn = document.getElementById('global-settings-btn');
  /* R-016: the + disc opens the anchored Add menu, and initBookmarkAddModal
     wires it. Nothing here binds it any more. */
  if (globalSettingsBtn) globalSettingsBtn.addEventListener('click', () => showModal('settings-modal'));
}

/** Settings opens from #settings / ?settings and from an "open-settings" message. */
function wireSettingsOpeners() {
  const checkSettingsHash = () => {
    if (location.hash === '#settings' || location.search.includes('settings')) {
      showModal('settings-modal');
    }
  };
  checkSettingsHash();
  setTimeout(checkSettingsHash, 100);
  window.addEventListener('hashchange', checkSettingsHash);
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (msg && msg.atlas && msg.atlas.act === 'open-settings') {
        showModal('settings-modal');
        if (sendResponse) sendResponse({ ok: true });
      }
    });
  }
  return checkSettingsHash;
}

window.addEventListener("pageshow", () => {
  // R-013: the page nav owns its own selection now, so returning to Home is a
  // call rather than a poke at a hidden radio that no longer exists.
  selectSearchTab();
  showPage("search");
  const isSettingsTarget = location.hash === '#settings' || location.search.includes('settings');
  const searchInput = document.getElementById("search-input");
  if (isSettingsTarget) {
    checkSettingsHash();
  } else if (searchInput && spotlightVisible) {
    setTimeout(() => searchInput.focus(), 100);
  }

});