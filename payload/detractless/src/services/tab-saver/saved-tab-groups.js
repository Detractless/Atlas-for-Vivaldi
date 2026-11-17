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

export function toEntry(tab, closedAt) {
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

