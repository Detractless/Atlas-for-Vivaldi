// src/services/bookmarks/bookmarkSync.js — bookmarks as merge-owned records (Phase 12).
//
// WHY THIS EXISTS. Bookmarks used to be a nested blob
// (`pageN -> group -> [{name,url}]`) with no ids and no timestamps, REPLACED
// wholesale on every sync pull. So a bookmark added locally and not yet pushed was
// erased the next time the page loaded and pulled. Modelling each bookmark as a
// flat record lets the SAME per-item merge that converges notes and events
// converge bookmarks across browsers, per-bookmark: two browsers each adding a
// bookmark to the same page both keep theirs.
//
// EXTENSION-ONLY. The launcher passes `newtab/config.json` through byte-for-byte
// and never parses bookmarks, so — unlike mergeSync.js — this has no Kotlin twin
// and no committed vectors. It reuses mergeSync's merge rule and adds only the
// bookmark-specific record shape and the conversion used to read locally owned
// bookmarks from the nested form the renderer still reads.
//
// A record: { id, page, group, name, url, sortIndex, updatedAt, deletedAt }.
//   - `page` is the numeric page id (the `pageN` suffix).
//   - `group` is the group name string within a page.
//   - a delete is a tombstone (deletedAt != null), never a removal — dropping the
//     row would resurrect the bookmark on the next merge.

import { mergeBookmarks, sweepBookmarks } from './mergeSync.js';

export { mergeBookmarks, sweepBookmarks };

/** A fresh, stable id. Random and assigned once, exactly like notes (see §12.2). */
export function newBookmarkId() {
  return (typeof crypto !== 'undefined' && crypto.randomUUID && crypto.randomUUID())
    || `bm-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * Nested `{ pageN: { group: [{name,url}] } }` → flat records.
 *
 * The one-time migration from the old store, and the way a local nested edit is
 * read into records. Every record is stamped `now` and given a fresh id, so the
 * caller must only dematerialise state it OWNS — never a pulled archive, or two
 * browsers would mint different ids for the same bookmark and both would survive.
 */
export function dematerialize(nested, now = Date.now()) {
  const records = [];
  let sortIndex = 0;
  for (const [pageKey, groups] of Object.entries(nested || {})) {
    if (!pageKey.startsWith('page')) continue;
    const page = Number(pageKey.slice(4));
    if (Number.isNaN(page)) continue;
    for (const [group, list] of Object.entries(groups || {})) {
      for (const bm of (list || [])) {
        if (!bm || (bm.name === undefined && bm.url === undefined)) continue;
        records.push({
          id: newBookmarkId(),
          page,
          group,
          name: bm.name,
          url: bm.url,
          sortIndex: sortIndex++,
          updatedAt: now,
          deletedAt: null,
        });
      }
    }
  }
  return records;
}
