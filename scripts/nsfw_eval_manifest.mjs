import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const DEFAULT_ROOT = path.join(os.homedir(), "atlas-nsfw-eval");
const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
const LABELS = new Set(["benign", "leak"]);

function checkRoot(root, repoRoot, errors) {
  const rel = path.relative(repoRoot, root);
  if (rel === "") {
    errors.push(`eval root is the repository itself: ${root}`);
  } else if (rel && !rel.startsWith("..") && !path.isAbsolute(rel)) {
    errors.push(`eval root is inside the repository: ${root}`);
  }
}

function readManifest(root, errors) {
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
    if (manifest.version !== 1) errors.push(`unsupported manifest version: ${manifest.version}`);
    if (!Array.isArray(manifest.images)) errors.push("manifest.images must be an array");
    return Array.isArray(manifest.images) ? manifest.images : [];
  } catch (e) {
    errors.push(`cannot read manifest.json: ${e.message}`);
    return [];
  }
}

function checkEntries(images, root, errors, listed) {
  const seen = new Set();
  for (const entry of images) {
    const p = entry && entry.path;
    if (typeof p !== "string" || !p) {
      errors.push("entry without a path");
      continue;
    }
    if (path.isAbsolute(p) || p.split("/").includes("..")) {
      errors.push(`entry path must be relative and stay inside: ${p}`);
      continue;
    }
    if (!LABELS.has(entry.label)) {
      errors.push(`unknown label for ${p}: ${entry.label}`);
      continue;
    }
    if (!p.startsWith(`${entry.label}/`)) {
      errors.push(`path does not match label for ${p}`);
      continue;
    }
    if (typeof entry.reason !== "string" || !entry.reason.trim()) {
      errors.push(`entry needs a reason: ${p}`);
      continue;
    }
    if (seen.has(p)) {
      errors.push(`duplicate entry: ${p}`);
      continue;
    }
    seen.add(p);
    if (!IMAGE_EXT.has(path.extname(p).toLowerCase())) {
      errors.push(`not an image file: ${p}`);
      continue;
    }
    listed[entry.label].add(p);
    if (!fs.existsSync(path.join(root, p))) errors.push(`file missing: ${p}`);
  }
}

function scanFolders(root, errors, listed) {
  for (const label of LABELS) {
    const dir = path.join(root, label);
    if (!fs.existsSync(dir)) {
      errors.push(`missing folder: ${label}/`);
      continue;
    }
    for (const name of fs.readdirSync(dir)) {
      if (name.startsWith(".")) continue;
      if (!IMAGE_EXT.has(path.extname(name).toLowerCase())) continue;
      const p = `${label}/${name}`;
      if (!listed[label].has(p)) errors.push(`image not in manifest: ${p}`);
    }
  }
}

export function validateManifest(options = {}) {
  const root = path.resolve(options.root ?? DEFAULT_ROOT);
  const repoRoot = options.repoRoot ?? REPO_ROOT;
  const errors = [];
  const listed = { benign: new Set(), leak: new Set() };
  checkRoot(root, repoRoot, errors);
  const images = readManifest(root, errors);
  checkEntries(images, root, errors, listed);
  scanFolders(root, errors, listed);
  return {
    ok: errors.length === 0,
    root,
    errors,
    stats: { benign: listed.benign.size, leak: listed.leak.size, total: listed.benign.size + listed.leak.size },
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = validateManifest({ root: process.argv[2] });
  if (result.ok) {
    console.log(`ok ${result.root}: ${result.stats.benign} benign, ${result.stats.leak} leak`);
  } else {
    for (const e of result.errors) console.log(`- ${e}`);
    console.log(`${result.errors.length} problems in ${result.root}`);
    process.exitCode = 1;
  }
}
