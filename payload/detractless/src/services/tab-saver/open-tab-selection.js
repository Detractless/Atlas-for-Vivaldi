import { addTabsToGroups, shouldSaveTab, toEntry } from './saved-tab-groups.js';
import { readGroups, writeGroups } from './saved-tab-storage.js';

/* saveAndCloseOpenTabs was DELETED in spec 007. It saved every tab except the
   active one and closed them, with no way to choose and nothing shown first. The
   Choose tabs page replaced it, and it was removed rather than kept as a shortcut:
   two code paths that both close a window's worth of tabs drift apart, and the
   one nobody looks at is the one that keeps the old rules. Its two decisions
   survive as DEFAULTS on the new page rather than as laws: the current tab starts
   unticked, and so, newly, do pinned tabs. */

/* ─── Spec 007: choosing which tabs to save ──────────────────────────────────
 *
 * Pure, so the interesting decisions are testable without Chrome. The whole
 * point of separating them is planSaveAndClose, which owns a guard that is easy
 * to state and easy to get wrong.
 */

/**
 * The open tabs worth offering, in the order they should be listed.
 *
 * ORDER IS PART OF THE DESIGN. The current tab comes first, then pinned tabs in
 * window order, then everything else in window order. The special rows start
 * unticked, so putting them first keeps the ticked block below them contiguous
 * rather than interleaving ticked and unticked rows down the list.
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

/**
 * What is ticked when the page opens: everything except the current tab and
 * pinned tabs.
 *
 * This is the old saveAndCloseOpenTabs behaviour turned into a starting point.
 * The active tab was excluded because closing what you are looking at is not
 * what "save and clear" means; pinned tabs are excluded because pinning is the
 * user already saying "not this one". Both are now overridable, which is the
 * user's decision in spec 007, made against the recommendation.
 */
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
