import { addTabsToGroups, shouldSaveTab, toEntry } from './saved-tab-groups.js';
import { readGroups, writeGroups } from './saved-tab-storage.js';

/* Pure selection rules for the Choose tabs page. */

/** Offer current, pinned, then remaining tabs in window order.
 *  Keep the unticked special rows above the default selection.
 */
export function classifyOpenTabs(tabs) {
  const candidates = (tabs || [])
    .filter(tab => tab && shouldSaveTab(tab.url))
    .map((tab, index) => ({
      id: tab.id,
      url: tab.url,
      title: tab.title || tab.url,
      favIconUrl: tab.favIconUrl || '',
      pinned: tab.pinned === true,
      isCurrent: tab.active === true,
      order: index,
    }));

  const rank = (c) => (c.isCurrent ? 0 : c.pinned ? 1 : 2);
  return candidates.sort((a, b) => rank(a) - rank(b) || a.order - b.order);
}

/** Select ordinary tabs by default; current and pinned tabs stay opt-in. */
export function defaultSelection(candidates) {
  return (candidates || []).filter(c => !c.isCurrent && !c.pinned).map(c => c.id);
}

/**
 * Turn a selection into the three things that have to happen.
 *
 * THE GUARD, which is the reason this function exists. Chrome closes a window
 * when its last tab goes, and the side panel goes with it. Ticking every tab is
 * now possible, so that is reachable. The current tab is therefore SAVED like any
 * other, but when nothing at all would survive it is NAVIGATED to the new tab
 * page instead of closed. The window can never reach zero.
 *
 * When other tabs survive, the current tab is closed for real. A partial
 * selection should not leave a stray new tab sitting beside the tabs you kept.
 *
 * SURVIVORS ARE COUNTED OVER EVERY TAB IN THE WINDOW, not over the candidates.
 * A chrome:// page or a blank tab is never offered for saving, but it is still a
 * tab, and it still keeps the window alive. Counting only candidates would fire
 * the guard when it was not needed and leave that stray new tab behind.
 *
 * @returns {{entries: Array, closeIds: Array<number>, navigateId: number|null}}
 */
export function planSaveAndClose(tabs, selectedIds, now = Date.now()) {
  const wanted = new Set(selectedIds || []);
  const chosen = classifyOpenTabs(tabs).filter(c => wanted.has(c.id));
  if (chosen.length === 0) return { entries: [], closeIds: [], navigateId: null };

  const survivors = (tabs || []).length - chosen.length;
  const current = chosen.find(c => c.isCurrent) || null;
  const navigateId = current && survivors === 0 ? current.id : null;

  return {
    entries: chosen.map(c => toEntry(c, now)),
    closeIds: chosen.filter(c => c.id !== navigateId).map(c => c.id),
    navigateId,
  };
}

/** The new tab page, which the extension overrides, so this lands on ours. */
export const NEW_TAB_URL = 'chrome://newtab/';

/** Every open tab worth offering, ready for the Choose tabs page. */
export async function listOpenTabCandidates() {
  return classifyOpenTabs(await chrome.tabs.query({ currentWindow: true }));
}

/**
 * Save the chosen tabs as one group, then close them, honouring the guard.
 *
 * ORDER MATTERS: the write happens BEFORE anything is closed. If closing throws
 * halfway, the addresses are already stored, which is the failure worth
 * surviving. The reverse order can lose tabs outright.
 */
export async function saveAndCloseSelected(selectedIds, now = Date.now()) {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  const { entries, closeIds, navigateId } = planSaveAndClose(tabs, selectedIds, now);
  if (entries.length === 0) return null;

  const groups = addTabsToGroups(await readGroups(), entries, 'manual', now);
  await writeGroups(groups);

  for (const id of closeIds) {
    try { await chrome.tabs.remove(id); } catch (_) { /* already gone */ }
  }
  if (navigateId != null) {
    try { await chrome.tabs.update(navigateId, { url: NEW_TAB_URL }); } catch (_) { /* gone */ }
  }

  const made = groups.find(g => g.kind === 'manual' && g.savedAt === now);
  return made ? made.id : null;
}
