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
import { zipSync, strToU8, strFromU8 } from 'fflate';
import { toCsv, parseCsv } from './snippetCsv.js';
import { readZipEntries } from './zipReader.js';

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
  return importDetractless(await readZipEntries(buffer));
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
