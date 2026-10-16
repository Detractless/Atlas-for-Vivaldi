// The data behind right-click on the new tab (src/modules/26-addbar-edit.js in the browser window): rename, change
// the address of, move or delete a bookmark, a group or a page. The window asks; this answers and writes, in the
// same bookmark database and page list as the new tab. Every answer is { ok: true } or { error: 'text to show' }.
// The checks and their words are the ones the new tab's own pop-ups used (components/bookmarks/bookmarks.js).
import { storageGet, storageSet, storageRemove } from '../services/storage.js';
import { cleanSubtitle, subtitleProblem } from '../services/pageSubtitle.js';
import { withDb } from './addFlow.js';

const MISSING = { error: 'Something is missing' };
const same = (a, b) => String(a) === String(b);

/** One bookmark, named by the group it is in and its current name and address. op: 'rename' | 'url' | 'delete'. */
export async function editBookmark(m) {
  if (m.page === undefined || m.page === null || !m.group || !['rename', 'url', 'delete'].includes(m.op)) return MISSING;
  return withDb(m.db, async (h) => {
    const groups = (await h.getBookmarks(m.page)) || {};
    const list = groups[m.group];
    const at = list ? list.findIndex((b) => b.name === m.name && b.url === m.url) : -1;
    if (at === -1) return { error: 'That bookmark is not there any more.' };
    const value = String(m.value || '').trim();
    if (m.op === 'rename') {
      if (!value) return { error: 'Give the bookmark a name.' };
      list[at].name = value;
    } else if (m.op === 'url') {
      if (!value) return { error: 'Give the bookmark a URL.' };
      list[at].url = /^https?:\/\//.test(value) ? value : `https://${value}`;
    } else {
      list.splice(at, 1);
      if (!list.length) delete groups[m.group];   // a group is kept only while it has something in it, as the new tab always did
    }
    await h.saveBookmarks(m.page, groups);
    return { ok: true };
  });
}

/** One group on a page. op: 'rename' (value is the new name) | 'move' (to is the page it goes to) | 'delete'. */
export async function editGroup(m) {
  if (m.page === undefined || m.page === null || !m.group || !['rename', 'move', 'delete'].includes(m.op)) return MISSING;
  return withDb(m.db, async (h) => {
    const groups = (await h.getBookmarks(m.page)) || {};
    if (!groups[m.group]) return { error: 'That group is not there any more.' };
    if (m.op === 'rename') return renameGroup(h, m, groups);
    if (m.op === 'move') return moveGroup(h, m, groups);
    delete groups[m.group];
    await h.saveBookmarks(m.page, groups);
    return { ok: true };
  });
}

/** The group keeps its place in the page's order; its name is saved in capitals, as every group name is. */
async function renameGroup(h, m, groups) {
  const name = String(m.value || '').trim().toUpperCase();
  if (!name) return { error: 'Give the group a name.' };
  if (name === m.group) return { ok: true };
  if (groups[name]) return { error: 'A group called that already exists.' };
  const renamed = {};
  for (const key of Object.keys(groups)) renamed[key === m.group ? name : key] = groups[key];
  await h.saveBookmarks(m.page, renamed);
  return { ok: true };
}

/** A page that already has a group of that name is not touched: moving used to replace it, bookmarks and all. */
async function moveGroup(h, m, groups) {
  if (m.to === undefined || m.to === null) return MISSING;
  if (same(m.to, m.page)) return { error: 'Choose another page.' };
  const target = (await h.getBookmarks(m.to)) || {};
  if (target[m.group]) return { error: `${m.group} already exists on that page.` };
  target[m.group] = groups[m.group];
  await h.saveBookmarks(m.to, target);   // the copy is saved before the original goes, so a failure loses nothing
  delete groups[m.group];
  await h.saveBookmarks(m.page, groups);
  return { ok: true };
}

/** One page of the page list, with its bookmarks on delete. op: 'rename' | 'sub' | 'move' | 'delete'.
    Home can't be moved or deleted. */
export async function editPage(m) {
  if (m.id === undefined || m.id === null || !['rename', 'sub', 'move', 'delete'].includes(m.op)) return MISSING;
  const { activeTabs } = await storageGet('sync', ['activeTabs']);
  const tabs = Array.isArray(activeTabs) ? activeTabs : [];
  const at = tabs.findIndex((t) => same(t.id, m.id));
  if (at === -1) return { error: 'That page is not there any more.' };
  if (m.op === 'move') {
    const problem = movePage(tabs, at, m.after);
    if (problem) return problem;
  } else if (m.op === 'rename') {
    const label = String(m.value || '').trim();
    if (!label) return { error: 'Give the page a name.' };
    tabs[at] = { ...tabs[at], label };
  } else if (m.op === 'sub') {
    const problem = subtitleProblem(m.value);
    if (problem) return { error: problem };
    tabs[at] = { ...tabs[at], sub: cleanSubtitle(m.value) };
  } else {
    if (tabs[at].type === 'search') return { error: 'Home can’t be deleted.' };
    const id = tabs[at].id;
    await withDb(m.db, (h) => h.deleteBookmarks(id));
    await storageRemove('sync', `page${id}`);
    tabs.splice(at, 1);
  }
  await storageSet('sync', { activeTabs: tabs });
  return { ok: true };
}

/** Put the page at `at` right after the page `after` ('' for right after Home, so first). Home always stays first.
    Changes `tabs` in place; returns { error } and changes nothing when it can't. */
function movePage(tabs, at, after) {
  if (tabs[at].type === 'search') return { error: 'Home always stays first.' };
  const first = after === '' || after === null || after === undefined;
  if (!first && same(after, tabs[at].id)) return { error: 'Choose another page.' };
  if (!first && !tabs.some((t) => same(t.id, after))) return { error: 'That page is not there any more.' };
  const [page] = tabs.splice(at, 1);
  const to = first ? tabs.findIndex((t) => t.type === 'search') + 1 : tabs.findIndex((t) => same(t.id, after)) + 1;
  tabs.splice(to, 0, page);
  return null;
}
