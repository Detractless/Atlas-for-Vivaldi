// Offline replay of the live reviews: each recorded snapshot of a real page (tests/fixtures/social/, written by
// scripts/social_fixtures.mjs) must still match what its part's selectors matched on the day, and no part's
// rule may reach a landmark. A snapshot is old by design; this catches someone breaking a selector, not a site
// changing. The live review (scripts/social_live_check.mjs) is what notices the site changing.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { loadSocial, closeAll, wait, ROOT } = require("../helpers/social_env");

test.afterEach(closeAll);

const DIR = path.join(ROOT, "tests", "fixtures", "social");
const sites = fs.existsSync(DIR) ? fs.readdirSync(DIR).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, "")) : [];

test("fixtures exist for the sites that have been reviewed", () => {
  for (const site of sites) {
    const manifest = JSON.parse(fs.readFileSync(path.join(DIR, `${site}.json`), "utf8"));
    for (const name of Object.keys(manifest)) assert.ok(fs.existsSync(path.join(DIR, `${site}-${name}.html`)), `${site}-${name}.html`);
  }
});

for (const site of sites) {
  test(`${site}: each recorded part still matches its snapshot, and no rule reaches a landmark`, async () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(DIR, `${site}.json`), "utf8"));
    for (const [name, rec] of Object.entries(manifest)) {
      const html = fs.readFileSync(path.join(DIR, `${site}-${name}.html`), "utf8");
      for (const [part, expected] of Object.entries(rec.matches)) {
        const t = loadSocial({ html, url: rec.url, siteFile: site, filter: { mode: "parts", parts: [part] } });
        await wait(10);
        t.S.internals.runChecks(t.state);
        assert.equal(Object.keys(t.state.tripped).length, 0, `${site}/${name}/${part}: the guard tripped on the snapshot`);
        const h = t.state.health[part];
        assert.equal(h.matches, expected, `${site}/${name}/${part}: matched ${h.matches}, recorded ${expected}`);
        t.window.close();
      }
    }
  });
}

for (const site of sites) {
  test(`${site}: with every part of the site on at once, nothing trips and no landmark or smoke element is hidden`, async () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(DIR, `${site}.json`), "utf8"));
    for (const [name, rec] of Object.entries(manifest)) {
      const html = fs.readFileSync(path.join(DIR, `${site}-${name}.html`), "utf8");
      const probe = loadSocial({ html, url: rec.url, siteFile: site });
      const everyPart = Object.keys(probe.state.table.parts);
      probe.window.close();
      const t = loadSocial({ html, url: rec.url, siteFile: site, filter: { mode: "parts", parts: everyPart } });
      await wait(10);
      t.S.internals.runChecks(t.state);
      assert.equal(Object.keys(t.state.tripped).length, 0, `${site}/${name}: ${JSON.stringify(t.state.tripped)}`);
      t.window.close();
    }
  });
}
