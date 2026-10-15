// src/settings/controls.js — the Settings page controls. Each reads and writes
// one setting through the registry, which saves it at once.
import { getSetting, setSetting } from './registry.js';
import { lockedMax, activeLock } from '../utils/saturationLock.js';
import { flushSaturation, lockSaturation } from '../components/colorLock/colorLock.js';

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

const LIMITS = Object.fromEntries(["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10"].map((v) => [v, v === "0" ? "Off" : v]));
const DELAYS = { "0": "Off", "15": "15 seconds", "30": "30 seconds", "60": "1 minute", "120": "2 minutes", "300": "5 minutes" };
const SCALES = { "0.75": "75%", "0.9": "90%", "1": "100%", "1.1": "110%", "1.25": "125%" };
const SATURATIONS = { "0": "0% (Monochrome)", "25": "25% (Muted)", "50": "50% (Balanced)", "75": "75% (Subtle)", "100": "100% (Full color)" };

/* The theme is one object (mode + custom colours); the page only picks the mode. */
const theme = {
  options: options({ "system": "System", "light": "Light", "dark": "Dark", "custom": "Custom" }),
  get: () => (getSetting("Theme") && getSetting("Theme").Theme) || "dark",
  set: (mode) => setSetting("Theme", Object.assign({}, getSetting("Theme"), { Theme: mode })),
};

export const CONTROLS = {
  saturation: {
    get: () => {
      const v = getSetting("saturation");
      return typeof v === "number" ? v : 100;
    },
    /* The highest level the slider may reach now: 100, or the ceiling while a lock holds. */
    max: () => lockedMax(getSetting("saturationLock")),
    set: (v) => setSetting("saturation", parseInt(v, 10)),
    flush: flushSaturation,
    /* The lock button: true while a lock you pressed is holding. */
    locked: () => !!activeLock(getSetting("saturationLock")),
    lock: lockSaturation
  },
  showQuery: flag("showQueryOnDelay"),
  engine: choice("searchEngineBehavior", { "remember": "Remember last selected", "always-default": "Always reset to default" }),
  pills: choice("bookmarkPillBehavior", { "prefix": "When typing ./", "always": "Always", "never": "Never" }),
  theme,
  scale: numberChoice("uiScale", SCALES, parseFloat),
  limit: numberChoice("tabLimit", LIMITS, (v) => parseInt(v, 10)),
  method: choice("managementMethod", { "random": "Close a random tab", "block": "Block the new tab" }),
  delay: numberChoice("searchDelaySeconds", DELAYS, (v) => parseInt(v, 10)),
};

/** The label of a control's current value, or "-". */
export function labelOf(key) {
  const c = CONTROLS[key], v = c.get();
  if (!c.options) return String(v);
  const o = c.options.find((x) => String(x.value) === String(v));
  return o ? o.label : "-";
}
