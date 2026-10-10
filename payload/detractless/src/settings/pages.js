// src/settings/pages.js — what each Settings page shows. Every function returns
// HTML; settings/shell.js renders it and wires the clicks.
import { CONTROLS, labelOf } from './controls.js';
import { getSetting } from './registry.js';
import { I, row, card, section, select, toggle, modeThumb, scalePreview } from './markup.js';
import { pendingIncreaseText } from '../components/tabLimiter/tabLimiterUI.js';
import { pendingDecreaseText } from '../components/searchDelay/searchDelay.js';
import { pagesPage } from './pagesSection.js';

export const REVIEW_URL = "https://chromewebstore.google.com/detail/ipgmbcinekdcmhhnbanlahedgpehffab";

/** The reset page asks before erasing; this is whether it is asking. */
export const resetState = { confirming: false };

const selectFor = (key) => select(key, labelOf(key));
const toggleFor = (key) => toggle(key, CONTROLS[key].get());

function searchPage() {
  return section("", [card([
    row("Engine preference", "Which engine the address bar starts with", selectFor("engine")),
    row("Bookmark pills", "When bookmark pills appear while typing", selectFor("pills"))
  ])]);
}

function appearancePage() {
  const mode = CONTROLS.theme.get();
  const thumbs = modeThumb("system", mode === "system") +
    modeThumb("light", mode === "light", "#fafafa", "#ececec", "#c9c9c9") +
    modeThumb("dark", mode === "dark", "#1c1c1c", "#2e2e2e", "#555");
  return section("Visual style", [
    card([row("Theme", "", `<div class="sp-modes" role="radiogroup">${thumbs}</div>`)]),
    card([row("UI scale", "Size of everything on the new tab", selectFor("scale")) + scalePreview(getSetting("uiScale"))])
  ]);
}

function focusPage() {
  const limitNote = pendingIncreaseText(getSetting("pendingIncrease")) || "Decreases apply now. Increases take 30 minutes.";
  const delayNote = pendingDecreaseText(getSetting("pendingDelayDecrease")) ||
    "A pause before results, to make searching deliberate. Increases apply now. Decreases take 30 minutes.";
  return section("Tab limiter", [card([
    row("Tab limit", limitNote, selectFor("limit")),
    row("When the limit is hit", "", selectFor("method"))
  ])]) +
  section("Search delay", [card([
    row("Delay", delayNote, selectFor("delay")),
    row("Show the search query", "While you wait", toggleFor("showQuery"))
  ])]) +
  section("Display", [card([
    row("Grayscale", "Remove color from the new tab", toggleFor("grayscale"))
  ])]);
}

function backupPage() {
  return section("", [card([
    row("Export", "Save your bookmarks, settings and snippets to a .detractless file", `<button class="sp-pill" data-action="export">Export</button>`),
    row("Import", "Bring in a .detractless, .pastekit or .json file", `<button class="sp-pill" data-action="import">Import</button>`)
  ])]);
}

function resetPage() {
  const asking = resetState.confirming;
  return section("", [card([
    row("Reset everything", "Erases bookmarks, settings and snippets stored on this computer", asking ? "" : `<button class="sp-pill danger" data-action="reset-ask">Reset</button>`),
    ...(asking ? [`<div class="sp-confirm"><div class="sp-row-desc">This cannot be undone. Everything stored on this computer is deleted.</div><div class="sp-confirm-btns"><button class="sp-pill" data-action="reset-cancel">Cancel</button><button class="sp-pill danger" data-action="reset-go">Erase everything</button></div></div>`] : [])
  ])]);
}

/** Page id -> render(). profilesPage.js adds "profiles" through AtlasSettingsUI.register. */
export const PAGES = {
  pages: pagesPage,
  search: searchPage,
  appearance: appearancePage,
  focus: focusPage,
  backup: backupPage,
  reset: resetPage,
};

export const NAV = [
  { group: "Settings", items: [
    { id: "search", label: "Search", icon: I.search },
    { id: "pages", label: "Pages", icon: I.pages },
    { id: "appearance", label: "Appearance", icon: I.sun },
    { id: "focus", label: "Focus", icon: I.focus }
  ] },
  { group: "Data", items: [
    { id: "backup", label: "Backup", icon: I.db },
    { id: "reset", label: "Reset", icon: I.reset },
    { id: "review", label: "Leave a review", icon: I.star, external: true }
  ] }
];
