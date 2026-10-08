// src/services/bookmarkSync.js — bookmarks as merge-owned records (Phase 12).
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
// bookmark-specific shape: the record, and the projection to/from the nested form
// the renderer still reads.
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

/**
 * Flat records → nested `{ pageN: { group: [{name,url}] } }` for the renderer.
 *
 * Live rows only; tombstones never render. Group order follows the order in which
 * each group's first live bookmark appears by sortIndex, which is stable across
 * merges because merge renumbers sortIndex while preserving relative order.
 */
export function materialize(records) {
  const live = (records || [])
    .filter((r) => r.deletedAt === null || r.deletedAt === undefined)
    .slice()
    .sort((a, b) => a.sortIndex - b.sortIndex);

  const nested = {};
  for (const r of live) {
    const pageKey = `page${r.page}`;
    if (!nested[pageKey]) nested[pageKey] = {};
    if (!nested[pageKey][r.group]) nested[pageKey][r.group] = [];
    nested[pageKey][r.group].push({ name: r.name, url: r.url });
  }
  return nested;
}

/** Records from an archive's JSON. Corrupt JSON yields [] — never take the page down. */
export function parseBookmarkRecords(json) {
  let raw;
  try {
    raw = JSON.parse(json);
  } catch (_) {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r, i) => ({
      id: r.id,
      page: Number(r.page),
      group: r.group,
      name: r.name,
      url: r.url,
      sortIndex: r.sortIndex === undefined || r.sortIndex === null ? i : r.sortIndex,
      updatedAt: r.updatedAt === undefined || r.updatedAt === null ? 0 : r.updatedAt,
      deletedAt: r.deletedAt === undefined || r.deletedAt === null ? null : r.deletedAt,
    }))
    .filter((r) => r.id !== undefined && r.id !== null && !Number.isNaN(r.page));
}

/**
 * Records → archive JSON. Includes tombstones on purpose (the delete has to
 * travel), and omits `deletedAt` on live rows to match the notes/events codec's
 * field-omission style.
 */
export function serializeBookmarkRecords(records) {
  return JSON.stringify(
    (records || []).map((r) => {
      const out = {
        id: r.id,
        page: r.page,
        group: r.group,
        name: r.name,
        url: r.url,
        sortIndex: r.sortIndex,
        updatedAt: r.updatedAt,
      };
      if (r.deletedAt !== null && r.deletedAt !== undefined) out.deletedAt = r.deletedAt;
      return out;
    }),
  );
}
