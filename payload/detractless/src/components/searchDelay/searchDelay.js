// Search delay changes. Unlocked, a new delay applies at once, longer or shorter. Locked (the lock beside it on
// Settings > Focus, utils/focusLock.js), only a longer one applies until you unlock it.
// Before the lock, a shorter delay waited 30 minutes as pendingDelayDecrease. One saved by that version still
// finishes on time (background/pendingChanges.js), and its note shows until then.
import { formatTimeRemaining } from '../../utils/formatDuration.js';
import { getDelaySeconds, saveDelaySeconds, clearPendingDecrease } from '../../services/delayStorage.js';
import { sendToBackground } from '../../services/backgroundMessenger.js';
import { readLocks } from '../../services/focusLocks.js';
import { changeAllowed } from '../../utils/focusLock.js';
import { QUEUE_MS } from '../tabLimiter/tabLimiterUI.js';

/** Ask for a new delay in seconds (0 = off). Refused, and nothing saved, when the delay is locked and this is shorter. */
export async function requestSearchDelay(newDelay) {
  if (isNaN(newDelay)) return;
  const currentDelay = await getDelaySeconds();
  const actualCurrent = currentDelay !== undefined ? currentDelay : 0;
  if (newDelay === actualCurrent) return;
  if (!changeAllowed(await readLocks(), 'searchDelaySeconds', actualCurrent, newDelay)) return;
  await saveDelaySeconds(newDelay);
  await clearPendingDecrease();   // a queued decrease from the version before would undo this later
  await sendToBackground({ action: "updateSearchDelay", delaySeconds: newDelay });
}

/** "Queued: 15s in 29m 59s" while a decrease saved by the version before waits, else "". */
export function pendingDecreaseText(pending, now = Date.now()) {
  if (!pending || !pending.startTime) return "";
  const remaining = Math.max(0, QUEUE_MS - (now - pending.startTime));
  if (remaining <= 0) return "";
  return `Queued: ${pending.targetDelay}s in ${formatTimeRemaining(remaining)}`;
}
