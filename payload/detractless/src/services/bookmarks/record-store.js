import { dematerialize } from './bookmarkSync.js';

/* The nested `bookmarks` store is the old form. These methods read and migrate
   it into merge-owned records while leaving the nested data as a backout copy. */
export const recordStoreMethods = {
  /** Raw nested-store read, independent of getAllBookmarks(). */
  async _getAllNestedBookmarks() {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const request = this.db.transaction(['bookmarks'], 'readonly')
        .objectStore('bookmarks').getAll();
      request.onsuccess = () => {
        const result = {};
        request.result.forEach(item => { result[`page${item.page}`] = item.data; });
        resolve(result);
      };
      request.onerror = () => reject(request.error);
    });
  },

  async getBookmarkRecords() {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const request = this.db.transaction(['bookmarkRecords'], 'readonly')
        .objectStore('bookmarkRecords').getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  },

  /** Rewrite the whole records set in one transaction (clear then put). */
  async putBookmarkRecords(records) {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['bookmarkRecords'], 'readwrite');
      const store = tx.objectStore('bookmarkRecords');
      store.clear();
      for (const record of records) store.put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  },

  /**
   * One-time, non-destructive migration. It skips existing records so synced
   * data is never overwritten by a device that has not migrated yet.
   */
  async migrateBookmarksToRecords() {
    if (!this.db) await this.init();
    if (await this.getUiPref('bookmarksMigratedToRecords')) return;

    const existing = await this.getBookmarkRecords();
    if (existing.length === 0) {
      const nested = await this._getAllNestedBookmarks();
      await this.putBookmarkRecords(dematerialize(nested, Date.now()));
    }
    await this.setUiPref('bookmarksMigratedToRecords', true);
  },
};
