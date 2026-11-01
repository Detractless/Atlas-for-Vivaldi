"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");
const { setup, latestRequest, prepareAndClassify, classifyFlagged, UI_CODE, PREVIEW } = require("../helpers/nsfw_image_env.js");

test("flagged image is replaced with blurred preview and original candidates are masked", () => {
  const env = setup(); classifyFlagged(env);
  const source = env.window.document.querySelector("picture source");
  assert.equal(env.img.getAttribute("src"), PREVIEW);
  assert.equal(env.img.hasAttribute("data-original"), false);
  assert.equal(env.img.hasAttribute("srcset"), false);
  assert.equal(env.img.getAttribute("width"), "640");
  assert.equal(env.img.getAttribute("height"), "360");
  assert.equal(source.hasAttribute("srcset"), false);
  assert.equal(env.img.dataset.nsfwFlagged, "1");
  const host = env.window.document.querySelector("[data-atlas-nsfw-overlay]");
  assert.ok(host);
  assert.match(host.shadowRoot.textContent, /NSFW detected/);
  assert.match(host.shadowRoot.textContent, /Click to retry/);
  assert.equal(host.shadowRoot.querySelector("button").getAttribute("aria-label"), "Retry with stronger model");
  assert.equal(host.style.left, "20px");
  env.dom.window.close();
});

test("retry runs the stronger model and keeps the image covered after NSFW confirmation", () => {
  const env = setup(); classifyFlagged(env);
  const button = env.window.document.querySelector("[data-atlas-nsfw-overlay]").shadowRoot.querySelector("button");
  button.click();
  const retry = latestRequest(env, "nsfw-retry");
  assert.equal(retry.message.snapshotId, "opaque-snapshot");
  assert.match(env.window.document.querySelector("[data-atlas-nsfw-overlay]").shadowRoot.textContent, /Rechecking with stronger model/);
  retry.callback({ stage: "strong", model: "freepik-448-fp16", isNsfw: true, score: 0.88, threshold: 0.729 });
  assert.equal(env.img.getAttribute("src"), PREVIEW);
  assert.match(env.window.document.querySelector("[data-atlas-nsfw-overlay]").shadowRoot.textContent, /NSFW confirmed/);
  env.dom.window.close();
});

test("strong-model failure keeps the blurred image covered and permits a user retry", () => {
  const env = setup(); classifyFlagged(env);
  env.window.document.querySelector("[data-atlas-nsfw-overlay]").shadowRoot.querySelector("button").click();
  latestRequest(env, "nsfw-retry").callback({ stage: "strong", error: "wasm-unavailable" });
  const host = env.window.document.querySelector("[data-atlas-nsfw-overlay]");
  assert.equal(env.img.getAttribute("src"), PREVIEW);
  assert.match(host.shadowRoot.textContent, /Stronger model unavailable/);
  host.shadowRoot.querySelector("button").click();
  const retries = env.requests.filter((request) => request.message.act === "nsfw-retry");
  assert.equal(retries.length, 2);
  retries[1].callback({ stage: "strong", model: "freepik-448-fp16", isNsfw: true, score: 0.9, threshold: 0.729 });
  assert.match(host.shadowRoot.textContent, /NSFW confirmed/);
  assert.equal(env.img.getAttribute("src"), PREVIEW);
  env.dom.window.close();
});

test("stronger-model SFW status stays over the blur until its fade ends, then restores source metadata", async () => {
  const env = setup(); classifyFlagged(env);
  env.window.document.querySelector("[data-atlas-nsfw-overlay]").shadowRoot.querySelector("button").click();
  latestRequest(env, "nsfw-retry").callback({ stage: "strong", model: "freepik-448-fp16", isNsfw: false, score: 0.12, threshold: 0.729 });
  const host = env.window.document.querySelector("[data-atlas-nsfw-overlay]");
  assert.equal(env.img.getAttribute("src"), PREVIEW);
  assert.match(host.shadowRoot.textContent, /SFW confirmed/);
  await new Promise((resolve) => setTimeout(resolve, 380));
  assert.equal(env.img.getAttribute("src"), "https://img.test/small.jpg");
  assert.equal(env.img.getAttribute("data-original"), "https://img.test/original.jpg");
  assert.equal(env.img.hasAttribute("width"), false);
  assert.equal(env.img.hasAttribute("height"), false);
  assert.equal(env.window.document.querySelector("picture source").getAttribute("srcset"), "https://img.test/large.webp 2x");
  assert.equal(env.img.dataset.nsfwFlagged, undefined);
  assert.equal(env.window.document.querySelector("[data-atlas-nsfw-overlay]"), null);
  env.dom.window.close();
});

test("first-stage SFW removes the baked checking state and restores the original image source", async () => {
  const env = setup();
  const raster = mockRasterDrawing(env, [0, 0, 0, 255]);
  env.shield.analyze(env.img, "https://img.test/small.jpg");
  const fallback = env.window.document.querySelector("[data-atlas-nsfw-overlay]").shadowRoot.querySelector(".fallback");
  assert.equal(env.window.getComputedStyle(fallback).display, "none"); assert.equal(env.img.style.getPropertyValue("visibility"), "visible"); assert.match(env.img.style.getPropertyValue("filter"), /blur\(30px\)/);
  latestRequest(env, "nsfw-prepare-shield").callback({ preparedId: "prepared-image", shieldPreview: PREVIEW, shieldWidth: 640, shieldHeight: 360 });
  assert.equal(env.img.getAttribute("src"), PREVIEW, "the pending image is already blurred"); assert.equal(env.img.style.getPropertyValue("filter"), "none");
  await Promise.resolve();
  assert.ok(raster.drawn.some((entry) => entry.text === "Checking image…"), "checking copy is painted into the blurred raster");
  const classify = latestRequest(env, "nsfw-classify");
  classify.callback({ isNsfw: false, score: 0.08, source: "detector" });
  assert.equal(env.img.getAttribute("src"), "https://img.test/small.jpg");
  assert.equal(env.window.document.querySelector("[data-atlas-nsfw-overlay]"), null);
  assert.equal(env.img.dataset.nsfwFilterStatus, "sfw");
  env.dom.window.close();
});

test("source replacement during a flagged state restarts analysis with the replacement blurred", () => {
  const env = setup();
  classifyFlagged(env);
  env.img.setAttribute("src", "https://img.test/next.jpg");
  assert.equal(env.shield.sourceChanged(env.img, env.img, "src"), true);
  latestRequest(env, "nsfw-prepare-shield", "https://img.test/next.jpg").callback({ preparedId: "prepared-next", shieldPreview: PREVIEW, shieldWidth: 640, shieldHeight: 360 });
  const nextCheck = env.requests.find((request) => request.message.act === "nsfw-classify" && request.message.url === "https://img.test/next.jpg");
  assert.ok(nextCheck);
  assert.equal(env.img.getAttribute("src"), PREVIEW, "the replacement stays blurred during the next check");
  nextCheck.callback({ isNsfw: false, score: 0.02, source: "detector" });
  assert.equal(env.img.getAttribute("src"), "https://img.test/next.jpg");
  assert.equal(env.img.getAttribute("data-original"), "https://img.test/original.jpg");
  assert.equal(env.img.dataset.nsfwFlagged, undefined);
  env.dom.window.close();
});

test("a changed responsive candidate stays blurred and its current source is restored after a safe verdict", () => {
  const env = setup();
  classifyFlagged(env);
  env.img.setAttribute("srcset", "https://img.test/next-2x.jpg 2x, https://img.test/next.jpg 1x");
  assert.equal(env.shield.sourceChanged(env.img, env.img, "srcset"), true);
  latestRequest(env, "nsfw-prepare-shield", "https://img.test/next-2x.jpg").callback({ preparedId: "prepared-responsive", shieldPreview: PREVIEW, shieldWidth: 640, shieldHeight: 360 });
  const nextCheck = env.requests.find((request) => request.message.act === "nsfw-classify" && request.message.url === "https://img.test/next-2x.jpg");
  assert.ok(nextCheck);
  assert.equal(env.img.getAttribute("src"), PREVIEW, "the replacement stays blurred during the next check");
  nextCheck.callback({ isNsfw: false, score: 0.01 });
  assert.equal(env.img.getAttribute("src"), "https://img.test/small.jpg");
  assert.equal(env.img.getAttribute("srcset"), "https://img.test/next-2x.jpg 2x, https://img.test/next.jpg 1x");
  env.dom.window.close();
});

test("unknown first-stage verdict keeps the blurred image and offers a retry status", () => {
  const env = setup();
  prepareAndClassify(env).callback({ error: "detector-timeout" });
  assert.equal(env.img.getAttribute("src"), PREVIEW, "a failed check remains covered by the blurred image");
  const host = env.window.document.querySelector("[data-atlas-nsfw-overlay]");
  assert.match(host.shadowRoot.textContent, /Couldn’t verify/);
  assert.match(host.shadowRoot.textContent, /Try again/);
  env.dom.window.close();
});

test("snapshot pressure keeps the blurred replacement and offers a fresh first-stage check", () => {
  const env = setup();
  env.shield.analyze(env.img, "https://img.test/small.jpg");
  latestRequest(env, "nsfw-prepare-shield").callback({ preparedId: "prepared-image", shieldPreview: PREVIEW, shieldWidth: 640, shieldHeight: 360 });
  latestRequest(env, "nsfw-classify").callback({ isNsfw: true, shieldPreview: PREVIEW, shieldWidth: 640, shieldHeight: 360, previewError: "snapshot-capacity" });
  assert.equal(env.img.getAttribute("src"), PREVIEW);
  const button = env.window.document.querySelector("[data-atlas-nsfw-overlay]").shadowRoot.querySelector("button");
  assert.equal(button.textContent, "Try again");
  button.click();
  assert.equal(env.requests.filter((request) => request.message.act === "nsfw-prepare-shield").length, 2);
  env.dom.window.close();
});

test("page teardown releases the opaque retry snapshot and its overlay", () => {
  const env = setup(); classifyFlagged(env);
  env.window.dispatchEvent(new env.window.Event("pagehide"));
  assert.ok(env.requests.some((request) => request.message.act === "nsfw-release-snapshot" && request.message.snapshotId === "opaque-snapshot"));
  assert.equal(env.window.document.querySelector("[data-atlas-nsfw-overlay]"), null);
  env.dom.window.close();
});


test("retry positioning responds to layout and scroll events without an idle loop", () => {
  const dom = new JSDOM('<div id="scroller"><img></div>', { runScripts: "outside-only", pretendToBeVisual: true });
  const { window } = dom;
  const frames = new Map(); let next = 0;
  window.requestAnimationFrame = fn => { frames.set(++next, fn); return next; };
  window.cancelAnimationFrame = id => frames.delete(id);
  const img = window.document.querySelector("img"); let rect = { left: 20, top: 100, width: 320, height: 180 };
  img.getBoundingClientRect = () => rect;
  const tick = () => { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(fn => fn()); };
  window.eval(UI_CODE);
  const ui = window.__atlasNsfwImageShieldUi.create(img);
  ui.render("NSFW detected", "flagged", "Retry with stronger model", () => {});
  tick();
  assert.equal(ui.host.style.top, "100px");
  assert.equal(frames.size, 0, "settled images do not schedule another frame");
  rect = { ...rect, top: 250, left: 40 };
  window.dispatchEvent(new window.Event("resize")); tick();
  assert.equal(ui.host.style.top, "250px");
  rect = { ...rect, top: 90, width: 280 };
  window.document.querySelector("#scroller").dispatchEvent(new window.Event("scroll")); tick();
  assert.equal(ui.host.style.top, "90px");
  assert.equal(ui.host.style.width, "280px");
  ui.destroy(); assert.equal(frames.size, 0); dom.window.close();
});

test("multiple status images coalesce layout events into one frame", () => {
  const dom = new JSDOM("<img><img>", { runScripts: "outside-only", pretendToBeVisual: true });
  const { window } = dom; const frames = new Map(); let next = 0;
  window.requestAnimationFrame = fn => { frames.set(++next, fn); return next; };
  window.cancelAnimationFrame = id => frames.delete(id);
  window.eval(UI_CODE);
  const ui = [...window.document.querySelectorAll("img")].map(img => window.__atlasNsfwImageShieldUi.create(img));
  for (let i = 0; i < 10; i++) window.dispatchEvent(new window.Event("scroll"));
  assert.equal(frames.size, 1);
  ui.forEach(item => item.destroy()); assert.equal(frames.size, 0); dom.window.close();
});


function mockRasterDrawing(env, pixels, narrowWidth) {
  if (narrowWidth) env.img.getBoundingClientRect = () => ({ left: 20, top: 30, width: narrowWidth, height: 180 });
  const drawn = [], gradients = [], images = [];
  let sequence = 0;
  const context = {
    fillStyle: "", globalAlpha: 1,
    clearRect() {}, drawImage(...args) { images.push(args.slice(1)); }, save() {}, restore() {}, translate() {}, scale() {},
    measureText(value) { return { width: value.length * 7 }; },
    getImageData() { return { data: new Uint8ClampedArray(pixels) }; },
    createRadialGradient() { const stops = []; gradients.push(stops); return { addColorStop(offset, color) { stops.push(color); } }; },
    fillRect() {},
    fillText(text, x, y, maxWidth) { drawn.push({ text, color: this.fillStyle, alpha: this.globalAlpha, maxWidth }); },
  };
  env.window.HTMLCanvasElement.prototype.getContext = () => context;
  env.window.HTMLCanvasElement.prototype.toDataURL = () => "data:image/webp;base64," + Buffer.from("render-" + (++sequence)).toString("base64");
  env.window.Image = class {
    constructor() { this.naturalWidth = 320; this.naturalHeight = 180; }
    set src(value) { this._src = value; Promise.resolve().then(() => { if (this.onload) this.onload(); }); }
  };
  return { drawn, gradients, images };
}

test("blurred replacement contains a consistent white backing and sharp status and retains its retry snapshot", async () => {
  for (const [pixels, color, backing, narrowWidth] of [
    [[0, 0, 0, 255], "#141412", "rgba(255,255,255,0.88)", 80],
    [[255, 255, 255, 255], "#141412", "rgba(255,255,255,0.88)"],
    [[0, 0, 0, 255, 255, 255, 255, 255], "#141412", "rgba(255,255,255,0.88)"],
    [[255, 255, 255, 0], "#141412", "rgba(255,255,255,0.88)"],
  ]) {
    const env = setup();
    const raster = mockRasterDrawing(env, pixels, narrowWidth);
    classifyFlagged(env);
    await Promise.resolve();
    assert.notEqual(env.img.getAttribute("src"), PREVIEW);
    assert.equal(env.shield.isReplacement(env.img), true);
    const status = raster.drawn.find((entry) => entry.text === "NSFW detected") || raster.drawn.find((entry) => entry.text === "detected");
    assert.equal(status.color, color);
    assert.ok(raster.drawn.some((entry) => entry.text.includes("Click")) && raster.drawn.some((entry) => entry.text.includes("retry")));
    assert.equal(raster.gradients[0][0], backing);
    assert.ok(raster.images.every((args) => args[2] <= 320), "a 1x thumbnail is not forcibly upscaled");
    assert.ok(raster.drawn.every((entry) => entry.maxWidth === undefined));
    assert.equal(env.shield.sourceChanged(env.img, env.img, "src"), true);
    assert.equal(env.requests.filter((request) => request.message.act === "nsfw-classify").length, 1);
    const host = env.window.document.querySelector("[data-atlas-nsfw-overlay]");
    host.shadowRoot.querySelector("button").click();
    if (narrowWidth) assert.ok(raster.drawn.some((entry) => entry.text.startsWith("Recheck")) && raster.drawn.some((entry) => entry.text === "model…"));
    const retry = latestRequest(env, "nsfw-retry");
    assert.equal(retry.message.snapshotId, "opaque-snapshot");
    retry.callback({ stage: "strong", isNsfw: true });
    assert.ok(raster.drawn.map((entry) => entry.text).join(" ").includes("NSFW confirmed"));
    assert.equal(env.shield.isReplacement(env.img), true);
    env.dom.window.close();
  }
});

test("failed raster drawing keeps the blurred image and a usable retry control", async () => {
  const env = setup();
  mockRasterDrawing(env, [0, 0, 0, 255]);
  env.window.HTMLCanvasElement.prototype.getContext = () => null;
  classifyFlagged(env);
  await Promise.resolve();
  assert.equal(env.img.getAttribute("src"), PREVIEW);
  assert.equal(env.shield.isReplacement(env.img), true);
  const host = env.window.document.querySelector("[data-atlas-nsfw-overlay]");
  assert.equal(env.window.getComputedStyle(host.shadowRoot.querySelector(".fallback")).display, "none");
  host.shadowRoot.querySelector("button").click();
  assert.equal(latestRequest(env, "nsfw-retry").message.act, "nsfw-retry");
  env.dom.window.close();
});

test("safe confirmation fades the raster status before restoring the original", async () => {
  const env = setup();
  const raster = mockRasterDrawing(env, [0, 0, 0, 255]);
  classifyFlagged(env);
  await Promise.resolve();
  env.window.document.querySelector("[data-atlas-nsfw-overlay]").shadowRoot.querySelector("button").click();
  latestRequest(env, "nsfw-retry").callback({ stage: "strong", isNsfw: false });
  assert.equal(env.shield.isReplacement(env.img), true);
  await new Promise((resolve) => setTimeout(resolve, 380));
  assert.ok(raster.drawn.some((entry) => entry.text === "SFW confirmed" && entry.alpha === 0));
  assert.equal(env.img.getAttribute("src"), "https://img.test/small.jpg");
  assert.equal(env.window.document.querySelector("[data-atlas-nsfw-overlay]"), null);
  env.dom.window.close();
});


test("a late blurred-preview decode cannot overwrite a new site image", () => {
  const env = setup();
  let decoded;
  env.window.Image = class {
    constructor() { decoded = this; this.naturalWidth = 320; this.naturalHeight = 180; }
    set src(value) { this._src = value; }
  };
  classifyFlagged(env);
  env.img.setAttribute("src", "https://img.test/new-image.jpg");
  env.shield.sourceChanged(env.img, env.img, "src");
  decoded.onload();
  assert.equal(env.img.style.getPropertyValue("visibility"), "visible");
  assert.match(env.img.style.getPropertyValue("filter"), /blur/);
  latestRequest(env, "nsfw-prepare-shield", "https://img.test/new-image.jpg").callback({ preparedId: "prepared-new", shieldPreview: PREVIEW, shieldWidth: 640, shieldHeight: 360 });
  assert.equal(env.img.getAttribute("src"), PREVIEW, "the stale decoder cannot restore the original preview over the new source");
  assert.ok(env.requests.some((request) => request.message.act === "nsfw-classify" && request.message.url === "https://img.test/new-image.jpg"));
  env.dom.window.close();
});


test("retry target is hidden when its image is clipped outside a scrolling container", async () => {
  const env = setup('<div id="scroller" style="overflow-x:auto;overflow-y:auto"><img src="https://img.test/small.jpg"></div>');
  mockRasterDrawing(env, [0, 0, 0, 255]);
  const scroller = env.window.document.querySelector("#scroller");
  scroller.getBoundingClientRect = () => ({ left: 0, top: 0, right: 320, bottom: 200, width: 320, height: 200 });
  let top = 300;
  env.img.getBoundingClientRect = () => ({ left: 0, top, width: 320, height: 180 });
  classifyFlagged(env);
  await Promise.resolve();
  const button = env.window.document.querySelector("[data-atlas-nsfw-overlay]").shadowRoot.querySelector("button");
  assert.equal(button.style.visibility, "hidden");
  top = 0;
  scroller.dispatchEvent(new env.window.Event("scroll"));
  env.window.__atlasNsfwImageShieldUi.positionAll();
  assert.equal(button.style.visibility, "visible");
  env.dom.window.close();
});
