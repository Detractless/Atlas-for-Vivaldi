// End to end, with the INSTALLED Atlas, in a throw-away signed-out Vivaldi: the social media filter as a user gets it.
//
//   node scripts/social_e2e_check.mjs [--port 9390]
//
// Unlike scripts/social_live_check.mjs (which injects the engine itself), this relies on the real registration:
// Atlas registers the page scripts, the Settings value is written the way Settings writes it (chrome.storage.sync
// in Vivaldi's own extension context), and the page is opened like any tab. Checks: the scripts are registered;
// filter off adds nothing; parts adds the chosen part's style and hides it; switching the setting changes the
// open page without a reload; "block social sites entirely" lands on the block page; a site the filter does
// not cover is left alone. Prints one line per check and exits 1 if any failed.
import os from "os";
import path from "path";
import { launch, shutdown, newTab, closeTab, sleep, Cdp } from "./social_live/cdp.mjs";

const args = process.argv.slice(2);
const portIdx = args.indexOf("--port");
const port = portIdx >= 0 ? Number(args[portIdx + 1]) : 9390;
const profile = path.join(os.tmpdir(), `atlas-sf-e2e-${port}`);
const WATCH = "https://www.youtube.com/watch?v=jNQXAC9IVRw";
const PART = "likes", TARGET = "segmented-like-dislike-button-view-model";   // above the fold on a watch page, so no lazy loading is involved
const results = [];
const check = (name, ok, detail = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  - " + detail : ""}`); };

await launch({ port, dir: profile });
let failed = true;
try {
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const ui = targets.find((t) => /\/window\.html$/.test(t.url));
  const uiCdp = await Cdp.connect(ui.webSocketDebuggerUrl);
  const inUi = async (expression) => (await uiCdp.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })).result.value;
  const setFilter = (v) => inUi(`new Promise((r) => chrome.storage.sync.set({ socialFilter: ${JSON.stringify(v)} }, () => r(true)))`);

  await sleep(6000);   // Atlas registers its scripts as Vivaldi's window starts
  const ids = await inUi("new Promise((r) => chrome.scripting.getRegisteredContentScripts((l) => r(l.map((s) => s.id))))");
  const wanted = ["youtube", "reddit", "twitch", "x", "instagram", "tiktok", "facebook", "snapchat"].map((k) => "atlas-social-" + k);
  check("the page scripts of all 8 sites are registered", wanted.every((i) => ids.includes(i)), ids.filter((i) => i.startsWith("atlas-social")).length + " found");

  const open = async (url, waitMs = 6000) => {
    const tab = await newTab(port);
    await tab.cdp.send("Page.navigate", { url });
    await sleep(waitMs);
    const page = { tab, eval: async (e) => (await tab.cdp.send("Runtime.evaluate", { expression: e, returnByValue: true })).result.value };
    return page;
  };
  const state = async (p) => { for (let i = 0; i < 20; i++) { if (await p.eval(`!!document.querySelector(${JSON.stringify(TARGET)})`)) break; await sleep(1000); } return stateNow(p); };
  const stateNow = (p) => p.eval(`JSON.stringify({ href: location.href, route: document.documentElement.getAttribute('data-atlas-route'),
    styles: [...document.querySelectorAll('style[data-atlas-social]')].map((s) => s.getAttribute('data-atlas-social')),
    trips: document.documentElement.getAttribute('data-atlas-social-trips'), ms: document.documentElement.getAttribute('data-atlas-social-ms'),
    targetDisplay: document.querySelector(${JSON.stringify(TARGET)}) ? getComputedStyle(document.querySelector(${JSON.stringify(TARGET)})).display : 'missing' })`).then(JSON.parse);

  await setFilter({ mode: "off", parts: [PART] });
  let p = await open(WATCH);
  let s = await state(p);
  check("filter off: nothing added to the page", s.styles.length === 0 && !s.route, JSON.stringify(s));

  await setFilter({ mode: "parts", parts: [PART] });
  await sleep(500);
  const live = await open(WATCH, 8000);
  s = await state(live);
  check("parts: the chosen part's style is on the page, on the watch route", s.styles.join() === PART && s.route === "watch", JSON.stringify(s));
  check("parts: the like buttons are hidden (display: none), no guard trip", s.targetDisplay === "none" && !s.trips, "display " + s.targetDisplay);
  check("parts: the style is on within half a second of the page starting", Number(s.ms) > 0 && Number(s.ms) < 500, "first style at " + s.ms + " ms");

  await setFilter({ mode: "off", parts: [PART] });
  await sleep(1500);
  s = await state(live);
  check("switching to off changes the open page without a reload, and the like buttons are no longer hidden (so it was the part that hid them)", s.styles.length === 0 && !s.route && s.targetDisplay !== "none" && s.targetDisplay !== "missing", JSON.stringify(s));
  await closeTab(port, live.tab);
  await closeTab(port, p.tab);

  await setFilter({ mode: "all", parts: [] });
  await sleep(500);
  p = await open(WATCH, 5000);
  s = await state(p);
  check("block sites entirely: the site lands on the block page", /\/gate\.html\?why=social&site=YouTube/.test(s.href), s.href);
  await closeTab(port, p.tab);

  p = await open("https://example.com/", 3000);
  s = await state(p);
  check("block sites entirely: another site is left alone", s.href.startsWith("https://example.com/"), s.href);
  await closeTab(port, p.tab);

  await setFilter({ mode: "off", parts: [] });
  failed = results.some((r) => !r);
} catch (e) {
  console.log("FAIL  the check itself broke: " + (e.message || e));
} finally {
  shutdown(profile);
}
process.exit(failed ? 1 : 0);
