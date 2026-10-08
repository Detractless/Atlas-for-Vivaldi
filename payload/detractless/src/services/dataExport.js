import { BookmarkDB } from './bookmarksDB.js';
import { DEFAULT_THEME } from '../constants/defaults.js';

// Atlas: the backup also carries every profile (list, settings, bookmark databases).
export async function generateExportData(activeTabsList) {
  const data = await generateExportDataCore(activeTabsList);
  if (window.AtlasProfiles) {
    try { data.atlasProfiles = await window.AtlasProfiles.exportAll(BookmarkDB); } catch (e) { console.error('[Atlas] profiles export failed', e); }
  }
  return data;
}

async function generateExportDataCore(activeTabsList) {
  const allBookmarks = await BookmarkDB.getAllBookmarks();

  const [syncData, localData] = await Promise.all([
    new Promise((resolve) => {
      window.chrome.storage.sync.get([
        "tabLimit",
        "managementMethod",
        "searchDelaySeconds",
        "showQueryOnDelay",
        "grayscale",
        "customSearchEngines",
        "defaultEngineKey",
        "selectedSearchEngine",
        "fadeInEnabled",
        "spotlightVisible",
        "searchEngineBehavior",
        "bookmarkPillBehavior",
        "Theme"
      ], (items) => resolve(items || {}));
    }),
    // Only `rhe_rules` is read from local storage. A leftover `githubSync` key
    // may still exist from before sync was removed; it held a GitHub token, so
    // it must never be copied into config.json, which goes into export files.
    new Promise((resolve) => {
      window.chrome.storage.local.get(["rhe_rules"], (items) => resolve(items || {}));
    })
  ]);

  const customEngineIcons = {};
  if (syncData.customSearchEngines) {
    const keys = Object.keys(syncData.customSearchEngines);
    await Promise.all(keys.map(async (key) => {
      const engine = syncData.customSearchEngines[key];
      if (engine.isCustomIcon) {
        try {
          const iconData = await BookmarkDB.getIcon(key);
          if (iconData) customEngineIcons[key] = iconData;
        } catch (e) {
          console.error("Failed to export icon for", key, e);
        }
      }
    }));
  }

  return {
    ...allBookmarks,
    activeTabs: activeTabsList,

    Theme: syncData.Theme || DEFAULT_THEME,

    tabLimit: syncData.tabLimit,
    managementMethod: syncData.managementMethod,
    searchDelaySeconds: syncData.searchDelaySeconds,
    showQueryOnDelay: syncData.showQueryOnDelay,
    grayscale: syncData.grayscale,
    customSearchEngines: syncData.customSearchEngines,
    customEngineIcons: customEngineIcons,
    defaultEngineKey: syncData.defaultEngineKey,
    selectedSearchEngine: syncData.selectedSearchEngine,

    fadeInEnabled: syncData.fadeInEnabled,
    spotlightVisible: syncData.spotlightVisible,
    searchEngineBehavior: syncData.searchEngineBehavior,
    bookmarkPillBehavior: syncData.bookmarkPillBehavior,

    rhe_rules: localData.rhe_rules
  };
}
