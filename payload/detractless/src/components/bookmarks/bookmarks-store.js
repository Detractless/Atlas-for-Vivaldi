import { BookmarkDB } from '../../services/bookmarksDB.js';
import { refreshBookmarkCache } from './bookmarkCache.js';

let failedPage = null;

export const readFailedFor = (page) => failedPage === page;
export const clearReadFailure = (page) => { if (failedPage === page) failedPage = null; };

/** Returns a page's saved groups, or null when its read failed. */
export async function readPageBookmarks(page) {
  try {
    const saved = await BookmarkDB.getBookmarks(page);
    clearReadFailure(page);
    return saved && Object.keys(saved).length ? saved : {};
  } catch (error) {
    failedPage = page;
    console.error('Detractless: could not read bookmarks for page', page, error);
    return null;
  }
}

/** Writes only when the last read of this page succeeded. */
export async function writePageBookmarks(page, data) {
  if (readFailedFor(page)) {
    console.error('Detractless: refusing to save, the last read of page',
      page, 'failed. Reload before changing anything.');
    return false;
  }
  try {
    await BookmarkDB.saveBookmarks(page, data);
    await refreshBookmarkCache();
    return true;
  } catch (error) {
    console.error('Error saving bookmarks:', error);
    return false;
  }
}

/** Add a resolved bookmark and return the refreshed page data on success. */
export async function insertBookmark(form) {
  if (!form || form.error) return null;
  const { name, group, page } = form;
  const url = form.url.match(/^https?:\/\//) ? form.url : `https://${form.url}`;
  try {
    const bookmarks = await BookmarkDB.getBookmarks(page) || {};
    if (!bookmarks[group]) bookmarks[group] = [];
    bookmarks[group].push({ name, url });
    await BookmarkDB.saveBookmarks(page, bookmarks);
    await refreshBookmarkCache();
    return { page, bookmarks };
  } catch (error) {
    console.error('[Detractless] could not save the bookmark', error);
    return null;
  }
}
