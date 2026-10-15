// src/settings/usagePage.js — Settings > Usage: which sites take your time, from the totals the page
// script collects (components/atlas/atlas-usage.js, utils/usageLog.js). Everything stays on this computer.
import { row, card, section } from './markup.js';
import { storageGet } from '../services/storage.js';
import { summarize, derived, clock } from '../utils/usageLog.js';
import { sendToBackground } from '../services/backgroundMessenger.js';

const RANGES = [{ days: 1, label: "Today" }, { days: 7, label: "7 days" }, { days: 30, label: "30 days" }];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const SITES_SHOWN = 15;

const state = { store: null, loadedAt: 0, loading: false, range: 7, armed: false, watching: false };

/** Draw again, only when Settings is showing this page (a redraw elsewhere could interrupt a drag). */
function redrawIfShowing() {
  const ui = window.AtlasSettingsUI;
  if (ui && ui.current() === "usage") ui.rerender();
}

function load() {
  state.loading = true;
  storageGet("local", ["atlas_usage"]).then((r) => {
    state.loading = false;
    state.loadedAt = Date.now();
    const next = r.atlas_usage || {};
    if (JSON.stringify(next) !== JSON.stringify(state.store)) { state.store = next; redrawIfShowing(); }
  });
}

/* The totals change while you browse: keep the page current if it is open. */
function watch() {
  if (state.watching || !window.chrome || !chrome.storage || !chrome.storage.onChanged) return;
  state.watching = true;
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes.atlas_usage) return;
    state.store = changes.atlas_usage.newValue || {};
    redrawIfShowing();
  });
}

const pct = (x) => `${Math.round(x * 100)}%`;
const one = (x) => (Math.round(x * 10) / 10).toString();

function rangeRow() {
  const buttons = RANGES.map((r) => `<button class="sp-seg-btn" data-action="usage-range" data-days="${r.days}" aria-pressed="${r.days === state.range}">${r.label}</button>`).join("");
  return row("Show", "", `<div class="sp-seg" role="group" aria-label="Time span">${buttons}</div>`);
}

/* A site's row shows its name, a bar and its time. How the time was spent opens under the name when
   the pointer is over the row, or the row has the keyboard (settingsPage.css, .sp-usage-site). */
function siteRows(sum) {
  const top = sum.sites.slice(0, SITES_SHOWN);
  const most = Math.max(1, ...top.map((s) => s.visibleMs));
  return top.map((s) => {
    const d = derived(s);
    const bits = [`hands on ${pct(d.handsOnShare)}`, `${s.pageViews} page view${s.pageViews === 1 ? "" : "s"}`, `${one(d.imagesPerMin)} images a minute`];
    if (d.mediaMs > 0) bits.push(`${clock(d.mediaMs)} of video or audio`);
    const bar = `<span class="sp-usage-bar" aria-hidden="true"><i style="width:${Math.max(3, Math.round((s.visibleMs / most) * 100))}%"></i></span>`;
    return `<div class="sp-row sp-usage-site" tabindex="0"><div class="sp-row-text"><div class="sp-row-title">${esc(s.host)}</div>` +
      `<div class="sp-row-desc">${bits.join(" · ")}</div></div><div class="sp-row-ctrl">${bar}<span class="sp-usage-time">${clock(s.visibleMs)}</span></div></div>`;
  });
}

function clearRow() {
  return state.armed
    ? `<div class="sp-confirm"><div class="sp-row-desc">This erases every total on this computer. It cannot be undone.</div><div class="sp-confirm-btns"><button class="sp-pill danger" data-action="usage-clear-go">Clear</button><button class="sp-pill" data-action="usage-clear-cancel">Cancel</button></div></div>`
    : row("Clear usage data", "Erases the totals below on this computer", `<button class="sp-pill danger" data-action="usage-clear">Clear</button>`);
}

export function usagePage() {
  watch();
  if (!state.loading && Date.now() - state.loadedAt > 5000) load();
  const intro = row("Where your time goes", "Totals per site, saved on this computer only. Site names and numbers; never page addresses, titles, or what you type.", "");
  if (state.store === null) return section("", [card([intro, row("Loading…", "", "")])]);
  const sum = summarize(state.store, { days: state.range });
  const top = card([intro, rangeRow()]);
  const body = sum.sites.length
    ? section("By site", [card(siteRows(sum))]) + `<div class="sp-usage-hint">Move over a site, or Tab to it, to see how the time was spent.</div>`
    : section("", [card([row("Nothing recorded yet", "Open a few pages and come back; the totals fill in as you browse.", "")])]);
  return section("", [top]) + body + section("", [card([clearRow()])]);
}

/** Clicks on this page (data-action="usage-..."). `redraw` draws the page again. */
export function usageAction(act, el, redraw) {
  if (act === "usage-range") { state.range = parseInt(el.dataset.days, 10) || 7; redraw(); }
  else if (act === "usage-clear") { state.armed = true; redraw(); }
  else if (act === "usage-clear-cancel") { state.armed = false; redraw(); }
  else if (act === "usage-clear-go") {
    state.armed = false;
    sendToBackground({ action: "clearUsage" }).then(() => { state.store = {}; state.loadedAt = Date.now(); redraw(); });
  }
}
