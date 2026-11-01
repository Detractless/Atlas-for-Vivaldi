"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");
const { setup, latestRequest, PREVIEW } = require("../helpers/nsfw_image_env");
const BASE = path.resolve(__dirname, "../../payload/install-files/components/atlas");
const code = name => fs.readFileSync(path.join(BASE, name), "utf8");
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

test("a load arriving before the batched src mutation keeps one check and restores the new source", t => {
  const { classifyFlagged } = require("../helpers/nsfw_image_env");
  const env = setup(); t.after(() => env.dom.window.close()); classifyFlagged(env);
  const url = "https://img.test/upgrade.jpg"; env.img.src = url;
  env.shield.sourceChanged(env.img);
  env.shield.sourceChanged(env.img, env.img, "src");
  const requests = env.requests.filter(r => r.message.act === "nsfw-prepare-shield" && r.message.url === url);
  assert.equal(requests.length, 1);
  requests[0].callback({ preparedId: "new", shieldPreview: PREVIEW });
  latestRequest(env, "nsfw-classify").callback({ isNsfw: false });
  assert.equal(env.img.getAttribute("src"), url);
});

test("100 image requests stay protected while only two prepare, visible images go first", async t => {
  const env = setup('<div id="tiles"></div><img src="https://img.test/last.jpg">');
  t.after(() => env.dom.window.close());
  env.window.eval(code("atlas-nsfw-work.js")); env.window.eval(code("atlas-nsfw-image-work.js"));
  const images = [];
  for (let i = 0; i < 100; i++) {
    const img = env.window.document.createElement("img"); img.src = "https://img.test/" + i + ".jpg";
    img.getBoundingClientRect = () => ({ top: i < 98 ? 5000 : 20, bottom: i < 98 ? 5100 : 120, left: 0, right: 100 });
    env.window.document.querySelector("#tiles").append(img); images.push(img);
    env.shield.analyze(img, img.src);
  }
  await wait(20);
  const prepares = env.requests.filter(r => r.message.act === "nsfw-prepare-shield");
  assert.equal(prepares.length, 2);
  assert.deepEqual(prepares.map(r => r.message.url), [images[98].src, images[99].src]);
  assert.ok(images.every(img => img.dataset.nsfwFilterStatus === "processing" && /blur/.test(img.style.filter)));
  const removed = images[0].src; images[0].remove(); await wait(5);
  for (const request of prepares) request.callback({ verdict: { isNsfw: false } });
  await wait(15);
  assert.equal(env.requests.filter(r => r.message.act === "nsfw-prepare-shield").length, 4);
  assert.equal(env.requests.some(r => r.message.act === "nsfw-prepare-shield" && r.message.url === removed), false);
});

test("detector work is capped globally, completion has priority, cancelled work never runs", async t => {
  const dom = new JSDOM("", { runScripts: "outside-only" }); t.after(() => dom.window.close());
  const w = dom.window; w.eval(code("atlas-nsfw-work.js")); w.eval(code("nsfw/offscreen-work.js"));
  let active = 0, peak = 0; const release = [], started = [], replies = [];
  function submit(id, type) {
    w.__atlasNsfwDetectorWork.run({ requestId: id, type }, result => replies.push(result), () => {
      started.push(id); peak = Math.max(peak, ++active);
      return new Promise(resolve => release.push(() => { active--; resolve({ id }); }));
    });
  }
  submit("a", "PREPARE_SHIELD"); submit("b", "PREPARE_SHIELD");
  await wait(10); assert.equal(active, 2);
  submit("new", "PREPARE_SHIELD"); submit("cancel", "PREPARE_SHIELD"); submit("finish", "CLASSIFY");
  w.__atlasNsfwDetectorWork.cancel("cancel");
  release.shift()(); await wait(10);
  assert.deepEqual(started, ["a", "b", "finish"]);
  while (release.length) { release.shift()(); await wait(5); }
  assert.equal(peak, 2); assert.equal(started.includes("cancel"), false);
  assert.ok(replies.some(result => result.error === "cancelled"));
});

test("identical status and preview are encoded once, buffers are released, pixels are never sampled", async t => {
  const env = setup(); t.after(() => env.dom.window.close());
  let encodes = 0, decodes = 0; const canvases = [], sizes = [];
  const ctx = { drawImage() {}, save() {}, restore() {}, translate() {}, scale() {}, fillRect() {}, fillText() {},
    measureText(value) { return { width: value.length * 6 }; },
    createRadialGradient() { return { addColorStop() {} }; },
    getImageData() { throw Error("fixed backing must not sample pixels"); } };
  env.window.HTMLCanvasElement.prototype.getContext = function () { if (!canvases.includes(this)) canvases.push(this); return ctx; };
  env.window.HTMLCanvasElement.prototype.toDataURL = function () { encodes++; sizes.push([this.width, this.height]); return PREVIEW + encodes; };
  env.window.Image = class { constructor() { this.naturalWidth = 448; this.naturalHeight = 300; }
    set src(value) { decodes++; Promise.resolve().then(() => this.onload()); } };
  const ui = env.window.__atlasNsfwImageShieldUi.create(env.img, () => true);
  ui.render("Checking image…", "checking"); ui.setPreview(PREVIEW); await Promise.resolve();
  env.window.__atlasNsfwImageShieldUi.positionAll();
  assert.equal(encodes, 1);
  ui.render("NSFW detected", "flagged", "Retry with stronger model", () => {});
  ui.setPreview(PREVIEW); env.window.__atlasNsfwImageShieldUi.positionAll();
  assert.equal(encodes, 2); assert.equal(decodes, 1);
  assert.ok(sizes.every(([width, height]) => width <= 320 && height <= 215));
  assert.ok(canvases.every(canvas => canvas.width === 0 && canvas.height === 0));
  ui.destroy();
});

test("early and active cancellation discard stale work without leaking its prepared result", async t => {
  const dom = new JSDOM("", { runScripts: "outside-only" }); t.after(() => dom.window.close());
  const w = dom.window; w.eval(code("atlas-nsfw-work.js")); w.eval(code("nsfw/offscreen-work.js"));
  const worker = w.__atlasNsfwDetectorWork; let started = 0, finish; const replies = [], discarded = [];
  worker.cancel("early");
  worker.run({ requestId: "early" }, r => replies.push(r), () => { started++; });
  worker.run({ requestId: "active" }, r => replies.push(r), () => {
    started++; return new Promise(resolve => { finish = resolve; });
  }, null, r => discarded.push(r));
  await wait(10); worker.cancel("active"); finish({ preparedId: "stale" }); await wait(10);
  assert.equal(started, 1); assert.equal(replies.length, 2);
  assert.ok(replies.every(r => r.error === "cancelled"));
  assert.equal(discarded[0].preparedId, "stale");
});

test("background and subtree notifications are coalesced and removed targets are unobserved", async t => {
  const dom = new JSDOM('<main><div id="tile"><span></span></div></main>', { runScripts: "outside-only" });
  t.after(() => dom.window.close()); const w = dom.window; let ioCallback;
  const observed = [], unobserved = [], added = [], attrs = [], backgrounds = [];
  w.IntersectionObserver = class { constructor(fn) { ioCallback = fn; } observe(node) { observed.push(node); }
    unobserve(node) { unobserved.push(node); } disconnect() {} };
  w.eval(code("atlas-nsfw-guard-watch.js"));
  const monitor = w.__atlasNsfwGuardWatch.create({ added: n => added.push(n), attribute: (n, a) => attrs.push(a),
    background: n => backgrounds.push(n), load() {} });
  const tile = w.document.querySelector("#tile"); monitor.backgrounds.observe(tile); monitor.backgrounds.observe(tile);
  tile.style.width = "100px"; tile.style.height = "120px"; tile.style.color = "red";
  ioCallback([{ target: tile, isIntersecting: true }]); await wait(10);
  assert.equal(observed.length, 1); assert.equal(backgrounds.length, 1);
  const parent = w.document.createElement("div"); parent.append(w.document.createElement("section"));
  w.document.querySelector("main").append(parent); parent.firstChild.append(w.document.createElement("i"));
  await wait(10); assert.deepEqual(added, [parent]);
  tile.remove(); await wait(10); assert.ok(unobserved.includes(tile)); monitor.disconnect();
});
