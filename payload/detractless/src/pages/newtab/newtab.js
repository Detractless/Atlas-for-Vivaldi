import '../../styles/tokens.css';
import '../../styles/themes.css';
import '../../styles/base.css';
import '../../styles/components.css';
import './newtab.css';
import { ContextMenu } from '../../components/contextMenu/contextMenu.js';
import { refreshBookmarkCache, initializeBookmarks, loadBookmarks } from '../../components/bookmarks/bookmarks.js';
import { initAddPopup } from '../../components/addPopup/addPopup.js';
import { watchSystemTheme } from './theme.js';
import { showPage } from './displayEffects.js';
import { initializeTabs, setTabNavigationCallbacks, renderTabs, selectSearchTab } from '../../components/tabs/tabs.js';
import { showModal } from './modalVisibility.js';
// The tab limiter's stylesheet; imported here so the CSS keeps its place in the bundle.
import '../../components/tabLimiter/tabLimiterUI.js';
import { loadSearchEngines, loadSavedEngine, setManageEnginesCallback, renderEngineDropdown, updateCurrentEngine, followEnginePicks } from '../../components/engines/enginesUI.js';
import { initEngineModal } from '../../components/engines/engineModal.js';
import { initializeSearch } from '../../components/search/search.js';
import { setImportCompleteCallback } from './importExport.js';
import { runOrphanRepairOnce } from '../../services/orphanCleanup.js';
import { spotlightVisible, setCurrentBookmarkPage, activeTabs, currentEngine } from './newtabState.js';
import { loadBookmarkData } from './bookmarkData.js';
import { installProfileSwitch } from './profileSwitch.js';
import { defineAllSettings } from '../../settings/definitions.js';
import { loadSettings, watchSettings } from '../../settings/registry.js';
import { installSettingsPage, openSettings } from '../../settings/shell.js';
// Styles for the full-page Settings UI. Imported last so these rules land at the
// end of newtab.bundle.css.
import './settingsPage.css';

/* R-015: initOptionsModal stood here, wiring the two tiles of the separate
   "What would you like to add?" modal. Both destinations are rows on the Add
   card's home list now, and initBookmarkAddModal owns them, so the chooser has
   no markup and no init of its own left. */

// Settings is built now, not at DOMContentLoaded: profilesPage.js runs right after
// this bundle and registers its page through window.AtlasSettingsUI.
defineAllSettings();
installSettingsPage();

document.addEventListener("DOMContentLoaded", async () => {
  await loadBookmarkData();
  ContextMenu.init();
  await loadSettings();
  watchSettings();
  watchSystemTheme();
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
  installProfileSwitch();
  wireSettingsOpeners();

  document.querySelectorAll(".modal").forEach(modal => modal.addEventListener("click", e => e.stopPropagation()));

  await loadSearchEngines(); initializeSearch(); loadSavedEngine(); followEnginePicks();

  showPage("search");
  const searchInput = document.getElementById("search-input");
  // ?engines (the address bar's "Engine lists") opens the engine list.
  if (new URLSearchParams(location.search).has('engines')) showModal('engine-modal');
  else if (searchInput && spotlightVisible && !isSettingsUrl()) setTimeout(() => searchInput.focus(), 100);
});

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
  await loadSettings();
  if (importData.selectedSearchEngine) updateCurrentEngine(currentEngine);
  renderEngineDropdown();
}

function initFeatures() {
  initializeBookmarks();
  initAddPopup();
  initEngineModal();

  const globalSettingsBtn = document.getElementById('global-settings-btn');
  /* The + button opens the add popup; initAddPopup wires it. */
  if (globalSettingsBtn) globalSettingsBtn.addEventListener('click', () => openSettings());
}

/** #settings or ?settings[=<page>] in the address opens Settings (on that page). */
function isSettingsUrl() {
  return location.hash === '#settings' || location.search.includes('settings');
}

function openSettingsFromUrl() {
  if (isSettingsUrl()) openSettings(new URLSearchParams(location.search).get('settings') || undefined);
}

/** Settings opens from the address and from an "open-settings" message. */
function wireSettingsOpeners() {
  openSettingsFromUrl();
  window.addEventListener('hashchange', openSettingsFromUrl);
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (msg && msg.atlas && msg.atlas.act === 'open-settings') {
        openSettings(msg.atlas.page);
        if (sendResponse) sendResponse({ ok: true });
      }
    });
  }
}

window.addEventListener("pageshow", () => {
  // R-013: the page nav owns its own selection now, so returning to Home is a
  // call rather than a poke at a hidden radio that no longer exists.
  selectSearchTab();
  showPage("search");
  const searchInput = document.getElementById("search-input");
  // Was a call to a function that only existed inside the DOMContentLoaded
  // handler, so restoring a cached tab with ?settings threw a ReferenceError.
  if (isSettingsUrl()) {
    openSettingsFromUrl();
  } else if (searchInput && spotlightVisible) {
    setTimeout(() => searchInput.focus(), 100);
  }
});
