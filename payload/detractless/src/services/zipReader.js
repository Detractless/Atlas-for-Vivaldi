// src/services/zipReader.js — reads a ZIP into {filename: Uint8Array}, one entry
// at a time, yielding to the event loop between entries so a big import does not
// freeze the page. Uses fflate's internal directory helpers (exported by our
// vendored copy, see vendor/fflate/README.md).
import { inflateSync } from 'fflate';
import { b2, b4, zh, slzh, slc, u8 } from 'fflate';

/** Throws "Not a valid .detractless file (could not unzip)" when there is no ZIP directory. */
export async function readZipEntries(buffer) {
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
  if (!c) return {};
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

  return entries;
}
