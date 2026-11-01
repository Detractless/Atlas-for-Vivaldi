"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");
const { setup, latestRequest, PREVIEW } = require("../helpers/nsfw_image_env.js");
const DRAG = fs.readFileSync(path.join(__dirname, "../../payload/install-files/components/atlas/atlas-nsfw-drag.js"), "utf8");

function drag(window, target) {
  const event = new window.Event("dragstart", { bubbles: true, cancelable: true, composed: true });
  target.dispatchEvent(event);
  return event.defaultPrevented;
}

test("dragging stays blocked from the initial blur through preview preparation and a failed check", () => {
  const env = setup();
  env.window.eval(DRAG);
  env.shield.analyze(env.img, env.img.src);
  assert.match(env.img.style.filter, /blur/);
  assert.equal(env.img.dataset.nsfwFlagged, undefined, "the initial check has no NSFW verdict yet");
  assert.equal(drag(env.window, env.img), true);
  latestRequest(env, "nsfw-prepare-shield").callback({ preparedId: "prepared", shieldPreview: PREVIEW });
  assert.equal(drag(env.window, env.img), true, "the baked checking preview is protected too");
  latestRequest(env, "nsfw-classify").callback({ error: "detector-unavailable" });
  assert.equal(drag(env.window, env.img), true, "a failed check must not release the original");
  env.dom.window.close();
});

test("a safe verdict or disabling the shield releases drag protection immediately", () => {
  for (const disable of [false, true]) {
    const env = setup();
    env.window.eval(DRAG);
    env.shield.analyze(env.img, env.img.src);
    assert.equal(drag(env.window, env.img), true);
    if (disable) env.shield.restoreAll();
    else {
      latestRequest(env, "nsfw-prepare-shield").callback({ preparedId: "prepared", shieldPreview: PREVIEW });
      latestRequest(env, "nsfw-classify").callback({ isNsfw: false });
    }
    assert.equal(drag(env.window, env.img), false);
    env.dom.window.close();
  }
});

test("linked pending media cannot be dragged through its link or a nested caption", () => {
  const dom = new JSDOM('<a href="https://example.test/full.jpg"><img data-nsfw-filter-status="processing"><span>Caption</span></a>', { runScripts: "outside-only" });
  const { window } = dom;
  window.eval(DRAG);
  let pageDrags = 0;
  window.document.addEventListener("dragstart", () => pageDrags++);
  for (const selector of ["img", "a", "span"]) assert.equal(drag(window, window.document.querySelector(selector)), true);
  assert.equal(pageDrags, 0, "the page cannot handle a drag that Atlas cancelled");
  dom.window.close();
});

test("flagged and processing media are protected while safe and untouched media remain draggable", () => {
  for (const tag of ["img", "video"]) {
    for (const [attributes, blocked] of [["", false], ['data-nsfw-filter-status="sfw"', false], ['data-nsfw-filter-status="processing"', true], ['data-nsfw-flagged="1"', true]]) {
      const dom = new JSDOM(`<${tag} ${attributes}></${tag}>`, { runScripts: "outside-only" });
      dom.window.eval(DRAG);
      assert.equal(drag(dom.window, dom.window.document.querySelector(tag)), blocked, `${tag}: ${attributes}`);
      dom.window.close();
    }
  }
});

test("safe siblings and unrelated links remain draggable while a protected image shares their container", () => {
  for (const attributes of ['data-nsfw-filter-status="processing"', 'data-nsfw-flagged="1"']) {
    const dom = new JSDOM(`<div id="card" draggable="true"><img ${attributes}></div><img id="safe" data-nsfw-filter-status="sfw"><img id="untouched"><a id="link" href="https://example.test">Other link</a>`, { runScripts: "outside-only" });
    dom.window.eval(DRAG);
    for (const id of ["safe", "untouched", "link"]) assert.equal(drag(dom.window, dom.window.document.getElementById(id)), false, id);
    assert.equal(drag(dom.window, dom.window.document.getElementById("card")), true, "dragging the protected image's wrapper is blocked");
    dom.window.close();
  }
});

test("protected images inside an open shadow root cannot be dragged through the retargeted event", () => {
  const dom = new JSDOM('<div id="host"></div>', { runScripts: "outside-only" });
  const root = dom.window.document.getElementById("host").attachShadow({ mode: "open" });
  root.innerHTML = '<img data-nsfw-filter-status="processing">';
  dom.window.eval(DRAG);
  assert.equal(drag(dom.window, root.querySelector("img")), true);
  dom.window.close();
});
