// src/settings/pages.js — what each Settings page shows. Every function returns
// HTML; settings/shell.js renders it and wires the clicks.
import { CONTROLS, labelOf, socialPartState } from './controls.js';
import { getSetting } from './registry.js';
import { I, row, card, section, select, toggle, slider, lockButton, modeThumb, saturationPreview, chip } from './markup.js';
import { lockState, unlockTime, unlockSecondsLeft } from '../utils/focusLock.js';
import { formatTimeCompact } from '../utils/formatDuration.js';
import { pendingIncreaseText } from '../components/tabLimiter/tabLimiterUI.js';
import { pendingDecreaseText } from '../components/searchDelay/searchDelay.js';
import { usagePage } from './usagePage.js';
import { LIVE_SITES, partsLive, GROUPS, normalize } from '../utils/socialFilter.js';
import { restingPane } from './chipPane.js';
import { scrollFadeSection } from './scrollFadePage.js';

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

const partsNote = () => (partsLive() === "none" ? "Blocks whole sites; parts are not blocking yet." : `Parts block on ${LIVE_SITES.join(", ")}.`);
/* Under each locked setting on Focus: what the lock does (open), or that it is locked (held). */
const LOCK_TEXT = {
  tabLimit: { open: "Lock it to stop it going higher.", held: "Locked. It can go lower, but not higher." },
  searchDelaySeconds: { open: "A pause before results. Lock it to stop it getting shorter.", held: "Locked. It can get longer, but not shorter." },
  saturation: { open: "Lock it to stop going back to color.", held: "Locked. It can go grayer, but not back to color." },
  nsfwAction: { open: "Lock it to prevent turning the shield off.", held: "Locked. You can make it more protective, but not turn it off." },
  // Whole sites can always be blocked; the parts work on the sites in LIVE_SITES (utils/socialFilter.js), and the page says which.
  socialFilter: {
    open: partsLive() === "all" ? "Hide the parts of social sites that pull you in. Lock it to prevent turning it off." : `${partsNote()} Lock it to prevent turning it off.`,
    held: "Locked. You can block more, but not less." + (partsLive() === "all" ? "" : ` ${partsNote()}`),
  },
  scrollFade: { open: "Dims every page as you keep scrolling. Lock it to stop it getting weaker.", held: "Locked. It can get stronger, but not weaker." },
};
/* A change queued by the version before the locks, shown until it finishes (tabLimiterUI.js, searchDelay.js). */
const QUEUED = {
  tabLimit: () => pendingIncreaseText(getSetting("pendingIncrease")),
  searchDelaySeconds: () => pendingDecreaseText(getSetting("pendingDelayDecrease")),
  saturation: () => "",
  nsfwAction: () => "",
  socialFilter: () => "",
  scrollFade: () => "",
};
export const clockTime = (ms) => new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
/** The note under a locked setting (`key`: tabLimit, searchDelaySeconds, saturation, nsfwAction, socialFilter or scrollFade). */
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

/** The parts of the social media filter, as pills in groups with a panel beside them, shown while its mode is "Block selected
    parts". The panel (settings/chipPane.js) shows the part you point at. */
function socialChips() {
  if (normalize(getSetting("socialFilter")).mode !== "parts") return "";
  const groups = GROUPS.map((g) =>
    `<div class="sp-chip-label">${g.label}</div><div class="sp-chips">` +
    g.parts.map((p) => { const s = socialPartState(p.id); return chip(p.id, p.label, s.on, s.held); }).join("") + `</div>`
  ).join("");
  return `<div class="sp-chip-box"><div class="sp-chip-split"><div class="sp-chip-area">${groups}</div>` +
    `<aside class="sp-chip-pane" id="sp-chip-pane" aria-live="polite">${restingPane()}</aside></div></div>`;
}

function focusPage() {
  const nsfwRows = [
    row("NSFW image detection", lockNote("nsfwAction"), selectFor("nsfwAction") + lockFor("nsfwAction")),
    row("Social media filter", lockNote("socialFilter"), selectFor("socialFilter") + lockFor("socialFilter")),
    socialChips(),
  ];
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
  ])]) +
  scrollFadeSection(lockNote("scrollFade"), lockFor("scrollFade")) +
  section("Content shield", [card(nsfwRows)]);
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
