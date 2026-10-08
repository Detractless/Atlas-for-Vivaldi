// src/services/orphanCleanup.js — page records with no tab pointing at them.
//
// THE BUG THIS EXISTS FOR. A page's bookmarks live in IndexedDB keyed by page id;
// the list of pages lives in chrome.storage.sync under `activeTabs`. Import
// REPLACED activeTabs wholesale but only ever WROTE bookmark pages, never removed
// the ones already there. So the starter pages seeded on first run survived every
// import with their ids no longer in activeTabs.
//
// The result was invisible in the one place you would look and visible in the one
// place you could not act on it: no tab rendered those pages, so they could not be
// opened or deleted, while the pill cache scans getAllBookmarks() across EVERY
// page record and happily listed them. Users saw permanent duplicate Claude and
// Gemini pills that no amount of deleting would remove.
//
// SAFETY IS THE WHOLE DESIGN HERE. This function deletes user data, and the input
// that decides what to keep is read asynchronously from extension storage. A read
// that fails, or that lands before activeTabs is populated, would look exactly
// like "the user has no pages" and take the bookmarks with it. So an empty or
// unusable tab list means DELETE NOTHING, always, and every removal is logged.

import { BookmarkDB } from './bookmarksDB.js';
import { storageGet, storageSet } from './storage.js';

/** Marks the repair as already run, so it never sweeps twice. */
export const ORPHAN_REPAIR_FLAG = 'hasRepairedOrphanPages';

/**
 * Which stored page ids have no tab pointing at them.
 *
 * Pure, and deliberately paranoid: a missing, empty, or non-array tab list
 * returns [] rather than "everything is an orphan". Callers cannot distinguish a
 * failed read from a genuinely empty profile, so this refuses to guess.
 *
 * @param {number[]} storedPageIds page ids present in the database
 * @param {Array<{id: any, type?: string}>} activeTabs the tab list from storage
 * @returns {number[]} page ids safe to delete
 */
export function findOrphanPages(storedPageIds, activeTabs) {
  if (!Array.isArray(activeTabs) || activeTabs.length === 0) return [];
  if (!Array.isArray(storedPageIds) || storedPageIds.length === 0) return [];

  // Tab ids arrive as numbers from the seeder and as strings from some archives,
  // so compare as strings. The literal 'search' tab owns no bookmark page.
  const live = new Set(
    activeTabs
      .filter((tab) => tab && tab.id !== undefined && tab.id !== null)
      .map((tab) => String(tab.id))
  );

  return storedPageIds.filter((pageId) => !live.has(String(pageId)));
}

/**
 * Deletes orphaned pages from both bookmark stores.
 *
 * Records are removed OUTRIGHT rather than tombstoned. A tombstone means "the
 * user deleted this", which would be a lie: these rows were never legitimately
 * part of the profile, and tombstoning them would keep them alive in exactly the
 * merge paths this is trying to clear.
 *
 * @returns {Promise<number[]>} the page ids actually removed
 */
export async function pruneOrphanedPages(activeTabs) {
  const all = await BookmarkDB.getAllBookmarks();
  const storedPageIds = Object.keys(all)
    .filter((key) => key.startsWith('page'))
    .map((key) => Number(key.slice(4)))
    .filter((n) => !Number.isNaN(n));

  const orphans = findOrphanPages(storedPageIds, activeTabs);
  if (orphans.length === 0) return [];

  console.log('[Detractless] removing orphaned bookmark pages:', orphans);

  for (const pageId of orphans) {
    try {
      await BookmarkDB.deleteBookmarks(pageId);
    } catch (err) {
      console.error('[Detractless] could not remove orphaned page', pageId, err);
    }
  }

  await pruneOrphanedRecords(orphans);
  return orphans;
}

/** Drops v7 records belonging to pages that no longer exist. */
async function pruneOrphanedRecords(orphanPageIds) {
  if (typeof BookmarkDB.getBookmarkRecords !== 'function') return;
  if (typeof BookmarkDB.putBookmarkRecords !== 'function') return;

  try {
    const records = await BookmarkDB.getBookmarkRecords();
    if (!Array.isArray(records) || records.length === 0) return;
    const doomed = new Set(orphanPageIds.map(String));
    const keep = records.filter((r) => !doomed.has(String(r.page)));
    if (keep.length !== records.length) {
      // putBookmarkRecords clears and rewrites in one transaction, so passing the
      // survivors is the removal.
      await BookmarkDB.putBookmarkRecords(keep);
    }
  } catch (err) {
    console.error('[Detractless] could not prune orphaned bookmark records', err);
  }
}

/**
 * The one-time repair for profiles that already carry orphans.
 *
 * Runs AFTER the tab list is loaded, never before, and flags itself so a profile
 * is swept once rather than on every new tab. Prevention lives in the import path;
 * this only cleans up damage already on disk.
 *
 * @returns {Promise<number[]>} page ids removed, empty when there was nothing to do
 */
export async function runOrphanRepairOnce(activeTabs) {
  if (!Array.isArray(activeTabs) || activeTabs.length === 0) return [];

  const flagged = await storageGet('local', [ORPHAN_REPAIR_FLAG]);
  if (flagged[ORPHAN_REPAIR_FLAG]) return [];

  const removed = await pruneOrphanedPages(activeTabs);
  await storageSet('local', { [ORPHAN_REPAIR_FLAG]: true });
  return removed;
}
