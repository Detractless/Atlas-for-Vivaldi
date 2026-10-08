// src/services/snippetBackup.js — snippets in backups.
//
// Snippets came from PasteKit, archived with the Tools sidebar
// (_old/archive/tools-runtime/RESTORE.md). Nothing in Atlas edits them any more,
// but people still HAVE them, in the "pastekit" IndexedDB database. This module
// keeps them safe: Export writes them into the .detractless archive, Import
// restores them, and Reset closes the connection so the database can be deleted
// when the user asks for that. The schema and the export format are unchanged.
//
// Rows are stored in the clear. NO INDEXES ON THE SNIPPETS STORE (they were
// dropped when snippets were briefly encrypted), so reads are full scans; at
// personal scale that is fine.
import { PASTEKIT_DB } from '../constants/storageKeys.js';
const DB_NAME = PASTEKIT_DB, DB_VERSION = 2;
let _dbPromise = null;

function openDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (event) => {
      const db = req.result;
      if (!db.objectStoreNames.contains('snippets')) {
        db.createObjectStore('snippets', { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('folders')) {
        const f = db.createObjectStore('folders', { keyPath: 'id', autoIncrement: true });
        f.createIndex('name', 'name');
        f.createIndex('parentId', 'parentId');
      }
      if (!db.objectStoreNames.contains('settings'))
        db.createObjectStore('settings', { keyPath: 'key' });

      // 1 -> 2: drop every snippet index. They were built over fields that are
      // about to become ciphertext, and an index over a field that no longer
      // exists on the record is dead weight that also breaks `put` on a unique
      // index the moment two sealed rows both lack `name`.
      //
      // Records themselves are NOT touched here. This upgrade runs without a
      // passphrase — it can fire on a browser restart long before the user
      // unlocks — so it must not need one. Existing rows stay plaintext until
      // encryptAllSnippets() migrates them, and both shapes are readable in the
      // meantime.
      if (event.oldVersion >= 1 && event.oldVersion < 2) {
        const s = req.transaction.objectStore('snippets');
        for (const name of ['name', 'folderId', 'tags', 'updatedAt']) {
          if (s.indexNames.contains(name)) s.deleteIndex(name);
        }
      }
    };
    req.onblocked = () => {
      _dbPromise = null;
      console.warn('[PasteKit DB] open blocked by another open connection');
      reject(new Error('PasteKit DB open blocked'));
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onclose = () => { _dbPromise = null; }; // SW may sleep; reopen lazily
      db.onversionchange = () => {
        try { db.close(); } catch (_) { /* already closed */ }
        _dbPromise = null;
      };
      resolve(db);
    };
    req.onerror = () => { _dbPromise = null; reject(req.error); };
  });
  return _dbPromise;
}

/**
 * Close this page's connection and forget it.
 *
 * EXISTS FOR ONE CALLER: `resetAllData`. IndexedDB will not delete a database
 * while any connection to it is open — `deleteDatabase` fires `onblocked` and
 * simply never completes. Since `openDB` memoises its connection for the lifetime
 * of the page and never closes it (correct for normal use, where one page holds
 * one connection), a reset that did not call this would report success, reload,
 * and leave every snippet exactly where it was.
 *
 * Safe to call when nothing is open. The next database call reopens lazily.
 */
export async function closeDB() {
  if (!_dbPromise) return;
  const pending = _dbPromise;
  _dbPromise = null;
  try {
    (await pending).close();
  } catch (_) {
    // Already closed, or never opened successfully. Either way there is no
    // connection left to block the delete, which is all the caller needs.
  }
}

// Promise wrapper for an IDBRequest.
const p = (req) => new Promise((res, rej) => {
  req.onsuccess = () => res(req.result);
  req.onerror = () => rej(req.error);
});

// Promise that resolves when a transaction completes.
const txDone = (tx) => new Promise((res, rej) => {
  tx.oncomplete = () => res(undefined);
  tx.onerror = () => rej(tx.error);
  tx.onabort = () => rej(tx.error || new Error('transaction aborted'));
});

async function store(name, mode) {
  const db = await openDB();
  const tx = db.transaction(name, mode || 'readonly');
  return { tx, os: tx.objectStore(name) };
}

// ---------------------------------- READS ----------------------------------
async function readAllSnippets() {
  const { os } = await store('snippets');
  return p(os.getAll());
}

function byName(a, b) { return (a.name || '').localeCompare(b.name || ''); }

async function listFolders() {
  const { os } = await store('folders');
  const arr = await p(os.getAll());
  return arr.sort(byName);
}

// ------------------------------ EXPORT / IMPORT ---------------------------
export const FORMAT = 'pastekit-snippets';
export const CURRENT_VERSION = 1;

export async function buildExport() {
  const [folders, snippets] = await Promise.all([listFolders(), readAllSnippets()]);
  const folderXid = new Map();       // id -> xid
  folders.forEach((f, i) => folderXid.set(f.id, 'f' + (i + 1)));
  return {
    format: FORMAT,
    version: CURRENT_VERSION,
    createdBy: 'Pastekit-v2-zerodep/0.1.0',
    exportedAt: new Date().toISOString(),
    folders: folders.map(f => ({
      xid: folderXid.get(f.id),
      name: f.name,
      parentXid: f.parentId && folderXid.get(f.parentId) ? folderXid.get(f.parentId) : null,
    })),
    snippets: snippets.map(s => ({
      name: s.name,
      description: s.description || '',
      contentText: s.contentText || '',
      contentHtml: s.contentHtml || '',
      folderXid: s.folderId && folderXid.get(s.folderId) ? folderXid.get(s.folderId) : null,
      tags: s.tags || [],
      createdAt: new Date(s.createdAt || Date.now()).toISOString(),
      updatedAt: new Date(s.updatedAt || Date.now()).toISOString(),
    })),
  };
}

/**
 * Import a parsed JSON object. mode ∈ 'skip' | 'replace' | 'rename'.
 *
 * WHY THIS IS NOT ONE TRANSACTION. Folder ids are assigned by IndexedDB on insert
 * and snippets need those ids to set `folderId`, so folders commit first and
 * snippets follow. The remaining risk is an IndexedDB error between the two,
 * leaving folders without their snippets. Folders alone are harmless and
 * re-importing is idempotent for them, since they are matched by name.
 */
export async function importJson(data, mode) {
  mode = mode || 'skip';
  if (!data || data.format !== FORMAT) throw new Error('Not a Pastekit export file');
  const v = parseInt(data.version, 10);
  if (!Number.isFinite(v)) throw new Error('Missing/invalid version');
  if (v > CURRENT_VERSION) throw new Error('File is from a newer Pastekit version (' + v + ')');

  const report = { foldersAdded: 0, snippetsAdded: 0, skipped: 0, replaced: 0, renamed: 0 };
  const existingSnippets = await readAllSnippets();
  const snippetByName = new Map(existingSnippets.map(s => [s.name, s]));

  // --- folders: their own transaction ---
  const inputFolders = Array.isArray(data.folders) ? data.folders : [];
  const { tx: fTx, os: fOs } = await store('folders', 'readwrite');
  const existingFolders = await p(fOs.getAll());
  const folderByName = new Map(existingFolders.map(f => [f.name, f]));
  const xidToId = await importFolders(fOs, inputFolders, folderByName, report);
  await linkFolderParents(fOs, inputFolders, xidToId);
  await txDone(fTx);

  // --- snippets: plan in memory, then one write transaction ---
  const inputSnippets = Array.isArray(data.snippets) ? data.snippets : [];
  const rows = planSnippetImport(inputSnippets, xidToId, snippetByName, mode, report);

  if (rows.length) {
    const { tx, os } = await store('snippets', 'readwrite');
    // A row carries an id only when it is replacing an existing record; `put`
    // would otherwise insert with an undefined key, so the two cases differ.
    for (const row of rows) (row.id == null ? os.add(row) : os.put(row));
    await txDone(tx);
  }
  return report;
}

/**
 * Decide what the import does, without writing anything.
 *
 * Returns the records to store. Clash handling is unchanged; it just happens
 * against decrypted records in memory rather than against the store.
 */
function planSnippetImport(inputSnippets, xidToId, snippetByName, mode, report) {
  const now = Date.now();
  const out = [];
  for (const s of inputSnippets) {
    const base = buildSnippetRecord(s, xidToId, now);
    if (!base.name) continue;
    const clash = snippetByName.get(base.name);
    if (clash && mode === 'skip') { report.skipped++; continue; }
    if (clash && mode === 'replace') {
      base.id = clash.id;
      base.createdAt = clash.createdAt || base.createdAt;
      snippetByName.set(base.name, base);
      report.replaced++;
      out.push(base);
      continue;
    }
    if (clash && mode === 'rename') {
      base.name = renamedCandidate(base.name, snippetByName);
      report.renamed++;
    }
    snippetByName.set(base.name, base);
    report.snippetsAdded++;
    out.push(base);
  }
  return out;
}

// Folders: create/match by name, building the xid -> id map.
async function importFolders(fOs, inputFolders, folderByName, report) {
  const xidToId = new Map();
  for (const f of inputFolders) {
    const name = String(f.name || '').trim();
    if (!name) continue;
    const existing = folderByName.get(name);
    if (existing) { xidToId.set(f.xid, existing.id); continue; }
    const rec = { name, parentId: 0, createdAt: Date.now() };
    const id = await p(fOs.add(rec));
    xidToId.set(f.xid, id);
    folderByName.set(name, Object.assign({ id }, rec));
    report.foldersAdded++;
  }
  return xidToId;
}

// Second pass once all folder ids are known: restore parent links.
async function linkFolderParents(fOs, inputFolders, xidToId) {
  for (const f of inputFolders) {
    if (!f.parentXid) continue;
    const id = xidToId.get(f.xid), pid = xidToId.get(f.parentXid);
    if (id != null && pid != null) {
      const rec = await p(fOs.get(id));
      if (rec) { rec.parentId = pid; fOs.put(rec); }
    }
  }
}

function buildSnippetRecord(s, xidToId, now) {
  const folderXid = s.folderXid;
  const folderId = folderXid && xidToId.get(folderXid) != null ? xidToId.get(folderXid) : 0;
  return {
    name: String(s.name || '').trim(),
    description: s.description || '',
    contentText: s.contentText || '',
    contentHtml: s.contentHtml || '',
    folderId,
    tags: Array.isArray(s.tags) ? s.tags.filter(Boolean) : [],
    createdAt: s.createdAt ? Date.parse(s.createdAt) || now : now,
    updatedAt: now,
  };
}

function renamedCandidate(name, snippetByName) {
  let n = 2, candidate;
  do { candidate = name + '-' + n++; } while (snippetByName.has(candidate));
  return candidate;
}
