// src/services/resetService.js — "Reset to Defaults".
//
// THIS FUNCTION MUST DESTROY EVERY STORE, NOT MOST OF THEM. It used to delete the
// bookmarks database and clear extension storage, and stop there. Two consequences,
// both bad and neither visible:
//
//   Snippets live in a SEPARATE database (`pastekit`), so they survived a reset
//   that claimed to restore factory defaults, including whatever sensitive values
//   were in them. So the fix is to delete the snippet database too, and to say so
//   in the confirmation copy.
//
// ORDERING IS LOAD-BEARING: every connection must be closed BEFORE its database is
// deleted. IndexedDB refuses to drop a database that anything still has open —
// `deleteDatabase` fires `onblocked` and never completes. Because we resolve on
// `onblocked` (so a reset can never hang), a missed close would look exactly like
// success and silently leave the data behind.
import { BookmarkDB } from './bookmarksDB.js';
import { closeDB as closePastekitDB } from '../pastekit/services/db.js';
import { PASTEKIT_DB } from '../constants/storageKeys.js';

/** Delete one database, resolving whatever happens — a reset must not hang. */
function deleteDatabase(name) {
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase(name);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}

export async function resetAllData() {
  // Bookmarks, and — since BookmarkDB v6 — notes and events, which share it.
  if (BookmarkDB.db) {
    BookmarkDB.db.close();
    BookmarkDB.db = null;
  }
  for (const name of window.AtlasProfiles ? window.AtlasProfiles.allDbNames() : [BookmarkDB.dbName]) {
    await deleteDatabase(name);
  }

  // Snippets. A separate database with its own memoised connection.
  await closePastekitDB();
  await deleteDatabase(PASTEKIT_DB);

  // Settings, plus anything left over from removed features (the sync config, the
  // encryption flag and `snippetSalt` all lived here).
  await new Promise((resolve) => chrome.storage.sync.clear(resolve));
  await new Promise((resolve) => chrome.storage.local.clear(resolve));

  // Session state, so a reset does not leave the next page load holding anything
  // about data that no longer exists. Not present in every context, hence the guard.
  if (chrome.storage.session) {
    await new Promise((resolve) => chrome.storage.session.clear(resolve));
  }

  window.location.reload();
}
