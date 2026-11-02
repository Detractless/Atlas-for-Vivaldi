// The locks on Settings > Focus: the tab limit, search delay, color level, content-shield mode, social media
// filter and scroll fade can each be locked.
// You lock it. While it is locked it can only get stricter. Clicking the lock again starts a 30-minute unlock,
// and clicking it during those 30 minutes keeps it locked. When the time is up it is unlocked. Nothing locks or
// unlocks by itself. No page or storage in here, so the rules can be tested alone; services/focusLocks.js saves them.
//
// One setting, `focusLocks`: { [key]: { unlockAt } } for each locked key. `unlockAt` is null while the lock holds,
// or the time the unlock ends. A key that is missing, or whose unlockAt has passed, is unlocked.
// pages/newtab/profilesCore.js repeats changeAllowed() in its own words (it can't import); keep the two the same.

import { looser as filterLooser } from './socialFilter.js';
import { looser as fadeLooser, DEFAULTS as FADE_DEFAULTS } from './scrollFade.js';

export const UNLOCK_MS = 30 * 60 * 1000;
export const LOCKABLE = ['tabLimit', 'searchDelaySeconds', 'saturation', 'nsfwAction', 'socialFilter', 'scrollFade'];
/* What each setting is when nothing was saved (constants/atlasKeys.json). */
const DEFAULTS = { tabLimit: 0, searchDelaySeconds: 0, saturation: 100, nsfwAction: 'off', socialFilter: { mode: 'off', parts: [] }, scrollFade: FADE_DEFAULTS };

/* How strict a value is: higher is stricter. Off (0) is the loosest tab limit and the loosest delay. */
const STRICTNESS = {
  tabLimit: (v) => (Number(v) === 0 ? -Infinity : -Number(v)),   // fewer tabs is stricter; Off is no limit at all
  searchDelaySeconds: (v) => Number(v),                          // a longer pause is stricter
  saturation: (v) => -Number(v),                                 // grayer is stricter
  nsfwAction: (v) => ({ off: 0, blur: 1, blackout: 2 }[String(v)] || 0), // stricter actions cannot return to Off
};

/* A setting that is more than one number says for itself whether a change loosens it: (from, to) => true when it does. */
const LOOSER = { socialFilter: filterLooser, scrollFade: fadeLooser };

const entry = (locks, key) => (locks && typeof locks === 'object' && locks[key] && typeof locks[key] === 'object' ? locks[key] : null);

/** 'open', 'held' (locked) or 'unlocking' (locked, with its 30 minutes running) for `key` at `now`. */
export function lockState(locks, key, now = Date.now()) {
  const l = entry(locks, key);
  if (!l) return 'open';
  if (l.unlockAt === null || l.unlockAt === undefined) return 'held';
  const at = Number(l.unlockAt);
  if (!Number.isFinite(at)) return 'held';   // a damaged time: stay locked; clicking the lock starts a clean unlock
  return at > now ? 'unlocking' : 'open';
}

export const isLocked = (locks, key, now = Date.now()) => lockState(locks, key, now) !== 'open';

/** When the unlock of `key` ends (ms), or null when it isn't unlocking. */
export function unlockTime(locks, key, now = Date.now()) {
  return lockState(locks, key, now) === 'unlocking' ? Number(entry(locks, key).unlockAt) : null;
}

/** Whole seconds left on the unlock of `key`, 0 when it isn't unlocking. */
export function unlockSecondsLeft(locks, key, now = Date.now()) {
  const at = unlockTime(locks, key, now);
  return at === null ? 0 : Math.max(0, Math.ceil((at - now) / 1000));
}

/** Whether `key` may go from `from` to `to` now: always when unlocked; when locked, only to as strict or stricter. */
export function changeAllowed(locks, key, from, to, now = Date.now()) {
  if (!isLocked(locks, key, now) || !(STRICTNESS[key] || LOOSER[key])) return true;
  const was = from === undefined || from === null ? DEFAULTS[key] : from;
  if (LOOSER[key]) return !LOOSER[key](was, to);
  return STRICTNESS[key](to) >= STRICTNESS[key](was);
}

/** Only the locks still holding or unlocking, in their clean form. */
export function tidyLocks(locks, now = Date.now()) {
  const out = {};
  for (const key of LOCKABLE) {
    const state = lockState(locks, key, now);
    if (state === 'held') out[key] = { unlockAt: null };
    else if (state === 'unlocking') out[key] = { unlockAt: unlockTime(locks, key, now) };
  }
  return out;
}

/** The locks after clicking `key`'s lock: open becomes locked, locked starts its 30-minute unlock, unlocking stays locked. */
export function clickLock(locks, key, now = Date.now()) {
  const state = lockState(locks, key, now);
  const next = tidyLocks(locks, now);
  next[key] = { unlockAt: state === 'held' ? now + UNLOCK_MS : null };
  return next;
}

/**
 * `incoming` (a profile's saved values, or a backup) without the values that would loosen a locked setting,
 * so switching profile or importing a file can't undo a lock. `current` holds the values in use now.
 */
export function withoutLoosening(incoming, current, locks, now = Date.now()) {
  const out = { ...incoming };
  for (const key of LOCKABLE) {
    if (out[key] !== undefined && !changeAllowed(locks, key, (current || {})[key], out[key], now)) delete out[key];
  }
  return out;
}

/** A color lock saved by the version before ({ ceiling, until, manual }), as a lock whose unlock ends when that one
    would have ended. null when it no longer holds. */
export function fromSaturationLock(old, now = Date.now()) {
  if (!old || typeof old !== 'object' || old.manual !== true) return null;
  const until = Number(old.until);
  return Number.isFinite(until) && until > now ? { unlockAt: until } : null;
}
