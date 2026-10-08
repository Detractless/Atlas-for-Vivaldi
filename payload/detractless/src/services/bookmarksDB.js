import { dematerialize } from './bookmarkSync.js';
import { BOOKMARKS_DB } from '../constants/storageKeys.js';
import { storageGet, storageRemove, storageSet } from './storage.js';

export const BookmarkDB = {
  dbName: BOOKMARKS_DB,
  // v6 added the `notes` and `events` stores. Both features have been removed and
  // nothing reads these any more.
  // v7 adds `bookmarkRecords` (Phase 12): bookmarks as merge-owned records so an
  // import merges instead of clobbering. The old nested `bookmarks` store is
  // KEPT, not dropped — it is the backout snapshot until Phase 12 is proven.
  version: 7,
  db: null,

  async init() {
    // Atlas: each profile may own its bookmarks database (profilesCore.js).
    if (!this.fixedName && window.AtlasProfiles) {
      await window.AtlasProfiles.ready;
      this.dbName = window.AtlasProfiles.dbName();
    }
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);
      request.onerror = () => reject(request.error);
      request.onblocked = () => {
        console.warn('[BookmarkDB] init blocked by another open connection');
        if (this.db) { try { this.db.close(); } catch (_) { /* already closed */ } this.db = null; }
        reject(new Error('BookmarkDB init blocked by open connection'));
      };
      request.onsuccess = () => {
        this.db = request.result;
        this.db.onversionchange = () => {
          if (this.db) {
            try { this.db.close(); } catch (_) { /* already closed */ }
            this.db = null;
          }
        };
        resolve(this.db);
      };
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        db.onversionchange = () => {
          try { db.close(); } catch (_) { /* already closed */ }
        };
        if (!db.objectStoreNames.contains('bookmarks')) db.createObjectStore('bookmarks', { keyPath: 'page' });
        if (!db.objectStoreNames.contains('icons')) db.createObjectStore('icons');
        if (!db.objectStoreNames.contains('usage')) db.createObjectStore('usage', { keyPath: 'url' });
        if (!db.objectStoreNames.contains('uiPrefs')) {
          const store = db.createObjectStore('uiPrefs', { keyPath: 'key' });
          // One-time migration from localStorage on first upgrade to v4.
          const themePref = localStorage.getItem('themePref');
          const uiScaleStr = localStorage.getItem('uiScale');
          if (themePref) store.put({ key: 'themePref', value: themePref });
          if (uiScaleStr !== null) {
            const scale = parseFloat(uiScaleStr);
            if (!isNaN(scale)) store.put({ key: 'uiScale', value: scale });
          }
          localStorage.removeItem('themePref');
          localStorage.removeItem('uiScale');
        }
        // v6. `notes` is LIVE AGAIN: the side-panel notes feature reads and writes
        // it through listNotes/saveNote/deleteNote below. Keeping the store rather
        // than opening a second database was the point of never dropping it, and
        // it means reset already covers notes, since resetService deletes this
        // whole database.
        //
        // `events` is still vestigial. Nothing reads or writes it. It stays for
        // the original reason: dropping it means a v8 migration that destroys the
        // only remaining copy of anything left in it, and that should be a
        // deliberate, separate decision.
        if (!db.objectStoreNames.contains('notes')) db.createObjectStore('notes', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('events')) db.createObjectStore('events', { keyPath: 'id' });
        // v7 (Phase 12). Populated from the nested `bookmarks` store by
        // migrateBookmarksToRecords() at init — not here, because that read+write
        // across stores is easier to reason about outside the upgrade transaction.
        if (!db.objectStoreNames.contains('bookmarkRecords')) {
          db.createObjectStore('bookmarkRecords', { keyPath: 'id' });
        }
      };
    });
  },

  async getUiPref(key) {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['uiPrefs'], 'readonly');
      const req = tx.objectStore('uiPrefs').get(key);
      req.onsuccess = () => resolve(req.result ? req.result.value : undefined);
      req.onerror = () => reject(req.error);
    });
  },

  async setUiPref(key, value) {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['uiPrefs'], 'readwrite');
      const req = tx.objectStore('uiPrefs').put({ key, value });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  },

  async clearUiPrefs() {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['uiPrefs'], 'readwrite');
      const req = tx.objectStore('uiPrefs').clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  },

  async getBookmarks(pageNumber) {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['bookmarks'], 'readonly');
      const store = transaction.objectStore('bookmarks');
      const request = store.get(pageNumber);
      request.onsuccess = () => resolve(request.result ? request.result.data : {});
      request.onerror = () => reject(request.error);
    });
  },

  async saveBookmarks(pageNumber, bookmarksData) {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['bookmarks'], 'readwrite');
      const store = transaction.objectStore('bookmarks');
      const request = store.put({ page: pageNumber, data: bookmarksData });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  },

  async saveIcon(id, data) {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['icons'], 'readwrite');
      const store = transaction.objectStore('icons');
      const request = store.put(data, id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  },

  async getIcon(id) {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['icons'], 'readonly');
      const store = transaction.objectStore('icons');
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  async deleteIcon(id) {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['icons'], 'readwrite');
      const store = transaction.objectStore('icons');
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  },

  async deleteBookmarks(pageNumber) {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['bookmarks'], 'readwrite');
      const store = transaction.objectStore('bookmarks');
      const request = store.delete(pageNumber);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  },

  async getAllBookmarks() {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['bookmarks'], 'readonly');
      const store = transaction.objectStore('bookmarks');
      const request = store.getAll();
      request.onsuccess = () => {
        const result = {};
        request.result.forEach(item => { result[`page${item.page}`] = item.data; });
        resolve(result);
      };
      request.onerror = () => reject(request.error);
    });
  },

  // ── Bookmark records (Phase 12) ──────────────────────────────────────────
  //
  // The nested `bookmarks` store above is the OLD form. Records are the new
  // merge-owned form. During Phase 12 both exist; the nested store is the backout
  // snapshot. `getAllBookmarks` still reads nested here (Landing A) and is
  // repointed to materialise from records in Landing B — which is why the
  // migration below uses its own raw reader rather than getAllBookmarks, so it
  // keeps reading the ORIGINAL nested data whatever getAllBookmarks becomes.

  /** Raw read of the nested `bookmarks` store, independent of getAllBookmarks. */
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

  /* ── Notes (side panel) ──────────────────────────────────────────────
     Deliberately in THIS database rather than a new one, and deliberately in the
     `notes` store v6 already created. Two consequences worth stating: reset
     covers notes for free, because resetService deletes this database whole; and
     notes are NOT in the pastekit database, so the whole-store lock that gates
     snippets does not gate them. A note is not a secret and must not be
     unreachable because the snippet store happens to be locked.

     A note: { id, title, body, updatedAt }. */

  async listNotes() {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const request = this.db.transaction(['notes'], 'readonly')
        .objectStore('notes').getAll();
      request.onsuccess = () => {
        const notes = request.result || [];
        // Most recently edited first: the one you want is the one you just wrote.
        notes.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        resolve(notes);
      };
      request.onerror = () => reject(request.error);
    });
  },

  async saveNote(note) {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const record = {
        id: note.id || `note-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        title: note.title || '',
        body: note.body || '',
        updatedAt: Date.now(),
      };
      const tx = this.db.transaction(['notes'], 'readwrite');
      const request = tx.objectStore('notes').put(record);
      request.onsuccess = () => resolve(record);
      request.onerror = () => reject(request.error);
    });
  },

  async deleteNote(id) {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['notes'], 'readwrite');
      const request = tx.objectStore('notes').delete(id);
      request.onsuccess = () => resolve();
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
   * One-time, NON-DESTRUCTIVE migration: dematerialise the nested bookmarks into
   * records. The nested store is left untouched. Gated by a flag so it runs once;
   * it also no-ops if records already exist, so a device that has synced records
   * down before its own migration ran does not clobber them.
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

  async importAllBookmarks(data) {
    if (!this.db) await this.init();
    const promises = [];
    Object.keys(data).forEach(key => {
      if (key.startsWith('page')) {
        const pageNum = Number(key.replace('page', ''));
        if (!isNaN(pageNum)) promises.push(this.saveBookmarks(pageNum, data[key]));
      }
    });
    return Promise.all(promises);
  },

  async recordClick(url) {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['usage'], 'readwrite');
      const store = transaction.objectStore('usage');
      const getReq = store.get(url);
      getReq.onsuccess = () => {
        const existing = getReq.result ? getReq.result.timestamps : [];
        const updated = [Date.now(), ...existing].slice(0, 30);
        const putReq = store.put({ url, timestamps: updated });
        putReq.onsuccess = () => resolve();
        putReq.onerror = () => reject(putReq.error);
      };
      getReq.onerror = () => reject(getReq.error);
    });
  },

  async getAllUsageScores() {
    if (!this.db) await this.init();
    const HALF_LIFE_MS = 7 * 24 * 60 * 60 * 1000;
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['usage'], 'readonly');
      const store = transaction.objectStore('usage');
      const request = store.getAll();
      request.onsuccess = () => {
        const now = Date.now();
        const scores = new Map();
        request.result.forEach(({ url, timestamps }) => {
          const score = timestamps.reduce((sum, ts) => sum + Math.exp(-(now - ts) / HALF_LIFE_MS), 0);
          scores.set(url, score);
        });
        resolve(scores);
      };
      request.onerror = () => reject(request.error);
    });
  },

  async migrateFromChromeStorage() {
    return new Promise((resolve) => {
      storageGet('sync', ['bookmarks-page-1', 'bookmarks-page-2', 'bookmarks-page-3', 'bookmarks-migrated']).then(async (result) => {
          if (result['bookmarks-migrated']) { resolve(false); return; }
          let hasMigrated = false;
          if (result['bookmarks-page-1']) { await this.saveBookmarks(1, result['bookmarks-page-1']); hasMigrated = true; }
          if (result['bookmarks-page-2']) { await this.saveBookmarks(2, result['bookmarks-page-2']); hasMigrated = true; }
          if (result['bookmarks-page-3']) { await this.saveBookmarks(3, result['bookmarks-page-3']); hasMigrated = true; }
          if (hasMigrated) {
            storageSet('sync', { 'bookmarks-migrated': true });
            storageRemove('sync', ['bookmarks-page-1', 'bookmarks-page-2', 'bookmarks-page-3']);
          }
          resolve(hasMigrated);
        });
    });
  }
};
