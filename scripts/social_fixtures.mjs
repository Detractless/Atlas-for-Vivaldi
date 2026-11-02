// Turns a live review (scripts/social_live_check.mjs <site>) into the offline fixtures that tests/unit/social_fixtures.test.js
// replays: a trimmed snapshot of each reviewed page, and how many elements each part's selectors matched on it.
//
//   node scripts/social_fixtures.mjs <site> [--from /tmp/atlas-social-review]
//
// Only parts whose review passed (found something visible, hid it, no guard trip) are recorded, so a fixture is
// evidence that the selector worked on that day. Snapshots over 600 KB are skipped: trim the page in the plan.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const site = args[0];
if (!site) { console.error("usage: node scripts/social_fixtures.mjs <site> [--from dir]"); process.exit(2); }
const fromIdx = args.indexOf("--from");
const from = path.resolve(fromIdx >= 0 ? args[fromIdx + 1] : "/tmp/atlas-social-review", site);
const outDir = path.join(ROOT, "tests", "fixtures", "social");

const report = JSON.parse(fs.readFileSync(path.join(from, "report.json"), "utf8"));
const manifestFile = path.join(outDir, `${site}.json`);
const manifest = fs.existsSync(manifestFile) ? JSON.parse(fs.readFileSync(manifestFile, "utf8")) : {};
fs.mkdirSync(outDir, { recursive: true });

for (const pg of report.pages) {
  if (pg.error) { console.log(`${pg.name}: skipped (review error)`); continue; }
  const passed = pg.parts.filter((p) => p.status === "pass");
  const snap = path.join(from, pg.name, "snapshot.html");
  if (!passed.length || !fs.existsSync(snap)) { console.log(`${pg.name}: nothing to record`); continue; }
  if (fs.statSync(snap).size > 600 * 1024) { console.log(`${pg.name}: snapshot too large, skipped`); continue; }
  // One line per snapshot: the repo's size rule counts lines, and a snapshot is data, not code.
  fs.writeFileSync(path.join(outDir, `${site}-${pg.name}.html`), fs.readFileSync(snap, "utf8").replace(/\s*\r?\n\s*/g, " "));
  manifest[pg.name] = { url: pg.url, matches: Object.fromEntries(passed.map((p) => [p.part, p.before.matches])) };
  console.log(`${pg.name}: recorded ${passed.length} parts`);
}
fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 1) + "\n");
