// src/utils/pastekitFormat.js — .pastekit ZIP archive format (read + write).
// Format layout:
//   manifest.json  — version, exportedAt, createdBy, folders[]
//   lists/snippets.csv — tabular snippet rows
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';

const FORMAT_VERSION = 1;
const CREATOR = 'Pastekit-v2-zerodep/0.3.0';
const CSV_COLS = ['name', 'description', 'contentText', 'contentHtml', 'tags', 'folderXid', 'createdAt', 'updatedAt'];

// --------------------------------- CSV helpers --------------------------------

function csvEscape(val) {
  const s = String(val == null ? '' : val);
  if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r'))
    return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function toCsv(rows) {
  const lines = [CSV_COLS.map(csvEscape).join(',')];
  for (const row of rows) lines.push(CSV_COLS.map(h => csvEscape(row[h])).join(','));
  return lines.join('\r\n');
}

function advanceQuoted(state, text, i) {
  const ch = text[i];
  if (ch !== '"') { state.field += ch; return i + 1; }
  if (text[i + 1] === '"') { state.field += '"'; return i + 2; }
  state.inQuote = false;
  return i + 1;
}

function flushRow(state, rows, text, i) {
  state.row.push(state.field);
  state.field = '';
  let next = i + 1;
  if (text[i] === '\r' && text[i + 1] === '\n') next++;
  if (state.row.some(c => c !== '')) rows.push(state.row);
  state.row = [];
  return next;
}

function parseCsv(text) {
  /** @type {string[][]} */
  const rows = [];
  const state = { row: /** @type {string[]} */ ([]), field: '', inQuote: false };
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (state.inQuote) { i = advanceQuoted(state, text, i); continue; }
    if (ch === '"') { state.inQuote = true; i++; continue; }
    if (ch === ',') { state.row.push(state.field); state.field = ''; i++; continue; }
    if (ch === '\r' || ch === '\n') { i = flushRow(state, rows, text, i); continue; }
    state.field += ch;
    i++;
  }
  if (state.field || state.row.length) {
    state.row.push(state.field);
    if (state.row.some(c => c !== '')) rows.push(state.row);
  }
  return rows;
}

// --------------------------------- public API ---------------------------------

/**
 * Build a .pastekit ZIP archive from a buildExport() result.
 * Returns a Uint8Array ready to download.
 */
export function exportPastekit({ folders, snippets }) {
  const manifest = {
    format: 'pastekit',
    version: FORMAT_VERSION,
    createdBy: CREATOR,
    exportedAt: new Date().toISOString(),
    folders: (folders || []).map(f => ({
      xid: f.xid,
      name: f.name,
      parentXid: f.parentXid || null,
    })),
  };

  const csvRows = (snippets || []).map(s => ({
    name: s.name || '',
    description: s.description || '',
    contentText: s.contentText || '',
    contentHtml: s.contentHtml || '',
    tags: (s.tags || []).join(';'),
    folderXid: s.folderXid || '',
    createdAt: s.createdAt || '',
    updatedAt: s.updatedAt || '',
  }));

  return zipSync({
    'manifest.json': strToU8(JSON.stringify(manifest, null, 2)),
    'lists/snippets.csv': strToU8(toCsv(csvRows)),
  });
}

/**
 * Parse a .pastekit ZIP archive (ArrayBuffer or Uint8Array).
 * Returns { folders, snippets } compatible with importJson() in db.js.
 * Throws a descriptive Error on bad input.
 */
export function importPastekit(buffer) {
  let unzipped;
  try {
    unzipped = unzipSync(buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer));
  } catch (_) {
    throw new Error('Not a valid .pastekit file');
  }

  if (!unzipped['manifest.json']) throw new Error('.pastekit: manifest.json missing');
  if (!unzipped['lists/snippets.csv']) throw new Error('.pastekit: lists/snippets.csv missing');

  let manifest;
  try {
    manifest = JSON.parse(strFromU8(unzipped['manifest.json']));
  } catch (_) {
    throw new Error('.pastekit: manifest.json is not valid JSON');
  }

  if (manifest.format !== 'pastekit') throw new Error('Not a Pastekit archive');
  const v = parseInt(manifest.version, 10);
  if (!Number.isFinite(v)) throw new Error('.pastekit: missing version');
  if (v > FORMAT_VERSION) throw new Error('.pastekit: file is from a newer Pastekit version (' + v + ')');

  const folders = (manifest.folders || []).map(f => ({
    xid: f.xid,
    name: f.name,
    parentXid: f.parentXid || null,
  }));

  const csvText = strFromU8(unzipped['lists/snippets.csv']);
  const rows = parseCsv(csvText);
  if (rows.length < 2) return { folders, snippets: [] };

  const headers = rows[0].map(h => h.trim().toLowerCase());
  const col = (row, name) => { const idx = headers.indexOf(name); return idx === -1 ? '' : (row[idx] || ''); };

  const snippets = rows.slice(1)
    .map(row => ({
      name: col(row, 'name'),
      description: col(row, 'description'),
      contentText: col(row, 'contenttext'),
      contentHtml: col(row, 'contenthtml'),
      tags: col(row, 'tags').split(';').map(t => t.trim()).filter(Boolean),
      folderXid: col(row, 'folderxid') || null,
      createdAt: col(row, 'createdat') || null,
      updatedAt: col(row, 'updatedat') || null,
    }))
    .filter(s => s.name);

  return { folders, snippets };
}
