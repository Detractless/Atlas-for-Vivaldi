// The Focus locks in chrome.storage.sync (`focusLocks`). What a click does, and what a lock allows, is
// utils/focusLock.js; this only reads and saves.
import { storageGet, storageSet } from './storage.js';
import { clickLock } from '../utils/focusLock.js';

/** The saved locks ({} when there are none). */
export async function readLocks() {
  const { focusLocks } = await storageGet('sync', ['focusLocks']);
  return focusLocks && typeof focusLocks === 'object' ? focusLocks : {};
}

/** Click `key`'s lock: lock it, start its 30-minute unlock, or keep it locked. Resolves to the saved locks. */
export async function clickFocusLock(key, now = Date.now()) {
  const next = clickLock(await readLocks(), key, now);
  await storageSet('sync', { focusLocks: next });
  return next;
}
