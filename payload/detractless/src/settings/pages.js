// src/settings/pages.js — what each Settings page shows. Every function returns
// HTML; settings/shell.js renders it and wires the clicks.
import { CONTROLS, labelOf } from './controls.js';
import { getSetting } from './registry.js';
import { I, row, card, section, select, toggle, slider, lockButton, modeThumb, saturationPreview } from './markup.js';
import { lockState, unlockTime, unlockSecondsLeft } from '../utils/focusLock.js';
import { formatTimeCompact } from '../utils/formatDuration.js';
import { pendingIncreaseText } from '../components/tabLimiter/tabLimiterUI.js';
import { pendingDecreaseText } from '../components/searchDelay/searchDelay.js';
import { usagePage } from './usagePage.js';

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
    card([row("Theme", "", `<div class="sp-modes" role="radiogroup">${thumbs}</div>`)])
  ]);
}

/* Under each locked setting on Focus: what the lock does (open), or that it is locked (held). */
const LOCK_TEXT = {
  tabLimit: { open: "Lock it to stop it going higher.", held: "Locked. It can go lower, but not higher." },
  searchDelaySeconds: { open: "A pause before results. Lock it to stop it getting shorter.", held: "Locked. It can get longer, but not shorter." },
  saturation: { open: "Lock it to stop going back to color.", held: "Locked. It can go grayer, but not back to color." },
};
/* A change queued by the version before the locks, shown until it finishes (tabLimiterUI.js, searchDelay.js). */
const QUEUED = {
  tabLimit: () => pendingIncreaseText(getSetting("pendingIncrease")),
  searchDelaySeconds: () => pendingDecreaseText(getSetting("pendingDelayDecrease")),
  saturation: () => "",
};
export const clockTime = (ms) => new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
/** The note under a locked setting (`key`: tabLimit, searchDelaySeconds or saturation). */
export function lockNote(key) {
  const locks = getSetting("focusLocks"), state = lockState(locks, key);
  if (state === "unlocking") return `Unlocks at ${clockTime(unlockTime(locks, key))}. Click the lock to keep it locked.`;
  return QUEUED[key]() || LOCK_TEXT[key][state];
}
export const lockCountdown = (key) => formatTimeCompact(unlockSecondsLeft(getSetting("focusLocks"), key));
const lockFor = (key) => {
  const state = lockState(getSetting("focusLocks"), key);
  return lockButton(key, state, lockCountdown(key));
};

function focusPage() {
  return section("Tab limiter", [card([
    row("Tab limit", lockNote("tabLimit"), selectFor("limit") + lockFor("tabLimit")),
    row("When the limit is hit", "", selectFor("method"))
  ])]) +
  section("Search delay", [card([
    row("Delay", lockNote("searchDelaySeconds"), selectFor("delay") + lockFor("searchDelaySeconds")),
    row("Show the search query", "While you wait", toggleFor("showQuery"))
  ])]) +
  section("Display", [card([
    row("Color saturation", lockNote("saturation"), slider("saturation", CONTROLS.saturation.get(), 0, 100) + lockFor("saturation")) +
      saturationPreview(CONTROLS.saturation.get())
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

/** Page id -> render(). profilesPage.js adds "profiles" through AtlasSettingsUI.register.
    There is no Pages page any more: pages are added, renamed, moved and deleted in the address bar (Add page, and
    right-click a page in the new tab's page switcher). */
export const PAGES = {
  search: searchPage,
  appearance: appearancePage,
  focus: focusPage,
  usage: usagePage,
  backup: backupPage,
  reset: resetPage,
};

export const NAV = [
  { group: "General", items: [
    { id: "search", label: "Search", icon: I.search },
    { id: "appearance", label: "Appearance", icon: I.sun },
    { id: "focus", label: "Focus", icon: I.focus },
    { id: "usage", label: "Usage", icon: I.chart }
  ] },
  { group: "Data", items: [
    { id: "backup", label: "Backup", icon: I.db },
    { id: "reset", label: "Reset", icon: I.reset },
    { id: "review", label: "Leave a review", icon: I.star, external: true }
  ] }
];
