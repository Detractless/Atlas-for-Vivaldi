import { storageGet, storageSet } from '../storage.js';
import { addTabsToGroups, applyTabEdit, ensureSeq, pruneEmptyGroups, shouldSaveTab, toEntry } from './saved-tab-groups.js';

const STORAGE_KEY = 'savedTabGroups';

export async function readGroups() {
  return new Promise((resolve) => {
    storageGet('local', [STORAGE_KEY]).then((res) => resolve((res && res[STORAGE_KEY]) || []));
  });
}

export async function writeGroups(list) {
  return new Promise((resolve) => {
    storageSet('local', { [STORAGE_KEY]: list }).then(resolve);
  });
}

/**
 * Record tabs that are ABOUT to be closed by the limiter.
 *
 * Called before chrome.tabs.remove, never after: a removed tab's url and title
 * are already gone by the time the callback runs. Always 'auto', since this path
 * only ever runs unattended.
 */
export async function saveClosingTabs(tabs, now = Date.now()) {
  const worth = (tabs || []).filter((tab) => tab && shouldSaveTab(tab.url));
  if (worth.length === 0) return [];

  const entries = worth.map((tab) => toEntry(tab, now));
  await writeGroups(addTabsToGroups(await readGroups(), entries, 'auto', now));
  return entries;
}

export async function listSavedGroups() {
  const stored = await readGroups();
  /* One-time backfill for sessions saved before numbering existed. Identity
     comparison, so the common case does not write on every read. */
  const withSeq = ensureSeq(stored);
  if (withSeq !== stored) await writeGroups(withSeq);
  return withSeq;
}

export async function removeSavedTab(groupId, url) {
  const groups = (await readGroups()).map(g =>
    g.id === groupId ? { ...g, tabs: (g.tabs || []).filter(t => t.url !== url) } : g);
  const pruned = pruneEmptyGroups(groups);
  await writeGroups(pruned);
  return pruned;
}

export async function updateSavedTab(groupId, oldUrl, patch) {
  const result = applyTabEdit(await readGroups(), groupId, oldUrl, patch);
  if (result.error) return result;
  await writeGroups(result.groups);
  return result;
}

export async function removeSavedGroup(groupId) {
  const remaining = (await readGroups()).filter(g => g.id !== groupId);
  await writeGroups(remaining);
  return remaining;
}

export async function setGroupDescription(groupId, description) {
  const groups = (await readGroups()).map(g =>
    g.id === groupId ? { ...g, description: String(description || '').trim() } : g);
  await writeGroups(groups);
  return groups;
}

