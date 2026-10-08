import { BookmarkDB } from './bookmarksDB.js';
import { DEFAULT_THEME } from '../constants/defaults.js';
import { BACKUP_SYNC_KEYS } from '../constants/storageKeys.js';
import { storageGet } from './storage.js';

// Every chrome.storage.sync key a backup carries (atlasKeys.json "backup": true),
// except activeTabs, which comes from memory so unsaved page edits are included.
const EXPORTED_SYNC_KEYS = BACKUP_SYNC_KEYS.map((k) => k.key).filter((k) => k !== 'activeTabs');

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
      storageGet('sync', EXPORTED_SYNC_KEYS).then((items) => resolve(items || {}));
    }),
    // Only `rhe_rules` is read from local storage. A leftover `githubSync` key
    // may still exist from before sync was removed; it held a GitHub token, so
    // it must never be copied into config.json, which goes into export files.
    new Promise((resolve) => {
      storageGet('local', ["rhe_rules"]).then((items) => resolve(items || {}));
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

  const settings = {};
  for (const key of EXPORTED_SYNC_KEYS) settings[key] = syncData[key];
  return {
    ...allBookmarks,
    ...settings,
    activeTabs: activeTabsList,
    Theme: syncData.Theme || DEFAULT_THEME,
    customEngineIcons: customEngineIcons,
    rhe_rules: localData.rhe_rules
  };

}
