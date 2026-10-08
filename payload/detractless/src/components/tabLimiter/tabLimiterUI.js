// Tab limit changes. A LOWER limit applies at once (and the service worker closes
// or blocks tabs straight away); a HIGHER one is queued for 30 minutes as
// pendingIncrease, so raising the limit takes a deliberate wait. The service
// worker applies a queued increase when its time is up (background/pendingChanges.js).
import { formatTimeRemaining } from '../../utils/formatDuration.js';
import { getTabCount } from '../../services/tabService.js';
import { sendToBackground } from '../../services/backgroundMessenger.js';

export const QUEUE_MS = 30 * 60 * 1000;

/** Ask for a new tab limit (0 = off). */
export async function requestTabLimit(newLimit) {
  if (isNaN(newLimit)) return;
  try {
    const { tabLimit } = await window.chrome.storage.sync.get("tabLimit");
    const currentLimit = tabLimit !== undefined ? tabLimit : 0;
    if (newLimit === currentLimit) return;

    const effectiveCurrent = currentLimit === 0 ? 9999 : currentLimit;
    const effectiveNew = newLimit === 0 ? 9999 : newLimit;

    if (effectiveNew < effectiveCurrent) {
      await window.chrome.storage.sync.set({ tabLimit: newLimit });
      await window.chrome.storage.sync.remove("pendingIncrease");
      if (newLimit !== 0) {
        const tabCount = await getTabCount();
        if (tabCount > newLimit) await sendToBackground({ action: "enforceLimit" });
      }
    } else {
      const startTime = Date.now();
      await window.chrome.storage.sync.set({ pendingIncrease: { targetLimit: newLimit, startTime: startTime } });
      await sendToBackground({ action: "startIncrease", targetLimit: newLimit, startTime: startTime });
    }
  } catch (error) { /* storage unavailable: the limit simply stays as it was */ }
}

export async function cancelPendingIncrease() {
  await window.chrome.storage.sync.remove("pendingIncrease");
  await sendToBackground({ action: "cancelIncrease" });
}

/** "Queued: 8 in 29m 59s" while an increase waits, else "". */
export function pendingIncreaseText(pendingIncrease, now = Date.now()) {
  if (!pendingIncrease || pendingIncrease.targetLimit === undefined || !pendingIncrease.startTime) return "";
  const remaining = Math.max(0, QUEUE_MS - (now - pendingIncrease.startTime));
  if (remaining <= 0) return "";
  const target = pendingIncrease.targetLimit === 0 ? "Off" : pendingIncrease.targetLimit;
  return `Queued: ${target} in ${formatTimeRemaining(remaining)}`;
}
