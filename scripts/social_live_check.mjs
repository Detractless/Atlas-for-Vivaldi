// Reviews a site's social-media-filter table against the real site, in a throw-away signed-out Vivaldi.
//
//   node scripts/social_live_check.mjs <site> [--page <name>] [--part <id>] [--port 9341] [--out <dir>]
//
// <site> is a key with a plan in scripts/social_live/plans/<site>.mjs. Writes report.json, before/after
// screenshots per part, and a trimmed page snapshot under <out>/<site>/<page>/ (default /tmp/atlas-social-review).
// A page in the plan may also list `checks: [{ part, expr, expect, waitMs }]`: with that part on, `expr` is run in the
// page and must equal `expect` (for behaviour parts such as autoplay). A "pass" means: the part's selectors found something visible, and with the part on nothing of it is visible
// and the guard did not trip. "not-visible" means the selectors found nothing visible on that page (a login
// wall, a part that is not there, or a selector that no longer matches) - read the screenshot.
import fs from "fs";
import path from "path";
import os from "os";
import { launch, shutdown } from "./social_live/cdp.mjs";
import { openPage, closePage, checkPart, checkAll, checkCustom, snapshot, evalIn } from "./social_live/review.mjs";

const args = process.argv.slice(2);
const flag = (name, dflt) => { const i = args.indexOf("--" + name); return i >= 0 ? args[i + 1] : dflt; };
const site = args[0] && !args[0].startsWith("--") ? args[0] : null;
if (!site) { console.error("usage: node scripts/social_live_check.mjs <site> [--page name] [--part id] [--port N] [--out dir]"); process.exit(2); }

const port = Number(flag("port", 9340 + Math.floor(Math.random() * 50)));
const outRoot = path.resolve(flag("out", "/tmp/atlas-social-review"), site);
const onlyPage = flag("page", null), onlyPart = flag("part", null);
const profile = path.join(os.tmpdir(), `atlas-sf-${site}-${port}`);

async function reviewPage(plan, pg) {
  const dir = path.join(outRoot, pg.name);
  const page = await openPage(port, plan.key, pg.url, { settleMs: pg.settleMs, scroll: pg.scroll });
  try {
    const out = { name: pg.name, url: pg.url, parts: [] };
    out.snapshotBytes = await snapshot(page, path.join(dir, "snapshot.html"));
    for (const part of pg.parts.filter((p) => !onlyPart || p === onlyPart)) {
      const hold = pg.hold && pg.hold[part];
      try { out.parts.push(await checkPart(page, part, dir, hold)); } catch (e) { out.parts.push({ part, status: "error", error: String(e.message || e) }); }
    }
    out.custom = [];
    for (const c of (pg.checks || []).filter((x) => !onlyPart || x.part === onlyPart)) {
      try { out.custom.push(await checkCustom(page, c)); } catch (e) { out.custom.push({ part: c.part, status: "error", error: String(e.message || e) }); }
    }
    out.all = await checkAll(page, pg.parts, dir);
    return out;
  } finally { await closePage(port, page); }
}

async function reviewRedirect(plan, rd) {
  const page = await openPage(port, plan.key, rd.url, { initial: { mode: "parts", parts: [rd.part] }, settleMs: 3500, scroll: false });
  try {
    const path_ = await evalIn(page, "location.pathname + location.search", true);
    const status = new RegExp(rd.expectNot).test(path_) ? "fail" : "pass";
    return { part: rd.part, kind: "redirect", from: rd.url, landedOn: path_, status };
  } finally { await closePage(port, page); }
}

const plan = (await import(`./social_live/plans/${site}.mjs`)).default;
fs.mkdirSync(outRoot, { recursive: true });
const proc = await launch({ port, dir: profile });
const report = { site, when: new Date().toISOString(), pages: [], redirects: [] };
try {
  for (const pg of plan.pages.filter((p) => !onlyPage || p.name === onlyPage)) {
    try { report.pages.push(await reviewPage(plan, pg)); } catch (e) { report.pages.push({ name: pg.name, error: String(e.message || e) }); }
  }
  for (const rd of (plan.redirects || []).filter((r) => !onlyPart || r.part === onlyPart)) {
    try { report.redirects.push(await reviewRedirect(plan, rd)); } catch (e) { report.redirects.push({ part: rd.part, status: "error", error: String(e.message || e) }); }
  }
} finally {
  // A run limited to one page or part must not overwrite the full report that social_fixtures.mjs reads.
  fs.writeFileSync(path.join(outRoot, onlyPage || onlyPart ? "report.partial.json" : "report.json"), JSON.stringify(report, null, 1));
  shutdown(profile);
}
for (const pg of report.pages) {
  if (pg.error) { console.log(`${pg.name}: ERROR ${pg.error}`); continue; }
  for (const p of pg.parts) console.log(`${pg.name.padEnd(10)} ${p.part.padEnd(14)} ${p.status.padEnd(12)} before ${p.before ? p.before.visible : "-"} -> after ${p.after ? p.after.visible : "-"}${p.after && p.after.trips ? " TRIPPED " + p.after.tripWhy : ""}${p.error ? " " + p.error : ""}`);
  for (const c of pg.custom || []) console.log(`${pg.name.padEnd(10)} ${c.part.padEnd(14)} ${c.status.padEnd(12)} custom: ${c.name} ${c.status === "pass" ? "" : "got " + JSON.stringify(c.got) + " want " + JSON.stringify(c.expect) + (c.error || "")}`);
  console.log(`${pg.name.padEnd(10)} ALL ON       hidden-by-us: [${pg.all.hiddenByUs.join(", ")}] trips: [${pg.all.trips}] new page errors: ${pg.all.newPageErrors}`);
}
for (const r of report.redirects) console.log(`redirect ${r.part.padEnd(14)} ${r.status} ${r.landedOn || r.error || ""}`);
