// Settings from before the color slider had a Grayscale on/off switch and a level used only while
// it was on. Fold them into the one level that was actually showing, then drop the switch.
import { storageGet, storageSet, storageRemove } from '../services/storage.js';
import { legacySaturation } from '../utils/saturationLock.js';
import { fromSaturationLock, isLocked, tidyLocks } from '../utils/focusLock.js';

export async function migrateGrayscale() {
  const stored = await storageGet('sync', ['grayscale', 'saturation']);
  const level = legacySaturation(stored.grayscale, stored.saturation);
  if (level === undefined) return;
  await storageSet('sync', { saturation: level });
  await storageRemove('sync', 'grayscale');
}

/** The color lock saved by the version before the Focus locks (`saturationLock`: { ceiling, until, manual }) becomes
    a Focus lock whose unlock ends when that one would have ended, so nothing changes under you. Then it goes. */
export async function migrateSaturationLock(now = Date.now()) {
  const stored = await storageGet('sync', ['saturationLock', 'focusLocks']);
  if (stored.saturationLock === undefined) return;
  const lock = fromSaturationLock(stored.saturationLock, now);
  if (lock && !isLocked(stored.focusLocks, 'saturation', now)) {
    await storageSet('sync', { focusLocks: { ...tidyLocks(stored.focusLocks, now), saturation: lock } });
  }
  await storageRemove('sync', 'saturationLock');
}
