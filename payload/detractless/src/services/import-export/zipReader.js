// src/services/import-export/zipReader.js — reads a ZIP into {filename: Uint8Array}, one entry
// at a time, yielding to the event loop between entries so a big import does not
// freeze the page. Uses fflate's internal directory helpers (exported by our
// vendored copy, see vendor/fflate/README.md).
import { inflateSync } from 'fflate';
import { b2, b4, zh, slzh, slc, u8 } from 'fflate';

/** Throws "Not a valid .detractless file (could not unzip)" when there is no ZIP directory. */
/* The central directory: where it starts, how many entries, ZIP64 if present.
   Throws when there is no ZIP end record to find. */
function readCentralDirectory(data) {
  let e = data.length - 22;
  for (; b4(data, e) !== 101010256; --e) {
    if (!e || data.length - e > 65558) throw new Error("Not a valid .detractless file (could not unzip)");
  }
  let count = b2(data, e + 8);
  if (!count) return { count: 0, offset: 0, zip64: false };
  let offset = b4(data, e + 16);
  const zip64 = b4(data, e - 20) === 117853008 && (() => {
    const ze = b4(data, e - 12);
    if (b4(data, ze) === 101075792) { count = b4(data, ze + 32); offset = b4(data, ze + 48); return true; }
    return false;
  })();
  return { count, offset, zip64 };
}

/* Name, sizes and data offset for each entry, read straight from the directory. */
function collectFileHeaders(data, count, start, zip64) {
  const fileDescs = [];
  let pos = start;
  for (let i = 0; i < count; ++i) {
    const [c_2, sc, su, fn, no, off] = zh(data, pos, zip64);
    fileDescs.push({ c_2, sc, su, fn, b: slzh(data, off) });
    pos = no;
  }
  return fileDescs;
}

/* One entry: stored bytes copied, deflated bytes inflated. The stream path is
   tried first; either way the event loop yields so the page stays responsive. */
async function inflateEntry(data, { c_2, sc, su, b }) {
  if (!c_2) return slc(data, b, b + sc);
  if (c_2 !== 8) return undefined;
  const raw = data.subarray(b, b + sc);
  if (typeof DecompressionStream !== "undefined") {
    try {
      const ds = new DecompressionStream("deflate-raw");
      const writer = ds.writable.getWriter();
      writer.write(raw);
      writer.close();
      const response = new Response(ds.readable);
      return new Uint8Array(await response.arrayBuffer());
    } catch (_) { /* fall through to the blocking inflate below */ }
  }
  await new Promise((r) => setTimeout(r, 0));
  return inflateSync(raw, { out: new u8(su) });
}

/** Throws "Not a valid .detractless file (could not unzip)" when there is no ZIP directory. */
export async function readZipEntries(buffer) {
  const input = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const { count, offset, zip64 } = readCentralDirectory(input);
  if (!count) return {};

  const entries = {};
  for (const desc of collectFileHeaders(input, count, offset, zip64)) {
    const bytes = await inflateEntry(input, desc);
    if (bytes) entries[desc.fn] = bytes;
  }
  return entries;
}
