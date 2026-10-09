import { searchDelayMs, activeDelays, managedEngines, setSearchDelayMs } from './workerState.js';
import { enforceTabLimit } from './tabLimiter.js';
import { standardiseUrl } from './searchUrl.js';
import { checkPendingIncrease, checkPendingDelayDecrease, pruneActiveDelays } from './pendingChanges.js';
import { storageSet } from '../services/storage.js';

const ok = (sendResponse) => sendResponse({ success: true });

/* Delays are stored under the URL standardised with the saved engines
   (searchInterception.js), so every lookup must pass them too. Without them a
   custom engine's URL standardises to null, the delay is never found, and the
   gate page reloads forever (seen on Reddit). */

/** How far along the search delay for `url` is, for the gate page. */
function delayStatus(url) {
  const delayInfo = activeDelays[standardiseUrl(url, managedEngines)];
  if (!delayInfo) return { inDelay: false };
  const elapsed = Date.now() - delayInfo.startTime;
  const remaining = Math.max(0, searchDelayMs - elapsed);
  return {
    inDelay: true,
    completed: delayInfo.completed,
    remainingSeconds: Math.ceil(remaining / 1000),
    showRevealButton: remaining === 0 && !delayInfo.completed
  };
}

function markDelayCompleted(url) {
  const stdUrl = standardiseUrl(url, managedEngines);
  if (activeDelays[stdUrl]) {
    activeDelays[stdUrl].completed = true;
    pruneActiveDelays();
    storageSet('local', { activeDelays });
  }
}

/* message.action -> handler(message, sendResponse). Every handled message
   keeps the channel open (the listener returns true). */
const ACTIONS = {
  // --- Tab Limiter Messages ---
  enforceLimit: (m, send) => { enforceTabLimit().then(() => ok(send)); },
  startIncrease: (m, send) => { checkPendingIncrease(); ok(send); },
  cancelIncrease: (m, send) => ok(send),
  // --- Search Delay Messages ---
  updateSearchDelay: (m, send) => { setSearchDelayMs(m.delaySeconds * 1000); ok(send); },
  startDelayDecrease: (m, send) => { checkPendingDelayDecrease(); ok(send); },
  cancelDelayDecrease: (m, send) => ok(send),
  checkDelayStatus: (m, send) => send(delayStatus(m.url)),
  markDelayCompleted: (m, send) => { markDelayCompleted(m.url); ok(send); },
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (Object.prototype.hasOwnProperty.call(ACTIONS, message.action)) {
    ACTIONS[message.action](message, sendResponse);
    return true;
  }
  return false;
});
