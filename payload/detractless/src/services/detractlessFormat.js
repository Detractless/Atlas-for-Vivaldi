// src/services/detractlessFormat.js — .detractless ZIP archive format (read + write).
//
// v2 layout — namespaced, so one archive can hold data from several devices:
//   manifest.json                       format, version, exportedAt, producers[]
//   newtab/config.json                  this extension's export (generateExportData())
//   launcher/*.json                     the Android launcher's data sets — NOT ours
//   shared/pastekit/manifest.json       folders[] from PasteKit buildExport()
//   shared/pastekit/lists/snippets.csv  snippet rows
//   shared/notes.json, shared/events.json   another device's data — read by nobody here
//
// THE PASS-THROUGH RULE: this module rewrites only the namespaces it owns
// (`newtab/`, `shared/pastekit/`, and the manifest). Every other entry in the
// archive we last read is copied out byte-for-byte — including namespaces that
// did not exist when this code was written. That is what lets the phone and the
// browser write to one file without erasing each other.
//
// Notes and events were removed from this extension. They are NOT parsed, written
// or understood here any more, but they are also not owned, so an archive that
// carries them keeps them: the pass-through rule alone is what protects another
// device's data now.
//
// v1 layout (still readable, never written):
//   manifest.json + config.json + pastekit/**        ← old extension archive
//   manifest.json + settings.json, notes.json, …     ← old launcher archive
//
// Import sniffing: callers check the first two bytes (PK = 0x50 0x4B) to
// distinguish this ZIP from the legacy JSON export.
import { zipSync, inflateSync, strToU8, strFromU8 } from 'fflate';
// ZIP-directory helpers from inside fflate (exported by our vendored copy, see
// vendor/fflate/README.md). openArchive reads the directory with them so it can
// inflate one entry at a time.
import { b2, b4, zh, slzh, slc, u8 } from 'fflate';

const FORMAT = 'detractless';
const FORMAT_VERSION = 2;
const CREATOR = 'Detractless/3.0.0';
const PRODUCER = 'newtab/3.0.0';

// Namespaces and the entries this module owns.
const FILE_MANIFEST = 'manifest.json';
const NEWTAB_CONFIG = 'newtab/config.json';
const SHARED_PK_MANIFEST = 'shared/pastekit/manifest.json';
const SHARED_PK_CSV = 'shared/pastekit/lists/snippets.csv';

// v1 entry names, read-only.
const V1_CONFIG = 'config.json';
const V1_PK_MANIFEST = 'pastekit/manifest.json';
const V1_PK_CSV = 'pastekit/lists/snippets.csv';

// An entry is ours to rewrite if it is the manifest or sits under one of these.
// `shared/notes.json` and `shared/events.json` are deliberately absent: this
// extension no longer reads or writes them, so they must pass through untouched
// rather than be rewritten from a local state that no longer exists.
const OWNED_PREFIXES = ['newtab/', 'shared/pastekit/'];

// The credential namespace from the removed sync feature. Nothing writes it any
// more, but archives created before the removal still carry a GitHub PAT at
// `sync/config.json`. Importing one and re-exporting it must not republish that
// token, so the strip below stays permanently.
const SYNC_PREFIX = 'sync/';

function isOwnedEntry(path) {
  return path === FILE_MANIFEST || OWNED_PREFIXES.some((p) => path.startsWith(p));
}

// ─── CSV helpers (mirrors pastekitFormat.js — kept private/self-contained) ───

const CSV_COLS = ['name', 'description', 'contentText', 'contentHtml', 'tags', 'folderXid', 'createdAt', 'updatedAt'];

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
  const rows = [];
  const state = { row: [], field: '', inQuote: false };
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

// ─── Public API ───────────────────────────────────────────────────────────────

// Merge this device's producer id into whatever the previous manifest recorded,
// so an archive names every app that has written to it.
function mergeProducers(previousManifest) {
  const prior = Array.isArray(previousManifest && previousManifest.producers)
    ? previousManifest.producers.filter((p) => typeof p === 'string' && p !== PRODUCER)
    : [];
  return [...prior, PRODUCER];
}

/**
 * Build a .detractless ZIP archive (v2).
 *
 * @param {object} opts
 * @param {object} opts.detractlessConfig  Result of generateExportData() — stored verbatim.
 * @param {object} opts.pastekitExport     Result of buildExport() — { folders, snippets }.
 * @param {object} [opts.passthrough]      Entry map from the archive we last read
 *   (importDetractless(...).entries). Every entry we do not own is copied out
 *   unchanged. Omit for a standalone local export.
 * @returns {Uint8Array}
 */
export function exportDetractless({ detractlessConfig, pastekitExport, passthrough }) {
  const now = new Date().toISOString();

  let previousManifest = null;
  if (passthrough && passthrough[FILE_MANIFEST]) {
    try { previousManifest = JSON.parse(strFromU8(passthrough[FILE_MANIFEST])); }
    catch (_) { /* unreadable prior manifest — start a fresh producers list */ }
  }

  const outerManifest = {
    format: FORMAT,
    version: FORMAT_VERSION,
    createdBy: CREATOR,
    exportedAt: now,
    producers: mergeProducers(previousManifest),
  };

  const pkFolders = (pastekitExport.folders || []).map(f => ({
    xid: f.xid,
    name: f.name,
    parentXid: f.parentXid || null,
  }));

  const pkManifest = {
    format: 'pastekit',
    version: 1,
    createdBy: CREATOR,
    exportedAt: now,
    folders: pkFolders,
  };

  const csvRows = (pastekitExport.snippets || []).map(s => ({
    name: s.name || '',
    description: s.description || '',
    contentText: s.contentText || '',
    contentHtml: s.contentHtml || '',
    tags: (s.tags || []).join(';'),
    folderXid: s.folderXid || '',
    createdAt: s.createdAt || '',
    updatedAt: s.updatedAt || '',
  }));

  const entries = {};

  // 1. Everything we do NOT own, copied verbatim from the archive we read.
  //    v1 entries are skipped: importDetractless has already lifted them into
  //    our namespaces, so re-emitting them would duplicate the data.
  if (passthrough) {
    for (const [path, bytes] of Object.entries(passthrough)) {
      if (isOwnedEntry(path)) continue;
      if (path === V1_CONFIG || path.startsWith('pastekit/')) continue;
      // THE CREDENTIAL GUARD. `sync/` never survives an export. Archives written
      // before sync was removed contain a GitHub PAT at sync/config.json, and
      // importing one then exporting it is exactly how that token would end up
      // somewhere public. Nothing reintroduces it now, in any code path.
      if (path === SYNC_PREFIX.slice(0, -1) || path.startsWith(SYNC_PREFIX)) continue;
      entries[path] = bytes;
    }
  }

  // 2. Our own namespaces, freshly written.
  entries[FILE_MANIFEST] = strToU8(JSON.stringify(outerManifest, null, 2));
  entries[NEWTAB_CONFIG] = strToU8(JSON.stringify(detractlessConfig, null, 2));
  entries[SHARED_PK_MANIFEST] = strToU8(JSON.stringify(pkManifest, null, 2));
  entries[SHARED_PK_CSV] = strToU8(toCsv(csvRows));

  return zipSync(entries);
}

// Parse the PasteKit pair (manifest + CSV) from wherever it lives.
function parsePastekit(manifestBytes, csvBytes) {
  let pkManifest;
  try {
    pkManifest = JSON.parse(strFromU8(manifestBytes));
  } catch (_) {
    throw new Error('.detractless: pastekit manifest is not valid JSON');
  }

  const folders = (pkManifest.folders || []).map(f => ({
    xid: f.xid,
    name: f.name,
    parentXid: f.parentXid || null,
  }));

  const rows = parseCsv(strFromU8(csvBytes));
  let snippets = [];
  if (rows.length >= 2) {
    const headers = rows[0].map(h => h.trim().toLowerCase());
    const col = (row, name) => { const idx = headers.indexOf(name); return idx === -1 ? '' : (row[idx] || ''); };
    snippets = rows.slice(1)
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
  }
  return { folders, snippets };
}

/**
 * Which layout an archive uses. v1 archives came from two different apps that
 * both stamped `version: 1`, so the entry names are the only way to tell them
 * apart — hence sniffing rather than trusting the manifest alone.
 */
function detectLayout(entries, version) {
  if (version >= 2) return 'v2';
  if (entries[V1_CONFIG]) return 'v1-newtab';
  // A v1 launcher archive: flat data files, no config.json.
  if (entries['settings.json'] || entries['notes.json'] || entries['events.json']) return 'v1-launcher';
  return 'unknown';
}

/**
 * Parse a .detractless ZIP archive (ArrayBuffer or Uint8Array).
 *
 * Returns:
 *   version           — declared archive version
 *   layout            — 'v2' | 'v1-newtab' | 'v1-launcher'
 *   detractlessConfig — this extension's config object, or null if the archive
 *                       carries none (e.g. a launcher-only archive)
 *   pastekitData      — { folders, snippets } ready to pass to importJson, or null
 *   entries           — the raw entry map, for exportDetractless({ passthrough })
 *
 * Throws a descriptive Error on bad input.
 */
export function importDetractless(rawEntries) {
  // rawEntries is a {filename: Uint8Array} map, produced by openArchive's
  // async chunked inflate. Normalize path separators then proceed.
  let entries;
  entries = rawEntries;

  // Normalize path separators. PowerShell and some Windows ZIP tools store
  // entry names with backslashes. fflate returns raw bytes, so a lookup for
  // 'newtab/config.json' would silently miss 'newtab\\config.json'. One
  // remapping pass makes imports work regardless of which tool created the ZIP.
  const normalizedEntries = {};
  for (const [path, bytes] of Object.entries(entries)) {
    normalizedEntries[path.replace(/\\/g, '/')] = bytes;
  }
  entries = normalizedEntries;

  if (!entries[FILE_MANIFEST]) throw new Error('.detractless: manifest.json missing');

  let outerManifest;
  try {
    outerManifest = JSON.parse(strFromU8(entries[FILE_MANIFEST]));
  } catch (_) {
    throw new Error('.detractless: manifest.json is not valid JSON');
  }
  if (outerManifest.format !== FORMAT) throw new Error('Not a Detractless archive');
  const version = parseInt(outerManifest.version, 10);
  if (!Number.isFinite(version)) throw new Error('.detractless: missing version');
  if (version > FORMAT_VERSION) {
    throw new Error(`.detractless: file is from a newer version (${version}) — update Detractless to open it`);
  }

  const layout = detectLayout(entries, version);
  if (layout === 'unknown') {
    throw new Error('.detractless: unrecognised archive layout (no newtab or launcher data)');
  }

  // Our config: namespaced in v2, top-level in v1. A launcher-only archive has
  // none — that is valid, and the caller reports that nothing applied to it.
  const configPath = layout === 'v2' ? NEWTAB_CONFIG : V1_CONFIG;
  let detractlessConfig = null;
  if (entries[configPath]) {
    try {
      detractlessConfig = JSON.parse(strFromU8(entries[configPath]));
    } catch (_) {
      throw new Error(`.detractless: ${configPath} is not valid JSON`);
    }
  }

  // PasteKit data is optional — an archive without snippets is still valid.
  const pkManifestBytes = entries[SHARED_PK_MANIFEST] || entries[V1_PK_MANIFEST];
  const pkCsvBytes      = entries[SHARED_PK_CSV]      || entries[V1_PK_CSV];
  const pastekitData = (pkManifestBytes && pkCsvBytes)
    ? parsePastekit(pkManifestBytes, pkCsvBytes)
    : null;

  // Notes and events are intentionally not read. They stay in `entries` and ride
  // back out through the pass-through rule if this archive is re-exported.
  return { version, layout, detractlessConfig, pastekitData, entries };
}

/**
 * Build the bytes that actually leave this device — the ONLY export boundary.
 *
 * Archive encryption was removed with the rest of the lock feature, so this is now
 * a thin wrapper over exportDetractless. It is kept as the named export boundary
 * because every caller goes through it, and because the `sync/` strip it relies on
 * is the guard that stops a legacy archive's GitHub token being re-published.
 */
export async function packageArchive({ detractlessConfig, pastekitExport, passthrough }) {
  return exportDetractless({ detractlessConfig, pastekitExport, passthrough });
}

/** Read an archive. Kept async so callers do not all have to change. */
export async function openArchive(buffer) {
  // Decompress the ZIP entries one at a time, yielding between each inflate
  // call so the main thread stays responsive. A .detractless archive only
  // contains 3-5 small files so the loop completes quickly.
  const input = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);

  // Step 1: Parse the ZIP central directory (fast, no decompression)
  const data = input;
  let e = data.length - 22;
  for (; b4(data, e) !== 101010256; --e) {
    if (!e || data.length - e > 65558) throw new Error("Not a valid .detractless file (could not unzip)");
  }
  let c = b2(data, e + 8);
  if (!c) return importDetractless({});
  let o = b4(data, e + 16);
  const z = b4(data, e - 20) === 117853008 && (() => {
    const ze = b4(data, e - 12);
    if (b4(data, ze) === 101075792) { c = b4(data, ze + 32); o = b4(data, ze + 48); return true; }
    return false;
  })();

  // Step 2: Collect file descriptors (no decompression yet)
  const fileDescs = [];
  let pos = o;
  for (let i = 0; i < c; ++i) {
    const [c_2, sc, su, fn, no, off] = zh(data, pos, z);
    const b = slzh(data, off);
    fileDescs.push({ c_2, sc, su, fn, b });
    pos = no;
  }

  // Step 3: Inflate each file with an event-loop yield between each
  const entries = {};
  for (const { c_2, sc, su, fn, b } of fileDescs) {
    if (!c_2) {
      entries[fn] = slc(data, b, b + sc);
    } else if (c_2 === 8) {
      if (typeof DecompressionStream !== "undefined") {
        try {
          const ds = new DecompressionStream("deflate-raw");
          const writer = ds.writable.getWriter();
          writer.write(data.subarray(b, b + sc));
          writer.close();
          const response = new Response(ds.readable);
          entries[fn] = new Uint8Array(await response.arrayBuffer());
        } catch (e) {
          await new Promise((r) => setTimeout(r, 0));
          entries[fn] = inflateSync(data.subarray(b, b + sc), { out: new u8(su) });
        }
      } else {
        // Yield so the UI can paint / respond before blocking inflate call
        await new Promise((r) => setTimeout(r, 0));
        entries[fn] = inflateSync(data.subarray(b, b + sc), { out: new u8(su) });
      }
    }
  }

  return importDetractless(entries);
}

/**
 * True if the given ArrayBuffer or Uint8Array starts with the ZIP magic bytes PK.
 *
 * DTRL containers no longer exist, so this and isDetractlessFile now answer the
 * same question. Both are kept: call sites mean different things by them, and
 * collapsing them would make the format sniffing harder to follow, not easier.
 */
export function isDetractlessArchive(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  return bytes[0] === 0x50 && bytes[1] === 0x4B;
}

/** True if this is one of our archive files. */
export function isDetractlessFile(buffer) {
  return isDetractlessArchive(buffer);
}
