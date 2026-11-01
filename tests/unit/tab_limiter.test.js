"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const load = () => import(pathToFileURL(path.join(__dirname, "..", "..", "payload", "detractless", "src", "background", "tabLimiter.js")).href);
const tab = (o) => Object.assign({ id: 1, url: "https://a.test/" }, o);
const PANEL = '{"ext_id":"abc","panelId":"EXT_PANEL_hehggadaopoacecdllhhajmbjkdcmajg","restoreStatus":"restored"}';

test("a sidebar panel's page is not counted as a tab", async () => {
  const { isTabLimitExcluded } = await load();
  assert.equal(isTabLimitExcluded(tab({ url: "chrome-extension://hehggadaopoacecdllhhajmbjkdcmajg/codex-work-sidepanel.html", vivExtData: PANEL })), true);
  assert.equal(isTabLimitExcluded(tab({ vivExtData: '{"ext_id":"abc","panelId":"WEBPANEL_atlas_downloads"}' })), true, "any panel, whatever its address");
});

test("the Downloads panel is recognised by address before its panel id exists", async () => {
  const { isTabLimitExcluded } = await load();
  assert.equal(isTabLimitExcluded(tab({ url: "chrome-extension://mpognobbkildjkofajifpdfhcoklimli/components/atlas/downloads-panel.html" })), true);
});

test("ordinary tabs are counted, including Atlas's own new-tab page", async () => {
  const { isTabLimitExcluded } = await load();
  assert.equal(isTabLimitExcluded(tab({ vivExtData: '{"ext_id":"abc","restoreStatus":"restored","thumbnail":"c"}' })), false);
  assert.equal(isTabLimitExcluded(tab({ url: "chrome-extension://mpognobbkildjkofajifpdfhcoklimli/index.html" })), false);
  assert.equal(isTabLimitExcluded(tab({ url: "https://a.test/?q=panelId", vivExtData: undefined })), false);
  assert.equal(isTabLimitExcluded({}), false);
});

test("the older Tools sidebar addresses are still excluded", async () => {
  const { isTabLimitExcluded } = await load();
  assert.equal(isTabLimitExcluded(tab({ url: "chrome-extension://mpognobbkildjkofajifpdfhcoklimli/sidepanel.html" })), true);
  assert.equal(isTabLimitExcluded(tab({ url: "chrome-extension://hehggadaopoacecdllhhajmbjkdcmajg/codex-sidepanel/index.html" })), true);
});
