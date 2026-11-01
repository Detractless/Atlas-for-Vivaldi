import fs from "fs";
import path from "path";
import crypto from "crypto";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import { validateManifest, DEFAULT_ROOT } from "./nsfw_eval_manifest.mjs";
import { summarize } from "./nsfw_eval_metrics.mjs";

const require = createRequire(import.meta.url);
const ort = require("onnxruntime-node");
const sharp = require("sharp");

function parseArgs(argv) {
  const args = { root: DEFAULT_ROOT, modelsDir: null, out: null, models: null, limit: 0 };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--root") args.root = argv[++i];
    else if (a === "--models-dir") args.modelsDir = argv[++i];
    else if (a === "--out") args.out = argv[++i];
    else if (a === "--models") args.models = argv[++i].split(",");
    else if (a === "--limit") args.limit = Number(argv[++i]) || 0;
  }
  return args;
}

export function toTensor(rgb, side, mean, std) {
  const plane = side * side;
  const data = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i += 1) {
    for (let c = 0; c < 3; c += 1) {
      data[c * plane + i] = (rgb[i * 3 + c] / 255 - mean[c]) / std[c];
    }
  }
  return data;
}

export function softmax(logits) {
  const max = Math.max(...Array.from(logits));
  const exps = Array.from(logits, (z) => Math.exp(z - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sum);
}

export function explicitScore(logits, explicitFrom) {
  const probs = softmax(logits);
  return explicitFrom.reduce((acc, i) => acc + (probs[i] ?? 0), 0);
}

async function loadModels(modelsDir, only) {
  const config = JSON.parse(fs.readFileSync(path.join(modelsDir, "models.json"), "utf8"));
  const sessions = [];
  for (const m of config.models.filter((x) => !only || only.includes(x.id))) {
    const file = path.join(modelsDir, m.file);
    if (!fs.existsSync(file)) throw new Error(`missing model file: ${file}`);
    if (m.sha256) {
      const digest = crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
      if (digest !== m.sha256) throw new Error(`sha256 mismatch for ${m.file}: ${digest}`);
    }
    sessions.push({ config: m, session: await ort.InferenceSession.create(file) });
  }
  return sessions;
}

async function scoreImage(entry, imagePath) {
  const { config, session } = entry;
  const raw = await sharp(imagePath)
    .rotate()
    .resize(config.size, config.size, { fit: "fill", kernel: "cubic" })
    .toColourspace("srgb")
    .removeAlpha()
    .raw()
    .toBuffer();
  const tensor = new ort.Tensor("float32", toTensor(raw, config.size, config.mean, config.std), [1, 3, config.size, config.size]);
  const started = performance.now();
  const out = await session.run({ [session.inputNames[0]]: tensor });
  const ms = performance.now() - started;
  return { score: explicitScore(out[session.outputNames[0]].data, config.explicit_from), ms };
}

async function buildRecords(root, images, sessions) {
  const records = [];
  for (const s of sessions) {
    for (const image of images) {
      const { score, ms } = await scoreImage(s, path.join(root, image.path));
      records.push({
        model: s.config.id,
        path: image.path,
        label: image.label,
        reason: image.reason,
        score: +score.toFixed(6),
        ms: +ms.toFixed(1),
      });
    }
  }
  return records;
}

export function buildSummary(records) {
  const models = {};
  for (const id of [...new Set(records.map((r) => r.model))]) {
    models[id] = summarize(records.filter((r) => r.model === id));
  }
  return models;
}

function formatSummary(models) {
  const lines = [];
  for (const [id, s] of Object.entries(models)) {
    lines.push(`${id}: n=${s.counts.total} benign=${s.counts.benign} leak=${s.counts.leak} p50=${s.latency.p50}ms p95=${s.latency.p95}ms`);
    lines.push(`  matched-fp<=${s.matchedFp.maxFp}: threshold=${s.matchedFp.threshold} catch=${s.matchedFp.catch}`);
    for (const [t, p] of Object.entries(s.points)) lines.push(`  t=${t} catch=${p.catch} false-block=${p.falseBlock}`);
  }
  return lines.join("\n");
}

async function runEval(args) {
  const root = path.resolve(args.root);
  const modelsDir = path.resolve(args.modelsDir ?? path.join(root, "models"));
  const checked = validateManifest({ root });
  if (!checked.ok) {
    for (const e of checked.errors) console.error(`- ${e}`);
    throw new Error(`eval set is not ready: ${checked.errors.length} problems`);
  }
  const images = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8")).images;
  const sessions = await loadModels(modelsDir, args.models);
  const records = await buildRecords(root, args.limit > 0 ? images.slice(0, args.limit) : images, sessions);
  const summary = buildSummary(records);
  const out = path.resolve(args.out ?? path.join(root, "runs", new Date().toISOString().replace(/[:.]/g, "-")));
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, "per-image.json"), JSON.stringify(records, null, 2));
  fs.writeFileSync(path.join(out, "summary.json"), JSON.stringify({ when: new Date().toISOString(), root, models: summary }, null, 2));
  console.log(formatSummary(summary));
  console.log(`written to ${out}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runEval(parseArgs(process.argv.slice(2))).catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
}
