// src/services/mergeSync.js — per-item merge for bookmark records.
//
// This file used to serve notes and events as well, and was the JavaScript half
// of a contract with the Android launcher (`core/data/MergeCodecs.kt`), held
// together by a committed `merge-vectors.json`. Notes, events and sync were all
// removed from this extension, so that contract is gone and only the bookmark
// merge remains. Bookmarks are extension-only and always were: the launcher
// passes `newtab/config.json` through untouched, so this pair never had a Kotlin
// twin.
//
// The rules, in full:
//  - For each id in union(local, remote): one side only -> take it; otherwise the
//    greater `updatedAt` wins.
//  - On a tie, a tombstone (deletedAt != null) beats a live item; failing that,
//    remote wins. Preferring remote is asymmetric but converges — once either
//    side writes, both hold the same bytes and the next merge is a no-op.
//  - Live items sort by (sortIndex, id) and are renumbered 0..n-1. Tombstones
//    keep their stored sortIndex and trail the live items, ordered by id.
//  - Tombstones are retained. sweepBookmarks drops expired ones and is called on
//    the WRITE path only: sweeping on read would let a device with a wrong clock
//    mass-delete from an archive it merely looked at.
//
// See bookmarkSync.js for the record shape.

/** How long a tombstone is kept before a sweep may drop it: 90 days, in ms. */
export const TOMBSTONE_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;

function pick(local, remote) {
  if (local.updatedAt !== remote.updatedAt) return local.updatedAt > remote.updatedAt ? local : remote;

  // Same millisecond. A delete beats an edit, so a deletion cannot be undone by a
  // coincidental simultaneous edit and then resurrect on the next merge.
  const localDeleted = local.deletedAt !== null;
  const remoteDeleted = remote.deletedAt !== null;
  if (localDeleted !== remoteDeleted) return localDeleted ? local : remote;

  return remote;
}

function merge(local, remote) {
  const winners = new Map();
  for (const item of local) winners.set(item.id, item);
  for (const item of remote) {
    const mine = winners.get(item.id);
    winners.set(item.id, mine === undefined ? item : pick(mine, item));
  }

  const all = [...winners.values()];
  const live = all
    .filter((item) => item.deletedAt === null)
    .sort((a, b) => (a.sortIndex - b.sortIndex) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((item, index) => ({ ...item, sortIndex: index }));
  const tombstones = all
    .filter((item) => item.deletedAt !== null)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  return [...live, ...tombstones];
}

export function mergeBookmarks(local, remote) {
  return merge(local, remote);
}

/**
 * Drops tombstones older than TOMBSTONE_WINDOW_MS. A backwards clock gives a
 * negative age, which is never greater than the window, so it sweeps nothing —
 * a bad clock keeps too much, never deletes.
 */
function sweep(items, now) {
  return items.filter((item) => item.deletedAt === null || now - item.deletedAt <= TOMBSTONE_WINDOW_MS);
}

export function sweepBookmarks(items, now) {
  return sweep(items, now);
}
