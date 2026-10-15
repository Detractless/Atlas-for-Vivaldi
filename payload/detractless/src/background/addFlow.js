// The data behind "Add bookmark" and "Add page" in the address bar (src/modules/23-addbar-core.js and
// 24-addbar-screens.js in the browser window). The window asks; this answers and writes, using the same
// bookmark database and page list as the new tab, so what is added shows there at once.
import { BookmarkDB } from '../services/bookmarksDB.js';
import { storageGet, storageSet } from '../services/storage.js';
import { loadSites, matchSites, hostOf, mainDomain, nameChoices } from '../services/siteSuggestions.js';
import { cleanSubtitle, subtitleProblem } from '../services/pageSubtitle.js';

const DB_NAME = /^[A-Za-z0-9_.-]{1,80}$/;
const SITES_FRESH_MS = 60 * 1000;
let sites = { at: 0, list: [] };

/** The bookmark database of the profile the window is showing, as a handle of its own (closed after use). */
async function withDb(name, work) {
  if (!DB_NAME.test(String(name || ''))) throw new Error('Not a bookmark database name');
  const handle = Object.assign(Object.create(BookmarkDB), { fixedName: true, dbName: name, db: null });
  try {
    return await work(handle);
  } finally {
    try { if (handle.db) handle.db.close(); } catch (e) { /* already closed */ }
  }
}

async function visitedSites() {
  if (Date.now() - sites.at > SITES_FRESH_MS) sites = { at: Date.now(), list: await loadSites() };
  return sites.list;
}

async function savedDomains(db) {
  const all = await withDb(db, (h) => h.getAllBookmarks());
  const out = new Set();
  for (const groups of Object.values(all || {})) {
    for (const list of Object.values(groups || {})) {
      for (const b of list || []) { const d = mainDomain(hostOf(b && b.url)); if (d) out.add(d); }
    }
  }
  return out;
}

/** The pages bookmarks can go on (not the search page). */
export async function addInfo() {
  const { activeTabs } = await storageGet('sync', ['activeTabs']);
  const pages = (Array.isArray(activeTabs) ? activeTabs : []).filter((t) => t && t.type !== 'search').map((t) => ({ id: t.id, label: String(t.label || '') }));
  return { pages };
}

/** The groups on one page, A to Z. */
export async function addGroups(m) {
  return { groups: await withDb(m.db, async (h) => Object.keys((await h.getBookmarks(m.page)) || {}).sort()) };
}

/** Pills for what is typed (the page you are on first), and the names offered for it. */
export async function addSuggest(m) {
  const typed = String(m.typed || '');
  const saved = await savedDomains(m.db).catch((e) => { console.error('Reading the saved sites failed:', e); return new Set(); });
  const list = matchSites(await visitedSites(), typed, 8, saved).map((s) => ({ label: s.domain, value: s.domain }));
  const here = mainDomain(hostOf(m.thisUrl));
  const q = (hostOf(typed) || typed.trim().toLowerCase());
  if (here && !saved.has(here) && (!q || here.includes(q))) {
    return { sites: [{ label: `${here} · this page`, value: here }, ...list.filter((s) => s.value !== here)].slice(0, 8), names: nameChoices(typed) };
  }
  return { sites: list, names: nameChoices(typed) };
}

/** Save one bookmark: { db, name, url, page, group, newGroup }. */
export async function addBookmarkTo(m) {
  const name = String(m.name || '').trim(), url = String(m.url || '').trim(), group = String(m.group || '').trim();
  if (!name || !url || !group || m.page === undefined || m.page === null) return { error: 'Something is missing' };
  const finalUrl = /^https?:\/\//.test(url) ? url : `https://${url}`;
  return withDb(m.db, async (h) => {
    const groups = (await h.getBookmarks(m.page)) || {};
    if (m.newGroup && groups[group]) return { error: `${group} already exists on this page.` };
    (groups[group] = groups[group] || []).push({ name, url: finalUrl });
    await h.saveBookmarks(m.page, groups);
    return { ok: true };
  });
}

/** Make a page: { label, sub }. */
export async function addPageTo(m) {
  const problem = subtitleProblem(m.sub);
  if (problem) return { error: problem };
  const { activeTabs } = await storageGet('sync', ['activeTabs']);
  if (!Array.isArray(activeTabs)) return { error: 'Open a new tab once first, to set up your pages.' };
  const page = { id: Date.now(), label: String(m.label || '').trim() || `Page ${activeTabs.length}`, type: 'bookmarks', sub: cleanSubtitle(m.sub) };
  await storageSet('sync', { activeTabs: [...activeTabs, page] });
  return { ok: true, id: page.id };
}
