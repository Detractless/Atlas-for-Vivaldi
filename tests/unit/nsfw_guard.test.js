"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const GUARD_PATH = path.join(ROOT, "payload", "install-files", "components", "atlas", "atlas-nsfw-guard.js");
const DRAG_PATH = path.join(ROOT, "payload", "install-files", "components", "atlas", "atlas-nsfw-drag.js");
const SCRIPTS_PATH = path.join(ROOT, "src", "modules", "03-bridge-content-scripts.js");

test("atlas-nsfw-guard.js parses and reads the Content shield config", () => {
  const code = fs.readFileSync(GUARD_PATH, "utf8");
  assert.doesNotThrow(() => new Function(code), "guard parses as a script");
  assert.ok(code.includes("__atlasNsfwGuard"), "guard defines __atlasNsfwGuard namespace");
  assert.ok(code.includes("'nsfwAction'"), "guard reads nsfwAction from sync storage");
  assert.ok(code.includes("action !== 'off'"), "guard derives enabled from the action");
  assert.ok(!code.includes("nsfwEnabled"), "the retired nsfwEnabled switch is gone");
  assert.ok(!code.includes("nsfwThreshold"), "the retired nsfwThreshold is gone");
  assert.ok(!code.includes("nsfwCountLimit"), "the retired page threshold is gone");
  assert.ok(!code.includes("nsfwRedirectUrl"), "the retired redirect URL is gone");
  assert.ok(!code.includes("atlas-nsfw-notice"), "the warning toast is gone");
  assert.ok(!code.includes("'warning'") && !code.includes("block_page") && !code.includes("'redirect'"),
    "the retired actions stay out of the code");
  assert.ok(!code.includes("nsfw-redirect") && !code.includes("nsfw-block-page"),
    "no page-blocking or redirect messages to the bridge");
  assert.ok(!code.includes("innerHTML"), "the guard never replaces the page");
  assert.ok(code.includes("nsfwFlagged"), "guard remembers which images it flagged");
  assert.ok(code.includes("function revealElement(el, force)"), "reveal can be forced for a policy change");
  assert.ok(code.includes("revealElement(el, true)"), "disabling the shield lifts the effect on every image");
  assert.ok(code.includes("if (isNsfw === null) { settleBackground(el, true, key); return; }"), "an unknown background verdict is shielded, never treated as safe");
  assert.ok(code.includes("if (isNsfw === null) { applyEffect(img); return; }"), "an unknown image verdict stays shielded, never revealed");
  assert.ok(code.includes('data-nsfw-filter-status="processing"'), "processing images stay hidden");
  assert.ok(!code.includes("click to reveal"), "blurred images cannot be revealed by a click");
  assert.ok(!code.includes("addEventListener('click'"), "the guard installs no click-to-reveal handler");
  assert.ok(code.includes("window.__atlasNsfwTrace"), "the guard logs through the debug sink");
  assert.ok(code.includes("verdictLog("), "emits a verdict log with score, source and threshold");
  assert.ok(code.includes("logEvent('fail'"), "tags fail-open reasons (taint, missing frame, dead detector)");
  assert.ok(code.includes("scanShadow("), "traverses open shadow roots");
  assert.ok(code.includes("_shadowSeen"), "each shadow root is recorded once");
});

test("the drag blocker stops dragging flagged media out of the page", () => {
  const code = fs.readFileSync(DRAG_PATH, "utf8");
  assert.doesNotThrow(() => new Function(code), "drag script parses as a script");
  assert.ok(code.includes("addEventListener('dragstart'"), "listens for dragstart in the capture phase");
  assert.ok(code.includes("e.preventDefault()"), "cancels the drag");
  assert.ok(code.includes("e.stopImmediatePropagation()"), "stops the page's own drag handler");
  assert.ok(code.includes('img[data-nsfw-flagged="1"]'), "flagged images remain blocked");
  assert.ok(code.includes('-webkit-user-drag:none'), "the flagged element is not draggable");
  const bridge = fs.readFileSync(SCRIPTS_PATH, "utf8");
  assert.ok(bridge.includes("components/atlas/atlas-nsfw-image-ui.js"), "loads the centered Atlas status UI");
  assert.ok(bridge.includes("components/atlas/atlas-nsfw-image-shield.js"), "loads the image shield controller");
  assert.ok(bridge.indexOf("atlas-nsfw-image-ui.js") < bridge.indexOf("atlas-nsfw-image-shield.js"), "loads the UI before the controller");
  assert.ok(bridge.includes("'components/atlas/atlas-nsfw-drag.js'"), "registered with the guard content script");
  assert.ok(bridge.includes("allFrames: true"), "runs in every frame");
});
