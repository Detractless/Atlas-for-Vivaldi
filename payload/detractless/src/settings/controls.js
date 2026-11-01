// src/settings/controls.js — the Settings page controls. Each reads and writes
// one setting through the registry, which saves it at once.
import { getSetting, setSetting } from './registry.js';
import { lockState, changeAllowed } from '../utils/focusLock.js';
import { clickFocusLock } from '../services/focusLocks.js';
import { flushSaturation, clickSaturationLock } from '../components/colorLock/colorLock.js';
import { MODES, normalize, withMode, togglePart } from '../utils/socialFilter.js';

const options = (labels) => Object.entries(labels).map(([value, label]) => ({ value, label }));

function choice(key, labels) {
  return {
    options: options(labels),
    get: () => String(getSetting(key)),
    set: (v) => setSetting(key, v),
  };
}

function numberChoice(key, labels, parse) {
  return {
    options: options(labels),
    get: () => String(getSetting(key)),
    set: (v) => setSetting(key, parse(v)),
  };
}

const flag = (key) => ({ get: () => !!getSetting(key), set: (v) => setSetting(key, !!v) });
const text = (key) => ({ get: () => String(getSetting(key) || ""), set: (v) => setSetting(key, String(v).trim()) });

const LIMITS = Object.fromEntries(["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10"].map((v) => [v, v === "0" ? "Off" : v]));
const DELAYS = { "0": "Off", "15": "15 seconds", "30": "30 seconds", "60": "1 minute", "120": "2 minutes", "300": "5 minutes" };
const SATURATIONS = { "0": "0% (Monochrome)", "25": "25% (Muted)", "50": "50% (Balanced)", "75": "75% (Subtle)", "100": "100% (Full color)" };

/* The theme is one object (mode + custom colours); the page only picks the mode. */
const theme = {
  options: options({ "system": "System", "light": "Light", "dark": "Dark", "custom": "Custom" }),
  get: () => (getSetting("Theme") && getSetting("Theme").Theme) || "dark",
  set: (mode) => setSetting("Theme", Object.assign({}, getSetting("Theme"), { Theme: mode })),
};

/* A control with a lock beside it (utils/focusLock.js): its lock's state, what clicking the lock does, and
   which values it may take now (menu.js greys out the rest). */
function lockable(control, key, click = () => clickFocusLock(key)) {
  return Object.assign(control, {
    lockKey: key,
    lockState: () => lockState(getSetting("focusLocks"), key),
    clickLock: click,
    allows: (v) => changeAllowed(getSetting("focusLocks"), key, getSetting(key), v),
  });
}

const saturation = {
  get: () => {
    const v = getSetting("saturation");
    return typeof v === "number" ? v : 100;
  },
  /* The highest level the slider may reach now: 100, or where it is while locked (it can only go grayer). */
  max: () => (lockState(getSetting("focusLocks"), "saturation") === "open" ? 100 : saturation.get()),
  set: (v) => setSetting("saturation", parseInt(v, 10)),
  flush: flushSaturation,
};

const NSFW_ACTIONS = {
  off: "Off",
  blur: "Blur image",
  blackout: "Make image black"
};
/* The social media filter is one setting, { mode, parts }: the mode is the pill, the parts are the chips (pages.js), and one
   lock covers both (utils/socialFilter.js says when a change loosens it). */
const socialFilter = lockable({
  options: options(MODES),
  get: () => normalize(getSetting("socialFilter")).mode,
  set: (mode) => setSetting("socialFilter", withMode(getSetting("socialFilter"), mode)),
}, "socialFilter");
socialFilter.allows = (mode) => changeAllowed(getSetting("focusLocks"), "socialFilter", getSetting("socialFilter"), withMode(getSetting("socialFilter"), mode));

/** Choose or unchoose one part of the filter. False when its lock stops it: a chosen part can't be unchosen while locked. */
export function toggleSocialPart(id) {
  const now = getSetting("socialFilter"), next = togglePart(now, id);
  if (!changeAllowed(getSetting("focusLocks"), "socialFilter", now, next)) return false;
  setSetting("socialFilter", next);
  return true;
}

/** Whether a part is chosen, and whether the lock holds it chosen. */
export function socialPartState(id) {
  const f = normalize(getSetting("socialFilter")), on = f.parts.includes(id);
  return { on, held: on && f.mode === "parts" && lockState(getSetting("focusLocks"), "socialFilter") !== "open" };
}

export const CONTROLS = {
  nsfwAction: lockable(choice("nsfwAction", NSFW_ACTIONS), "nsfwAction"),
  socialFilter,
  saturation: lockable(saturation, "saturation", clickSaturationLock),
  showQuery: flag("showQueryOnDelay"),
  engine: choice("searchEngineBehavior", { "remember": "Remember last selected", "always-default": "Always reset to default" }),
  pills: choice("bookmarkPillBehavior", { "prefix": "When typing ./", "always": "Always", "never": "Never" }),
  theme,
  limit: lockable(numberChoice("tabLimit", LIMITS, (v) => parseInt(v, 10)), "tabLimit"),
  method: choice("managementMethod", { "random": "Close a random tab", "block": "Block the new tab" }),
  delay: lockable(numberChoice("searchDelaySeconds", DELAYS, (v) => parseInt(v, 10)), "searchDelaySeconds"),
};

/** The control whose lock is `key` (tabLimit, searchDelaySeconds, saturation, nsfwAction or socialFilter). */
export const lockControl = (key) => Object.values(CONTROLS).find((c) => c.lockKey === key);

/** The label of a control's current value, or "-". */
export function labelOf(key) {
  const c = CONTROLS[key], v = c.get();
  if (!c.options) return String(v);
  const o = c.options.find((x) => String(x.value) === String(v));
  return o ? o.label : "-";
}
