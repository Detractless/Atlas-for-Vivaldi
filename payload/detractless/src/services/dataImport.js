import { BookmarkDB } from './bookmarksDB.js';
import { pruneOrphanedPages } from './orphanCleanup.js';

// Atlas: restore the backup's profiles first, then the usual import fills the active one.
export async function persistImportData(importData) {
  const ap = window.AtlasProfiles;
  if (!(ap && importData && importData.atlasProfiles)) return persistImportDataCore(importData);
  ap.holdReload(true);
  try {
    await ap.importAll(BookmarkDB, importData.atlasProfiles);
    await persistImportDataCore(importData);
  } finally {
    ap.holdReload(false);
  }
}

async function persistImportDataCore(importData) {
  await BookmarkDB.importAllBookmarks(importData);

  /* PREVENTION for the phantom-pill bug. importAllBookmarks only WRITES the
     archive's pages; anything already in the database stays. Since the archive's
     activeTabs replaces the current one further down, every page not named by it
     becomes unreachable through the UI while remaining visible in the pill list.
     Sweeping here, before activeTabs is written, keeps the two in step.

     Guarded inside pruneOrphanedPages: an archive with no activeTabs sweeps
     nothing rather than everything. */
  if (Array.isArray(importData.activeTabs) && importData.activeTabs.length > 0) {
    await pruneOrphanedPages(importData.activeTabs);
  }

  if (importData.customEngineIcons) {
    const keys = Object.keys(importData.customEngineIcons);
    await Promise.all(keys.map(async (key) => {
      await BookmarkDB.saveIcon(key, importData.customEngineIcons[key]);
    }));
  }

  const storageData = await settingsFromImport(importData);
  const safeStorageData = sanitizeHugeStrings(storageData);
  await new Promise((resolve) => window.chrome.storage.sync.set(safeStorageData, resolve));
  if (importData.rhe_rules) {
    const safeRules = sanitizeHugeStrings(importData.rhe_rules);
    await new Promise((resolve) => window.chrome.storage.local.set({ rhe_rules: safeRules }, resolve));
  }

  // githubSync is intentionally ignored, even when present. Archives exported
  // before the token was removed from generateExportData() still carry it, and
  // importing one must never overwrite this device's own sync config — or its
  // token — with whoever built the archive.
}

/** The chrome.storage.sync values an import restores (big images go to IndexedDB). */
async function settingsFromImport(importData) {
  const storageData = {};
  if (importData.fadeInEnabled !== undefined) storageData.fadeInEnabled = importData.fadeInEnabled;
  if (importData.spotlightVisible !== undefined) storageData.spotlightVisible = importData.spotlightVisible;
  if (importData.searchEngineBehavior !== undefined) storageData.searchEngineBehavior = importData.searchEngineBehavior;
  if (importData.bookmarkPillBehavior !== undefined) storageData.bookmarkPillBehavior = importData.bookmarkPillBehavior;
  if (importData.activeTabs) storageData.activeTabs = importData.activeTabs;
  if (importData.customSearchEngines) {
    storageData.customSearchEngines = importData.customSearchEngines;
    await moveEngineIconsToDb(storageData.customSearchEngines);
  }
  if (importData.defaultEngineKey) storageData.defaultEngineKey = importData.defaultEngineKey;
  if (importData.selectedSearchEngine) storageData.selectedSearchEngine = importData.selectedSearchEngine;
  if (importData.tabLimit !== undefined) storageData.tabLimit = importData.tabLimit;
  if (importData.managementMethod) storageData.managementMethod = importData.managementMethod;
  if (importData.searchDelaySeconds !== undefined) storageData.searchDelaySeconds = importData.searchDelaySeconds;
  if (importData.showQueryOnDelay !== undefined) storageData.showQueryOnDelay = importData.showQueryOnDelay;
  if (importData.grayscale !== undefined) storageData.grayscale = importData.grayscale;
  if (importData.Theme) storageData.Theme = await themeWithBackgroundInDb(importData.Theme);
  return storageData;
}

// Legacy backups stored base64 icons directly in the customSearchEngines object.
// Passing these to chrome.storage.sync causes massive IPC payloads that freeze
// the Vivaldi browser process. Migrate them to IndexedDB here.
async function moveEngineIconsToDb(engines) {
  for (const key of Object.keys(engines)) {
    const engine = engines[key];
    if (engine.icon && engine.icon.startsWith("data:")) {
      await BookmarkDB.saveIcon(key, engine.icon);
      engine.isCustomIcon = true;
      engine.icon = null;
    }
  }
}

/** A custom background image is too big for sync storage: keep it in IndexedDB. */
async function themeWithBackgroundInDb(theme) {
  if (typeof theme === "object" && theme !== null) {
    if (theme.customBg && typeof theme.customBg === "string" && theme.customBg.length > 1000) {
      try {
        await BookmarkDB.saveIcon("theme_custom_bg", theme.customBg);
        return { ...theme, customBg: "idb:theme_custom_bg" };
      } catch (_) {}
    }
  }
  return theme;
}

// Failsafe: Deep sanitize to prevent Chromium IPC freezes from any other massive strings
function sanitizeHugeStrings(obj) {
  if (typeof obj === 'string' && obj.length > 8192) return undefined;
  if (Array.isArray(obj)) return obj.map(sanitizeHugeStrings).filter(x => x !== undefined);
  if (typeof obj === 'object' && obj !== null) {
    const newObj = {};
    for (const k of Object.keys(obj)) {
      const val = sanitizeHugeStrings(obj[k]);
      if (val !== undefined) newObj[k] = val;
    }
    return newObj;
  }
  return obj;
}
