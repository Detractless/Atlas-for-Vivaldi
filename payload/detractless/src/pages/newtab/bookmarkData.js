// Opening the bookmarks database. Shared by the first start and by a profile
// switch, which may point BookmarkDB at another profile's database.
import { BookmarkDB } from '../../services/bookmarksDB.js';
import { refreshBookmarkCache } from '../../components/bookmarks/bookmarks.js';
import { seedStarterContent } from '../../services/starterContent.js';

/** Open the bookmarks database, run its migrations, and seed a first-run profile. */
export async function loadBookmarkData() {
  await BookmarkDB.init(); await BookmarkDB.migrateFromChromeStorage();
  await BookmarkDB.migrateBookmarksToRecords(); // Phase 12, non-destructive
  await refreshBookmarkCache();
  const didSeed = await seedStarterContent();
  if (didSeed) await refreshBookmarkCache();
}

/** Close the open connection so the next init() opens the active profile's database. */
export function closeBookmarkData() {
  if (BookmarkDB.db) {
    try { BookmarkDB.db.close(); } catch (e) { /* already closed */ }
    BookmarkDB.db = null;
  }
}
