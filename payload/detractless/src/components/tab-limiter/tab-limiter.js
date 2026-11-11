// Tab limit changes. Unlocked, a new limit applies at once, lower or higher (a lower one closes or blocks tabs
// straight away, in the service worker). Locked (the lock beside it on Settings > Focus, utils/focusLock.js),
// only a lower one applies until you unlock it; Off counts as the highest.
// Before the lock, a higher limit waited 30 minutes as pendingIncrease. One saved by that version still
// finishes on time (background/pendingChanges.js), and its note shows until then.
import { formatTimeRemaining } from '../../utils/formatDuration.js';
import { getTabCount } from '../../services/tabService.js';
import { sendToBackground } from '../../services/backgroundMessenger.js';
import { storageGet, storageRemove, storageSet } from '../../services/storage.js';
import { changeAllowed } from '../../utils/focusLock.js';

export const QUEUE_MS = 30 * 60 * 1000;

/** Ask for a new tab limit (0 = off). Refused, and nothing saved, when the limit is locked and this is higher. */
export async function requestTabLimit(newLimit) {
  if (isNaN(newLimit)) return;
  try {
    const { tabLimit, focusLocks } = await storageGet('sync', ["tabLimit", "focusLocks"]);
    const currentLimit = tabLimit !== undefined ? tabLimit : 0;
    if (newLimit === currentLimit) return;
    if (!changeAllowed(focusLocks, "tabLimit", currentLimit, newLimit)) return;
    await storageSet('sync', { tabLimit: newLimit });
    await storageRemove('sync', "pendingIncrease");   // a queued increase from the version before would undo this later
    if (newLimit !== 0) {
      const tabCount = await getTabCount();
      if (tabCount > newLimit) await sendToBackground({ action: "enforceLimit" });
    }
  } catch (error) { /* storage unavailable: the limit simply stays as it was */ }
}

/** "Queued: 8 in 29m 59s" while an increase saved by the version before waits, else "". */
export function pendingIncreaseText(pendingIncrease, now = Date.now()) {
  if (!pendingIncrease || pendingIncrease.targetLimit === undefined || !pendingIncrease.startTime) return "";
  const remaining = Math.max(0, QUEUE_MS - (now - pendingIncrease.startTime));
  if (remaining <= 0) return "";
  const target = pendingIncrease.targetLimit === 0 ? "Off" : pendingIncrease.targetLimit;
  return `Queued: ${target} in ${formatTimeRemaining(remaining)}`;
}
