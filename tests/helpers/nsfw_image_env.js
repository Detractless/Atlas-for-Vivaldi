"use strict";
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");
const ROOT = path.resolve(__dirname, "..", "..");
const UI_CODE = fs.readFileSync(path.join(ROOT, "payload/install-files/components/atlas/atlas-nsfw-image-layout.js"), "utf8") + "\n" + fs.readFileSync(path.join(ROOT, "payload/install-files/components/atlas/atlas-nsfw-image-ui.js"), "utf8");
const SHIELD_CODE = fs.readFileSync(path.join(ROOT, "payload/install-files/components/atlas/atlas-nsfw-image-shield.js"), "utf8");
const PREVIEW = "data:image/webp;base64,YnJhcnJlbA==";
function setup(markup, options = {}) {
  const dom = new JSDOM(markup || '<picture><source srcset="https://img.test/large.webp 2x"><img src="https://img.test/small.jpg" data-original="https://img.test/original.jpg" alt="sample"></picture>', {
    url: "https://page.test/search",
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  const { window } = dom;
  const requests = [], logs = [];
  const originalAttachShadow = window.HTMLElement.prototype.attachShadow;
  window.HTMLElement.prototype.attachShadow = function (options) {
    return originalAttachShadow.call(this, { mode: "open" });
  };
  window.chrome = {
    runtime: {
      lastError: null,
      sendMessage(message, callback) {
        requests.push({ message: message.atlas, callback });
        if (message.atlas.act === "nsfw-cached-verdict") callback({ verdict: options.cachedVerdict || null });
      },
    },
  };
  window.__atlasNsfwLog = (event, data) => logs.push({ event, data });
  window.__atlasNsfwTrace = { verdict() {} };
  window.eval(fs.readFileSync(path.join(ROOT, "payload/install-files/components/atlas/atlas-nsfw-image-sources.js"), "utf8"));
  window.eval(UI_CODE);
  window.eval(fs.readFileSync(path.join(ROOT, "payload/install-files/components/atlas/atlas-nsfw-image-observer.js"), "utf8"));
  window.eval(SHIELD_CODE);
  const img = window.document.querySelector("img");
  img.getBoundingClientRect = () => ({ left: 20, top: 30, width: 320, height: 180 });
  return { dom, window, img, requests, logs, shield: window.__atlasNsfwImageShield };
}

function latestRequest(env, act, url) { return env.requests.slice().reverse().find((request) => request.message.act === act && (!url || request.message.url === url)); }

function prepareAndClassify(env, url) {
  url = url || "https://img.test/small.jpg"; env.shield.analyze(env.img, url);
  const prepare = latestRequest(env, "nsfw-prepare-shield", url);
  assert.ok(prepare, "starts by preparing a blurred checking image");
  assert.ok(prepare.message.requestId);
  prepare.callback({ preparedId: "prepared-image", shieldPreview: PREVIEW, shieldWidth: 640, shieldHeight: 360 });
  const classify = latestRequest(env, "nsfw-classify", url);
  assert.ok(classify, "classifies the fetched image after the blurred preview is ready");
  assert.equal(classify.message.shield, true);
  assert.equal(classify.message.preparedId, "prepared-image");
  return classify;
}

function classifyFlagged(env) {
  prepareAndClassify(env).callback({
    isNsfw: true,
    score: 0.91,
    shieldPreview: PREVIEW,
    shieldWidth: 640,
    shieldHeight: 360,
    snapshotId: "opaque-snapshot",
  });
}

module.exports = { setup, latestRequest, prepareAndClassify, classifyFlagged, UI_CODE, SHIELD_CODE, PREVIEW };
