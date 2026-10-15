// The color slider's rules, with no page or storage in them so they can be tested alone.
//
// One setting, `saturation` (0 to 100, 100 = full color). The slider moves freely until you press the
// lock beside it. Then, for 30 minutes, you can still go grayer but not back: the lock keeps a ceiling
// (`saturationLock`: { ceiling, until, manual }) that follows the lowest level you reach. The 30 minutes
// count from pressing the lock and are not restarted by going grayer. When they are up it frees itself.
// `manual` marks a lock you pressed; the older automatic locks have none and no longer count.

export const LOCK_MS = 30 * 60 * 1000;

export const clampSaturation = (v) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 100;
};

/** The lock if you pressed it and it is still holding at `now`, else null. */
export function activeLock(lock, now = Date.now()) {
  if (!lock || typeof lock !== "object" || lock.manual !== true) return null;
  const ceiling = Number(lock.ceiling), until = Number(lock.until);
  if (!Number.isFinite(ceiling) || !Number.isFinite(until) || until <= now) return null;
  return { ceiling: clampSaturation(ceiling), until, manual: true };
}

/** The highest value the slider may reach right now (100 when nothing is locked). */
export function lockedMax(lock, now = Date.now()) {
  const l = activeLock(lock, now);
  return l ? l.ceiling : 100;
}

/** The lock to save when you press the lock at level `current`. */
export function startLock(current, now = Date.now()) {
  return { ceiling: clampSaturation(current), until: now + LOCK_MS, manual: true };
}

/**
 * What saving `target` does, given the saved value and lock. Returns { saturation, lock, changed }.
 * - No lock: it applies.
 * - Locked: grayer applies and lowers the ceiling to it (the time left is unchanged); more color
 *   than the ceiling is refused.
 */
export function planChange({ current, lock, target, now = Date.now() }) {
  const cur = clampSaturation(current);
  const want = clampSaturation(target);
  const held = activeLock(lock, now);
  if (!held) return { saturation: want, lock: null, changed: want !== cur };
  if (want >= held.ceiling) return { saturation: Math.min(cur, held.ceiling), lock: held, changed: false };
  return { saturation: want, lock: { ...held, ceiling: want }, changed: true };
}

/**
 * Settings saved before the slider replaced the Grayscale switch had `grayscale` (on/off) and
 * `saturation` (the level while it was on, default 0). The level that was actually showing:
 * off = full color, on = the saved level. Undefined when there is no legacy `grayscale` value.
 */
export function legacySaturation(grayscale, saturation) {
  if (grayscale === undefined || grayscale === null) return undefined;
  if (grayscale === true) return typeof saturation === "number" ? clampSaturation(saturation) : 0;
  return 100;
}

/** "Locked. You can go grayer, but not back above 40% until 4:42 pm." or "" when nothing is locked. */
export function lockNote(lock, formatTime, now = Date.now()) {
  const l = activeLock(lock, now);
  if (!l) return "";
  return `Locked. You can go grayer, but not back above ${l.ceiling}% until ${formatTime(l.until)}.`;
}

/** Whole seconds left on the lock, 0 when it is not holding. */
export function lockSecondsLeft(lock, now = Date.now()) {
  const l = activeLock(lock, now);
  return l ? Math.max(0, Math.ceil((l.until - now) / 1000)) : 0;
}
