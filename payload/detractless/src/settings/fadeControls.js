// src/settings/fadeControls.js — the Scroll fade controls on Settings > Focus. All of them change the one setting
// `scrollFade` (utils/scrollFade.js), and one lock covers them all: while it holds, a change that would loosen the fade
// (looser() in utils/scrollFade.js) is refused. settings/scrollFadePage.js draws them.
import { getSetting, setSetting } from './registry.js';
import { lockState, changeAllowed } from '../utils/focusLock.js';
import { lockable } from './lockable.js';
import { normalize, withField, cleanSite, BY, MINUTES, SCREENS, REST_SECONDS, WAIT_MINUTES, DARKEST_MIN, DARKEST_MAX } from '../utils/scrollFade.js';

export const fade = () => normalize(getSetting("scrollFade"));
const locks = () => getSetting("focusLocks");
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
export const minutesLabel = (m) => plural(m, "minute", "minutes");
export const screensLabel = (n) => plural(n, "screen", "screens");
export const restLabel = (s) => (s < 60 ? plural(s, "second", "seconds") : minutesLabel(s / 60));

/** One field of the setting as a pill with a menu: `list()` gives the choices ({ value, label }), `parse` turns a chosen
    value into the field's, `read` turns the field into a choice's value. */
function pick(name, list, parse, read = String) {
  const next = (v) => withField(getSetting("scrollFade"), name, parse(v));
  const control = lockable({
    get options() { return list(); },
    get: () => read(fade()[name]),
    set: (v) => setSetting("scrollFade", next(v)),
  }, "scrollFade");
  /* lockable() names the lock's own test, which compares the value with the setting; this one is a field of it. */
  control.allows = (v) => changeAllowed(locks(), "scrollFade", getSetting("scrollFade"), next(v));
  return control;
}

const fixed = (labels) => () => Object.entries(labels).map(([value, label]) => ({ value, label }));
/* The usual numbers, plus a saved one that is not among them (a backup from elsewhere), so the pill never shows "-". */
const numbers = (name, usual, labelOf) => () => {
  const now = fade()[name];
  return (usual.includes(now) ? usual : [...usual, now].sort((a, b) => a - b)).map((v) => ({ value: String(v), label: labelOf(v) }));
};

/* The darkest-it-gets slider moves fast while dragging, and chrome.storage.sync allows about 120 writes a minute, so
   moves are saved in short steps and the last one always lands (the same way the color slider is: colorLock.js). */
const STEP_MS = 250;
let wantDarkest = null, darkestTimer = 0;
function saveDarkest() {
  clearTimeout(darkestTimer);
  if (wantDarkest === null) return Promise.resolve();
  const to = wantDarkest;
  wantDarkest = null;
  return setSetting("scrollFade", withField(getSetting("scrollFade"), "darkest", to));
}

const darkest = lockable({
  get: () => fade().darkest,
  set: (v) => { wantDarkest = Number(v); clearTimeout(darkestTimer); darkestTimer = setTimeout(saveDarkest, STEP_MS); },
  flush: saveDarkest,
  /* The lightest the slider may go now: the lowest, or where it is while locked (it can only go darker). */
  min: () => (lockState(locks(), "scrollFade") === "open" ? DARKEST_MIN : fade().darkest),
  max: () => DARKEST_MAX,
}, "scrollFade");

/* The text field that adds a site to leave alone (it saves when you leave it or press Enter): the host name from whatever
   was typed. While the lock holds, the control refuses it: more sites left alone is looser. */
const addSite = {
  get: () => "",
  set: (text) => {
    const host = cleanSite(text), f = fade(), to = { ...f, except: [...f.except, host] };
    if (host && !f.except.includes(host) && changeAllowed(locks(), "scrollFade", getSetting("scrollFade"), to)) setSetting("scrollFade", to);
  },
};

/** Stop leaving a site alone. Always allowed: fewer sites left alone is stricter. */
export function removeFadeSite(host) {
  const f = fade(), to = { ...f, except: f.except.filter((s) => s !== host) };
  if (!changeAllowed(locks(), "scrollFade", getSetting("scrollFade"), to)) return false;
  setSetting("scrollFade", to);
  return true;
}

export const FADE_CONTROLS = {
  fade: pick("on", fixed({ on: "On", off: "Off" }), (v) => v === "on", (on) => (on ? "on" : "off")),
  fadeBy: pick("by", fixed(BY), String),
  fadeMinutes: pick("minutes", numbers("minutes", MINUTES, minutesLabel), Number),
  fadeScreens: pick("screens", numbers("screens", SCREENS, screensLabel), Number),
  fadeRest: pick("restSeconds", numbers("restSeconds", REST_SECONDS, restLabel), Number),
  fadeWait: pick("waitMinutes", numbers("waitMinutes", WAIT_MINUTES, minutesLabel), Number),
  fadeDarkest: darkest,
  fadeAddSite: addSite,
};
