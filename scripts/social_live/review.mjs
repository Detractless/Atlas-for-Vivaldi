// Reviews one site's table against the real site: for each part, is what its selectors name on the page,
// is it gone when the part is on, and does the rest of the page still work?
import fs from "fs";
import path from "path";
import { newTab, closeTab, sleep } from "./cdp.mjs";
import { WORLD, injectedSource, MEASURE, SMOKE, SNAPSHOT } from "./inpage.mjs";

const VIEW = { width: 1400, height: 900 };

/** Open `url` in a new tab with the filter engine and the site's table running in an isolated world, and the
    filter set to `initial`. (A new Vivaldi tab answers nothing until it has navigated, and never answers
    Page.enable, so: navigate first, then create the world, and use no enable calls.) */
export async function openPage(port, key, url, opts = {}) {
  const tab = await newTab(port);
  const page = { tab, cdp: tab.cdp, ctx: null, frame: null };
  const nav = await page.cdp.send("Page.navigate", { url });
  page.frame = nav.frameId;
  await sleep(opts.settleMs || 4500);
  await page.cdp.send("Emulation.setDeviceMetricsOverride", { ...VIEW, deviceScaleFactor: 1, mobile: false });
  const world = await page.cdp.send("Page.createIsolatedWorld", { frameId: page.frame, worldName: WORLD });
  page.ctx = world.executionContextId;
  await evalIn(page, injectedSource(key, opts.initial));
  await evalIn(page, "window.__atlasErr = 0; addEventListener('error', function (e) { if (!/ResizeObserver/.test(e.message || '')) window.__atlasErr++; }); addEventListener('unhandledrejection', function () { window.__atlasErr++; }); true", true);
  if (opts.scroll !== false) await scrollThrough(page);
  return page;
}

export const closePage = (port, page) => closeTab(port, page.tab);

/** Run code in the isolated world (or, with `main`, in the page itself). */
export async function evalIn(page, expression, main = false) {
  const params = { expression, returnByValue: true, awaitPromise: true };
  if (!main) params.contextId = page.ctx;
  const r = await page.cdp.send("Runtime.evaluate", params);
  if (r.exceptionDetails) throw new Error("in-page error: " + JSON.stringify(r.exceptionDetails.exception || r.exceptionDetails.text));
  return r.result.value;
}

/** Scroll down and back up, so lazy-loaded parts of the page exist before they are measured. */
async function scrollThrough(page) {
  await evalIn(page, "window.scrollTo(0, 2200)");
  await sleep(1200);
  await evalIn(page, "window.scrollTo(0, 0)");
  await sleep(1000);
}

/** Point the mouse at the first element `selector` finds, e.g. a thumbnail whose preview should play. */
export async function hover(page, selector) {
  const c = await evalIn(page, `(function(){var e=document.querySelector(${JSON.stringify(selector)});if(!e)return null;var b=e.getBoundingClientRect();return{x:b.left+b.width/2,y:b.top+b.height/2};})()`);
  if (!c) return false;
  await page.cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: c.x, y: c.y });
  await sleep(1800);
  return true;
}

export const setFilter = (page, value) => evalIn(page, `window.__atlasStub.setFilter(${JSON.stringify(value)}), true`);
export const measure = (page, part) => evalIn(page, `${MEASURE}(${JSON.stringify(part)})`);

/** A clip around `box`, at least 520 x 260, kept inside the window; the whole window when there is no box. */
export function clipFor(box) {
  if (!box) return { x: 0, y: 0, ...VIEW, scale: 1 };
  const w = Math.min(VIEW.width, Math.max(520, box.r - box.l + 48)), h = Math.min(VIEW.height, Math.max(260, box.b - box.t + 48));
  const x = Math.max(0, Math.min(VIEW.width - w, (box.l + box.r) / 2 - w / 2));
  const y = Math.max(0, Math.min(VIEW.height - h, (box.t + box.b) / 2 - h / 2));
  return { x: Math.round(x), y: Math.round(y), width: Math.round(w), height: Math.round(h), scale: 1 };
}

export async function shot(page, clip, file) {
  const r = await page.cdp.send("Page.captureScreenshot", { format: "jpeg", quality: 62, clip });
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.from(r.data, "base64"));
  return file;
}

/** One part, one page: before, then the part on, then off again. */
export async function checkPart(page, part, dir, hold) {
  if (hold) await hover(page, hold);
  let before = await measure(page, part);
  if (before.box && (before.box.t > VIEW.height - 80 || before.box.b < 80)) {
    await evalIn(page, `window.scrollBy(0, ${Math.round(before.box.t - 140)})`);   /* bring it on screen for the crop */
    await sleep(900);
    before = await measure(page, part);
  }
  const clip = clipFor(before.box);
  const [sx, sy] = await evalIn(page, "[window.scrollX, window.scrollY]");   // a screenshot clip is in page coordinates, not window ones
  clip.x += Math.round(sx);
  clip.y += Math.round(sy);
  const beforeShot = await shot(page, clip, path.join(dir, `${part}-before.jpg`));
  await setFilter(page, { mode: "parts", parts: [part] });
  await sleep(1000);
  const after = await measure(page, part);
  const afterShot = await shot(page, clip, path.join(dir, `${part}-after.jpg`));
  await setFilter(page, { mode: "off", parts: [] });
  await evalIn(page, "window.scrollTo(0, 0)");
  await sleep(500);
  const status = before.visible === 0 ? "not-visible" : after.visible === 0 && !after.trips ? "pass" : "fail";
  return { part, status, before: slim(before), after: slim(after), beforeShot, afterShot };
}

const slim = (m) => ({ route: m.route, matches: m.matches, visible: m.visible, trips: m.trips, tripWhy: m.tripWhy });

/** Every listed part on at once: the page must still be there (landmarks, search, player) and quiet. */
export async function checkAll(page, parts, dir) {
  const errorsBefore = await evalIn(page, "window.__atlasErr || 0", true);
  await setFilter(page, { mode: "parts", parts });
  await sleep(1800);
  const smoke = await evalIn(page, SMOKE);
  const trips = await evalIn(page, "document.documentElement.getAttribute('data-atlas-social-trips') || ''");
  const file = await shot(page, { x: 0, y: 0, ...VIEW, scale: 1 }, path.join(dir, "all-on.jpg"));
  await setFilter(page, { mode: "off", parts: [] });
  const bad = [...Object.entries(smoke.landmarks), ...Object.entries(smoke.smoke)].filter(([, v]) => v === "hidden").map(([k]) => k);
  return { smoke, trips, newPageErrors: (await evalIn(page, "window.__atlasErr || 0", true)) - errorsBefore, hiddenByUs: bad, shot: file };
}

export async function snapshot(page, file) {
  const html = await evalIn(page, SNAPSHOT);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, html);
  return html.length;
}

/** A check the page plan writes itself, for parts that are behaviour rather than hiding (autoplay switched off,
    a count stripped from the tab title): turn the part on, wait, run `expr` in the page, compare with `expect`. */
export async function checkCustom(page, c) {
  await setFilter(page, { mode: "parts", parts: [c.part] });
  await sleep(c.waitMs || 2500);
  const got = await evalIn(page, c.expr, true);
  await setFilter(page, { mode: "off", parts: [] });
  const status = JSON.stringify(got) === JSON.stringify(c.expect) ? "pass" : "fail";
  return { part: c.part, kind: "custom", name: c.name || c.expr.slice(0, 40), status, got, expect: c.expect };
}
