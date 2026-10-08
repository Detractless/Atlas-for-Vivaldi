// src/constants/storageKeys.js — typed access to constants/atlasKeys.json, the one
// list of storage keys, databases and ids. Plain scripts that cannot import it
// (preinit.js, themePreinit.js, profilesCore.js) keep copies that
// tests/unit/storage_keys.test.js holds to this file.
import KEYS from './atlasKeys.json';

export const EXTENSION_ID = KEYS.extensionId;
export const BOOKMARKS_DB = KEYS.databases.bookmarks;
export const PASTEKIT_DB = KEYS.databases.pastekit;

/** A fresh copy of a chrome.storage.sync key's default value. */
export function syncDefault(key) {
  const entry = KEYS.sync[key];
  if (!entry) throw new Error(`Unknown sync key: ${key}`);
  return entry.default === undefined ? undefined : JSON.parse(JSON.stringify(entry.default));
}

/** The chrome.storage.sync keys a backup carries, with how an import restores each. */
export const BACKUP_SYNC_KEYS = Object.keys(KEYS.sync)
  .filter((k) => KEYS.sync[k].backup)
  .map((k) => ({ key: k, importWhen: KEYS.sync[k].importWhen || 'defined' }));
