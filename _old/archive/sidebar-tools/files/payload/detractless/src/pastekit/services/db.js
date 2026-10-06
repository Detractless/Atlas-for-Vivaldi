// src/pastekit/services/db.js — RAW IndexedDB data layer (no Dexie).
// Full CRUD + search + export/import API for snippets, folders, tags.
//
// Rows are stored in the clear. Snippet encryption at rest (Phase 3.6) was removed
// along with the rest of the lock feature, but one consequence of it survives:
//
//   NO INDEXES ON THE SNIPPETS STORE. They were dropped because you cannot index
//   ciphertext, so `name`, `folderId`, `tags` and `updatedAt` queries are linear
//   scans. At personal scale (tens to hundreds of snippets) that is not worth
//   rebuilding. The DB-level UNIQUE constraint on `name` went with them, and
//   `saveSnippet`'s explicit check is still the only thing enforcing it.
import { fuzzyScore } from '../utils/fuzzyMatch.js';
const DB_NAME = 'pastekit', DB_VERSION = 2;
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
    req.onsuccess = () => {
      const db = req.result;
      db.onclose = () => { _dbPromise = null; }; // SW may sleep; reopen lazily
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

// ------------------------------- SNIPPETS ---------------------------------

/** Every stored row, still sealed. Transaction closes before we return. */
async function readSnippetRows() {
  const { os } = await store('snippets');
  return p(os.getAll());
}

/**
 * Every snippet.
 *
 * The single read path. Everything else — search, suggest, tags, export, the
 * folder queries that used to be indexed — is a filter over this. Rows are stored
 * in the clear since encryption was removed, so this is now a plain read.
 */
async function readAllSnippets() {
  return readSnippetRows();
}

export async function listSnippets(folderId) {
  const all = await readAllSnippets();
  if (folderId == null) return all;
  return all.filter((s) => s.folderId === folderId);
}

export async function getSnippetByName(name) {
  // A scan rather than a unique-index lookup. The index went when names moved
  // inside the ciphertext; the rows are plaintext again now, but the scan is kept
  // because it is the ONLY thing enforcing name uniqueness (see saveSnippet).
  const all = await readAllSnippets();
  return all.find((s) => s.name === name) || null;
}

export async function getSnippet(id) {
  const { os } = await store('snippets');
  const row = await p(os.get(id));
  if (!row) return undefined;
  return row;
}

/**
 * Name-only suggestions for the in-page @ autocomplete.
 *
 * Deliberately narrow: fuzzy-ranks over `name` alone (mirroring what the content
 * script used to do locally over a full-list cache), caps the result, and returns
 * ONLY {id, name, description}. The content script fetches the body of the one
 * snippet the user picks, via getSnippet.
 *
 * There is no longer a sensitivity filter here — Phase 3.6 removed per-item tiers.
 * What replaces it is coarser and stronger: while locked, this throws and the
 * content script gets nothing at all. See messageHub.
 */
export async function suggestSnippets(query, limit) {
  const all = await listSnippets(null);
  const raw = String(query || '').trim().toLowerCase();
  const max = Number(limit) > 0 ? Number(limit) : 8;

  const scored = [];
  for (const s of all) {
    const name = s.name || '';
    if (!raw) { scored.push({ s, score: 0 }); continue; }
    const score = fuzzyScore(raw, name.toLowerCase());
    if (score > 0) scored.push({ s, score });
  }
  scored.sort((a, b) => b.score - a.score || byName(a.s, b.s));
  // name + description only: description is the dropdown's tooltip and is
  // user-authored metadata, never the snippet body.
  return scored.slice(0, max).map(({ s }) => ({ id: s.id, name: s.name, description: s.description }));
}

// Fuzzy/substring search over name + description; #tag tokens filter by exact tag.
export async function searchSnippets(query, folderId) {
  const all = await (folderId == null ? listSnippets(null) : listSnippets(folderId));
  const raw = String(query || '').trim().toLowerCase();
  if (!raw) return all.slice().sort(byName);

  // Split out #tag tokens from the free-text remainder.
  const tagFilters = [];
  const textQ = raw.replace(/#(\S+)/g, (_, t) => { tagFilters.push(t); return ''; }).trim();

  const scored = [];
  for (const s of all) {
    // Must match every #tag filter (tag list compared lower-case).
    const sTags = (s.tags || []).map(t => t.toLowerCase());
    if (tagFilters.length && !tagFilters.every(f => sTags.some(t => t === f || t.startsWith(f)))) continue;

    if (!textQ) { scored.push({ s, score: 0 }); continue; }

    const score = fuzzyScore(textQ, (s.name || '').toLowerCase());
    const hay = (s.name + ' ' + (s.description || '') + ' ' + sTags.join(' ')).toLowerCase();
    if (score > 0 || hay.indexOf(textQ) !== -1)
      scored.push({ s, score: score || 0.1 });
  }
  scored.sort((a, b) => b.score - a.score || byName(a.s, b.s));
  return scored.map(x => x.s);
}

function byName(a, b) { return (a.name || '').localeCompare(b.name || ''); }


export async function saveSnippet(snippet) {
  const now = Date.now();
  const rec = Object.assign({}, snippet);
  rec.name = String(rec.name || '').trim();
  if (!rec.name) throw new Error('Snippet name is required');
  rec.folderId = rec.folderId == null ? 0 : rec.folderId;
  rec.tags = Array.isArray(rec.tags) ? rec.tags.filter(Boolean) : [];
  rec.contentText = rec.contentText || '';
  rec.contentHtml = rec.contentHtml || '';
  rec.description = rec.description || '';
  rec.updatedAt = now;
  if (rec.id == null) rec.createdAt = now;
  else if (rec.createdAt == null) rec.createdAt = now;

  // Enforce unique name. This used to be backed by a unique index as well; with
  // the name inside the ciphertext, this check is the ONLY thing enforcing it.
  const existing = await getSnippetByName(rec.name);
  if (existing && existing.id !== rec.id)
    throw new Error('Token already in use: ' + rec.name);

  const { tx, os } = await store('snippets', 'readwrite');
  const key = await p(os.put(rec));
  await txDone(tx);
  return key;
}

export async function deleteSnippet(id) {
  const { tx, os } = await store('snippets', 'readwrite');
  os.delete(id);
  await txDone(tx);
  return true;
}

// -------------------------------- FOLDERS ---------------------------------
export async function listFolders() {
  const { os } = await store('folders');
  const arr = await p(os.getAll());
  return arr.sort(byName);
}

export async function saveFolder(folder) {
  const now = Date.now();
  const rec = Object.assign({}, folder);
  rec.name = String(rec.name || '').trim();
  if (!rec.name) throw new Error('Folder name is required');
  rec.parentId = rec.parentId == null ? 0 : rec.parentId;
  if (rec.id == null) rec.createdAt = now;
  const { tx, os } = await store('folders', 'readwrite');
  const key = await p(os.put(rec));
  await txDone(tx);
  return key;
}

export async function deleteFolder(id) {
  // Move snippets in this folder back to root, then delete the folder.
  //
  // The read stays outside the write transaction. It was split that way because
  // sealing was async and could not run inside one; the split is kept because the
  // folderId index is still gone, so this is a scan either way.
  const all = await readAllSnippets();
  const rows = all.filter((s) => s.folderId === id);
  for (const s of rows) s.folderId = 0;

  const db = await openDB();
  const tx = db.transaction(['folders', 'snippets'], 'readwrite');
  const sOs = tx.objectStore('snippets');
  for (const row of rows) sOs.put(row);
  tx.objectStore('folders').delete(id);
  await txDone(tx);
  return true;
}

// ---------------------------------- TAGS ----------------------------------
export async function listTags() {
  const all = await listSnippets(null);
  const set = new Set();
  for (const s of all) for (const t of (s.tags || [])) set.add(t);
  return Array.from(set).sort();
}

// -------------------------------- SETTINGS --------------------------------
// (Settings primarily live in chrome.storage.local; these are for completeness.)
export async function getSetting(key) {
  const { os } = await store('settings');
  const rec = await p(os.get(key));
  return rec ? rec.value : undefined;
}
export async function putSetting(key, value) {
  const { tx, os } = await store('settings', 'readwrite');
  os.put({ key, value });
  await txDone(tx);
  return true;
}

// ------------------------------ EXPORT / IMPORT ---------------------------
export const FORMAT = 'pastekit-snippets';
export const CURRENT_VERSION = 1;

export async function buildExport() {
  const [folders, snippets] = await Promise.all([listFolders(), listSnippets(null)]);
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

