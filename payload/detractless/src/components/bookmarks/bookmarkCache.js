import { BookmarkDB } from '../../services/bookmarksDB.js';
import { setAllCachedBookmarks, setAllCachedGroups, setUsageScores } from '../../pages/newtab/newtabState.js';

export async function refreshBookmarkCache() {
  try {
    const [allBookmarksObj, scores] = await Promise.all([
      BookmarkDB.getAllBookmarks(),
      BookmarkDB.getAllUsageScores()
    ]);
    const _cachedBookmarks = [];
    const _cachedGroups = {};
    Object.values(allBookmarksObj).forEach(groups => {
      Object.entries(groups).forEach(([groupName, bookmarkList]) => {
        bookmarkList.forEach(bm => _cachedBookmarks.push(bm));
        if (!_cachedGroups[groupName]) _cachedGroups[groupName] = [];
        _cachedGroups[groupName].push(...bookmarkList);
      });
    });
    setAllCachedBookmarks(_cachedBookmarks);
    setAllCachedGroups(_cachedGroups);
    setUsageScores(scores);
  } catch (e) {
    console.error("Failed to cache bookmarks", e);
  }
}
