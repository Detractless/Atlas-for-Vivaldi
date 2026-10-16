// The color slider's rules, with no page or storage in them so they can be tested alone.
//
// One setting, `saturation` (0 to 100, 100 = full color). The slider moves freely until you lock it with the
// lock beside it (utils/focusLock.js, shared with the tab limit and the search delay). While locked it can go
// grayer but not back toward color, until you click the lock again and its 30-minute unlock runs out.
import { changeAllowed } from './focusLock.js';

export const clampSaturation = (v) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 100;
};

/** What saving `target` does, given the saved level and the Focus locks: { saturation, changed }.
    Unlocked it applies; locked, grayer applies and more color is refused. */
export function planChange({ current, locks, target, now = Date.now() }) {
  const cur = clampSaturation(current);
  const want = clampSaturation(target);
  if (!changeAllowed(locks, 'saturation', cur, want, now)) return { saturation: cur, changed: false };
  return { saturation: want, changed: want !== cur };
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
