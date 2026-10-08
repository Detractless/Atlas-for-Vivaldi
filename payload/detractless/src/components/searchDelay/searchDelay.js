// Search delay changes: the mirror image of the tab limit. A LONGER delay applies
// at once; a SHORTER one is queued for 30 minutes as pendingDelayDecrease, so
// making searching quicker takes a deliberate wait. The service worker applies a
// queued decrease when its time is up (background/pendingChanges.js).
import { formatTimeRemaining } from '../../utils/formatDuration.js';
import { getDelaySeconds, saveDelaySeconds, clearPendingDecrease, savePendingDecrease } from '../../services/delayStorage.js';
import { sendToBackground } from '../../services/backgroundMessenger.js';
import { QUEUE_MS } from '../tabLimiter/tabLimiterUI.js';

/** Ask for a new delay in seconds (0 = off). */
export async function requestSearchDelay(newDelay) {
  if (isNaN(newDelay)) return;
  const currentDelay = await getDelaySeconds();
  const actualCurrent = currentDelay !== undefined ? currentDelay : 0;
  if (newDelay === actualCurrent) return;

  if (newDelay > actualCurrent) {
    await saveDelaySeconds(newDelay);
    await clearPendingDecrease();
    await sendToBackground({ action: "updateSearchDelay", delaySeconds: newDelay });
  } else {
    await savePendingDecrease(newDelay, Date.now());
    await sendToBackground({ action: "startDelayDecrease" });
  }
}

export async function cancelPendingDecrease() {
  await clearPendingDecrease();
  await sendToBackground({ action: "cancelDelayDecrease" });
}

/** "Queued: 15s in 29m 59s" while a decrease waits, else "". */
export function pendingDecreaseText(pending, now = Date.now()) {
  if (!pending || !pending.startTime) return "";
  const remaining = Math.max(0, QUEUE_MS - (now - pending.startTime));
  if (remaining <= 0) return "";
  return `Queued: ${pending.targetDelay}s in ${formatTimeRemaining(remaining)}`;
}
