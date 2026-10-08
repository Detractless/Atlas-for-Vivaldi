// src/services/tabSaver.js — keep the URL of every tab the limiter takes away.
//
// THE PROBLEM. The tab limiter closes tabs to keep the count down, and a tab held
// open is how people park something interesting they have not finished with. So
// the limiter's whole job is to destroy the thing the user was using it to store.
//
// URL LEVEL ONLY, deliberately. An earlier sketch archived full page state so a
// saved tab could be read without the site. That was dropped on the user's own
// reasoning: leaving a tab open does not preserve page state across a restart
// either, so archiving solves a problem nobody actually has, while costing the
// pageCapture permission and megabytes per page. A URL, title and favicon is
// exactly what an open tab was really storing.
//
// SAVED IN GROUPS (R-022), not as loose rows, because a set of tabs closed
// together is one thing you were doing rather than N unrelated addresses. That
// raised the only hard question here: the limiter closes tabs UNATTENDED, often
// one at a time, so a group per close would produce a pile of one-tab groups,
// which is worse than the flat list groups replaced. So the two paths differ:
//
//   MANUAL   save-and-clear makes ONE group and then offers a description.
//   AUTOMATIC limiter closes accumulate into a ROLLING GROUP PER DAY and never
//            prompt, because there is nobody there to answer.
//
// The pure helpers are separated out because everything else needs
// chrome.storage, and the decisions worth testing are which tabs get saved, how
// duplicates collapse, and which group an automatic save lands in.

const STORAGE_KEY = 'savedTabGroups';

/** Never save the extension's own pages or browser-internal URLs. */
const SKIP_SCHEMES = /^(chrome|chrome-extension|edge|about|devtools|view-source|moz-extension):/i;

/**
 * Is this a tab worth keeping the address of?
 * A blank tab and the new tab page are not; they carry nothing to come back to.
 */
export function shouldSaveTab(url) {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (trimmed === 'about:blank') return false;
  if (SKIP_SCHEMES.test(trimmed)) return false;
  return /^https?:\/\//i.test(trimmed);
}

/** The day a timestamp falls in, as a stable key. Local time, since the grouping
 *  is about the user's day rather than any absolute clock. */
export function dayKey(ts) {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** The shape stored for one tab. */
function toEntry(tab, closedAt) {
  return {
    url: tab.url,
    title: tab.title || tab.url,
    favIconUrl: tab.favIconUrl || '',
    closedAt,
  };
}

/**
 * Fold tabs into the group list.
 *
 * `mode` decides which group they land in. 'auto' finds or creates the rolling
 * group for that day; 'manual' always starts a new one, because a deliberate
 * save-and-clear is a distinct act even if you do two in an afternoon.
 *
 * Deduplication is WITHIN a group, not across all of them: the same article
 * closed on Monday and again on Thursday is two different moments of losing it,
 * and collapsing those would hide the second. Inside one group a repeat is just
 * noise, so the newer sighting wins.
 */
export function addTabsToGroups(groups, entries, mode, now = Date.now()) {
  const list = Array.isArray(groups) ? groups.map(g => ({ ...g, tabs: [...(g.tabs || [])] })) : [];
  const fresh = (entries || []).filter(e => e && e.url);
  if (fresh.length === 0) return list;

  let target = null;
  if (mode === 'auto') {
    const key = dayKey(now);
    target = list.find(g => g.kind === 'auto' && g.dayKey === key) || null;
  }

  if (!target) {
    target = {
      id: `grp-${now}-${Math.random().toString(16).slice(2, 8)}`,
      kind: mode === 'auto' ? 'auto' : 'manual',
      dayKey: dayKey(now),
      savedAt: now,
      /* A STABLE number, assigned once and stored, never a position in the list.
         "Session N" was derived from chronological ORDER, which meant deleting an
         old session silently renumbered every later one: a name that changes when
         you delete something else is exactly what made the old numbering feel
         arbitrary. Stored, "Save 12" stays Save 12 forever. */
      seq: nextSeq(list),
      description: '',
      tabs: [],
    };
    list.unshift(target);
  }

  const byUrl = new Map(target.tabs.map(t => [t.url, t]));
  for (const entry of fresh) byUrl.set(entry.url, entry);
  target.tabs = [...byUrl.values()].sort((a, b) => (b.closedAt || 0) - (a.closedAt || 0));
  target.savedAt = Math.max(target.savedAt || 0, now);

  return list.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
}

/** The next sequence number: one past the highest ever handed out. Reads the
 *  MAX rather than the count, so deleting groups never reissues a number. */
export function nextSeq(groups) {
  return (groups || []).reduce((max, g) => Math.max(max, Number(g && g.seq) || 0), 0) + 1;
}

/** Backfill seq on groups saved before numbering existed.
 *
 *  Oldest first, so the numbers read in the order the sessions actually
 *  happened. Returns the same array instance when nothing was missing, which is
 *  how the caller knows whether a write is needed at all.
 */
export function ensureSeq(groups) {
  const list = groups || [];
  if (list.every(g => Number(g && g.seq) > 0)) return list;

  const order = [...list].sort((a, b) => (a.savedAt || 0) - (b.savedAt || 0));
  let n = 0;
  const assigned = new Map();
  for (const g of order) {
    n = Number(g.seq) > 0 ? Math.max(n, Number(g.seq)) : n + 1;
    assigned.set(g.id, Number(g.seq) > 0 ? Number(g.seq) : n);
  }
  return list.map(g => ({ ...g, seq: assigned.get(g.id) }));
}

/** Drop empty groups, so removing a group's last tab does not leave a husk. */
export function pruneEmptyGroups(groups) {
  return (groups || []).filter(g => g && Array.isArray(g.tabs) && g.tabs.length > 0);
}

/** Case-insensitive match over a group's description and its tabs. */
export function groupMatches(group, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return true;
  if ((group.description || '').toLowerCase().includes(q)) return true;
  return (group.tabs || []).some(t =>
    (t.title || '').toLowerCase().includes(q) || (t.url || '').toLowerCase().includes(q));
}

/**
 * Apply a title/URL edit to one saved tab. Pure, so the rules below are testable
 * without chrome.storage.
 *
 * THE COLLISION RULE IS THE INTERESTING PART. Tabs are deduplicated by URL within
 * a group, so editing one tab's URL onto another's would make two rows that the
 * next save silently collapses into one, losing whichever title you just typed.
 * That is refused rather than merged: a merge here would look like the edit had
 * worked and then quietly eat a row.
 *
 * @returns {{groups: Array}|{error: string}}
 */
/* needsOpenConfirm lived here from spec 002 to spec 004: clicking a session
   used to OPEN it, so large sessions confirmed first. Spec 004 made opening an
   explicit, always-visible pill that names its count, and a row click only
   navigates, so the guard's reason is gone and the guard went with it. */

export function applyTabEdit(groups, groupId, oldUrl, patch) {
  const list = Array.isArray(groups) ? groups : [];
  const group = list.find(g => g && g.id === groupId);
  if (!group) return { error: 'That session is gone.' };

  const tabs = group.tabs || [];
  const index = tabs.findIndex(t => t && t.url === oldUrl);
  if (index === -1) return { error: 'That tab is no longer in this session.' };

  /* NEWLINES ARE STRIPPED HERE, NOT IN THE FORM. The Title and URL fields are
     <textarea> so a long value can wrap and be read in full in a narrow panel
     (spec 002, decision 3), and a textarea accepts line breaks. A title or address
     containing one is never valid, so the guarantee lives with the data: any
     future caller of applyTabEdit gets it too, not just the one form. */
  const flatten = (v) => String(v == null ? '' : v).replace(/[\r\n]+/g, ' ');

  const url = flatten(patch.url).trim();
  if (!url) return { error: 'Give the tab an address.' };
  if (!shouldSaveTab(url)) {
    return { error: 'That needs to be a web address starting with http or https.' };
  }

  if (url !== oldUrl && tabs.some((t, i) => i !== index && t && t.url === url)) {
    return { error: 'Another tab in this session already has that address.' };
  }

  /* An empty title falls back to the address rather than leaving a nameless row,
     which is the same fallback the renderer already applies. */
  const title = flatten(patch.title).trim() || url;

  const nextTabs = tabs.slice();
  nextTabs[index] = { ...tabs[index], url, title };

  return {
    groups: list.map(g => (g.id === groupId ? { ...g, tabs: nextTabs } : g)),
  };
}

async function readGroups() {
  return new Promise((resolve) => {
    chrome.storage.local.get([STORAGE_KEY], (res) => resolve((res && res[STORAGE_KEY]) || []));
  });
}

async function writeGroups(list) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEY]: list }, resolve);
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
