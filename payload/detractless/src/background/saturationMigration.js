// Settings from before the color slider had a Grayscale on/off switch and a level used only while
// it was on. Fold them into the one level that was actually showing, then drop the switch.
import { storageGet, storageSet, storageRemove } from '../services/storage.js';
import { legacySaturation } from '../utils/saturationLock.js';

export async function migrateGrayscale() {
  const stored = await storageGet('sync', ['grayscale', 'saturation']);
  const level = legacySaturation(stored.grayscale, stored.saturation);
  if (level === undefined) return;
  await storageSet('sync', { saturation: level });
  await storageRemove('sync', 'grayscale');
}
