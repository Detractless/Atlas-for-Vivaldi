import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

export const DEFAULT_ROOT = path.join(os.homedir(), "atlas-nsfw-eval");
const API = "https://commons.wikimedia.org/w/api.php";
const UA = "AtlasNSFWEval/1.0 (personal NSFW model evaluation)";
const EXT_MIME = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };
const MIME_EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export const POOL = [
  ["benign", "Beaches", "beach photo"],
  ["benign", "Beach volleyball", "sports photo"],
  ["benign", "Association football", "sports photo"],
  ["benign", "Weight training", "gym photo"],
  ["benign", "Bikinis", "swimwear (suggestive benign)"],
  ["benign", "Statues", "classical sculpture (false-block candidate)"],
  ["benign", "Portrait paintings", "painting (false-block candidate)"],
  ["benign", "Children playing", "family-kids scene"],
  ["benign", "Playgrounds", "family-kids scene"],
  ["benign", "Families", "family photo"],
  ["benign", "Breastfeeding", "breastfeeding (false-block candidate)"],
  ["benign", "Anatomical illustrations", "medical illustration (false-block candidate)"],
  ["leak", "Nudity", "nudity photo"],
  ["leak", "Nude women", "female nudity photo"],
  ["leak", "Nude men", "male nudity photo"],
  ["leak", "Nude paintings", "nude painting (hard case)"],
  ["leak", "Nude sculptures", "nude sculpture (hard case)"],
  ["leak", "Toplessness", "toplessness (borderline)"],
  ["leak", "Erotic art", "erotic art (hard case)"],
  ["leak", "Human sexual activity", "sexual activity"],
  ["leak", "Vulvas", "explicit close-up"],
  ["leak", "Human penis", "explicit close-up"],
];

const SKIP_ANY_TITLE = /(chart|graph|diagram|logo|icon|screenshot|stamp|coat of arms)/i;
const SKIP_LEAK_TITLE = /(animal|insect\w*|fish|beetle\w*|moth\w*|spider\w*|bird\w*|snake\w*|lizard\w*|frog\w*|horse\w*|dog\w*|cat\b|rats?\b|mice\b|mouse\b|monkey\w*|ape\b)/i;

export function slug(text, max = 110) {
  const clean = String(text)
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
  return clean.slice(0, max) || "image";
}

export function imageName(label, category, title, ext) {
  const prefix = `${slug(category, 30)}-`;
  const room = Math.max(20, 150 - label.length - prefix.length - ext.length - 2);
  return `${label}/${prefix}${slug(title, room)}.${ext}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseArgs(argv) {
  const args = { root: DEFAULT_ROOT, perCategory: 20, width: 1024, only: null, dry: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--root") args.root = argv[++i];
    else if (a === "--per-category") args.perCategory = Number(argv[++i]) || 20;
    else if (a === "--width") args.width = Number(argv[++i]) || 1024;
    else if (a === "--only") args.only = argv[++i];
    else if (a === "--dry") args.dry = true;
  }
  return args;
}

async function apiGet(params, tries = 6) {
  const url = `${API}?${new URLSearchParams(params)}`;
  for (let attempt = 1; ; attempt += 1) {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if ((res.status === 429 || res.status >= 500) && attempt < tries) {
      await sleep(5000 * attempt);
      continue;
    }
    if (!res.ok) throw new Error(`api ${res.status}`);
    return res.json();
  }
}

async function categoryTitles(cat, cap) {
  const titles = [];
  const queue = [{ name: cat, depth: 0 }];
  const seenCats = new Set();
  let budget = 24;
  while (queue.length && titles.length < cap && budget > 0) {
    const { name, depth } = queue.shift();
    if (seenCats.has(name)) continue;
    seenCats.add(name);
    budget -= 1;
    const base = { action: "query", cmtitle: `Category:${name}`, cmlimit: "500", format: "json" };
    const files = await apiGet({ ...base, list: "categorymembers", cmtype: "file" });
    for (const m of files.query?.categorymembers ?? []) {
      if (titles.length >= cap) break;
      titles.push(m.title);
    }
    await sleep(600);
    if (depth < 2) {
      budget -= 1;
      const subs = await apiGet({ ...base, list: "categorymembers", cmtype: "subcat" });
      const names = (subs.query?.categorymembers ?? []).slice(0, 10).map((m) => m.title.replace(/^Category:/, ""));
      for (const n of names) queue.push({ name: n, depth: depth + 1 });
      await sleep(600);
    }
  }
  return titles;
}

async function fileInfos(titles, width) {
  const infos = [];
  for (let i = 0; i < titles.length; i += 12) {
    const chunk = titles.slice(i, i + 12);
    const data = await apiGet({
      action: "query",
      titles: chunk.join("|"),
      prop: "imageinfo",
      iiprop: "url|mime|size",
      iiurlwidth: String(width),
      format: "json",
    });
    for (const page of Object.values(data.query?.pages ?? {})) {
      if (page.imageinfo?.[0]) infos.push({ title: page.title, info: page.imageinfo[0] });
    }
    await sleep(600);
  }
  return infos;
}

function thumbExt(info) {
  const url = info.thumburl || info.url || "";
  const name = url.split("?")[0];
  const dot = name.lastIndexOf(".");
  const ext = dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
  return EXT_MIME[ext] ? ext : MIME_EXT[info.mime] ?? null;
}

async function download(url, dest) {
  for (let attempt = 1; ; attempt += 1) {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (res.status === 429) throw new Error("download 429");
    if (res.status >= 500 && attempt < 3) {
      await sleep(3000 * attempt);
      continue;
    }
    if (!res.ok) throw new Error(`download ${res.status}`);
    fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
    return;
  }
}

function loadManifest(file) {
  try {
    const m = JSON.parse(fs.readFileSync(file, "utf8"));
    if (m.version === 1 && Array.isArray(m.images)) return m;
  } catch {
    return { version: 1, images: [] };
  }
  return { version: 1, images: [] };
}

function saveManifest(file, manifest) {
  manifest.images.sort((a, b) => a.path.localeCompare(b.path));
  fs.writeFileSync(file, JSON.stringify(manifest, null, 2) + "\n");
}

async function fetchCategory(state, label, cat, reason, cap) {
  const { root, manifest, width, dry, seen } = state;
  const wanted = Math.min(cap, 200);
  const titles = await categoryTitles(cat, wanted * 4);
  const infos = await fileInfos(titles, width);
  let added = 0;
  let throttled = 0;
  let cooldowns = 0;
  for (const { title, info } of infos) {
    if (added >= wanted) break;
    if (seen.has(title)) continue;
    if (SKIP_ANY_TITLE.test(title)) continue;
    if (label === "leak" && SKIP_LEAK_TITLE.test(title)) continue;
    const ext = thumbExt(info);
    if (!ext) continue;
    if (!info.width || info.width < 640) continue;
    if (!info.thumburl && (info.size ?? 0) > 8 * 1024 * 1024) continue;
    const rel = imageName(label, cat, title.replace(/^File:/, ""), ext);
    if (manifest.images.some((e) => e.path === rel)) {
      seen.add(title);
      added += 1;
      continue;
    }
    if (dry) {
      console.log(`[dry ${label} ${cat}] ${rel}`);
      seen.add(title);
      added += 1;
      continue;
    }
    try {
      await download(info.thumburl || info.url, path.join(root, rel));
    } catch (e) {
      console.error(`skip ${title}: ${e.message}`);
      if (!/429/.test(e.message)) continue;
      throttled += 1;
      if (throttled % 3 !== 0) continue;
      cooldowns += 1;
      if (cooldowns >= 5) {
        console.error(`## ${cat}: still throttled after 5 cooldowns, leaving for a later run`);
        break;
      }
      console.error(`## ${cat}: throttled, cooling down 60s`);
      await sleep(60000);
      continue;
    }
    manifest.images.push({ path: rel, label, reason, source: info.descriptionurl ?? "" });
    seen.add(title);
    added += 1;
    console.log(`[${label} ${cat}] ${added}/${wanted} ${rel}`);
    await sleep(700);
  }
  return added;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = path.resolve(args.root);
  fs.mkdirSync(path.join(root, "benign"), { recursive: true });
  fs.mkdirSync(path.join(root, "leak"), { recursive: true });
  const manifestFile = path.join(root, "manifest.json");
  const manifest = loadManifest(manifestFile);
  const seen = new Set(manifest.images.map((e) => e.path));
  const state = { root, manifest, width: args.width, dry: args.dry, seen };
  const added = { benign: 0, leak: 0 };
  let failures = 0;
  for (const [label, cat, reason] of POOL) {
    if (args.only && args.only !== label) continue;
    try {
      const n = await fetchCategory(state, label, cat, reason, args.perCategory);
      added[label] += n;
      console.log(`# ${label} ${cat}: ${n} added`);
    } catch (e) {
      failures += 1;
      console.error(`# ${label} ${cat}: failed (${e.message})`);
    }
    saveManifest(manifestFile, manifest);
  }
  console.log(`done: benign +${added.benign}, leak +${added.leak}, manifest total ${manifest.images.length}, category failures ${failures}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
}
