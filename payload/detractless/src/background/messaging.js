import { searchDelayMs, activeDelays, managedEngines, setSearchDelayMs } from './workerState.js';
import { enforceTabLimit } from './tabLimiter.js';
import { standardiseUrl } from './searchUrl.js';
import { checkPendingIncrease, checkPendingDelayDecrease, pruneActiveDelays } from './pendingChanges.js';
import { storageSet } from '../services/storage.js';
import { recordUsage, clearUsage } from './usageLog.js';
import { addInfo, addGroups, addSuggest, addBookmarkTo, addPageTo } from './addFlow.js';

const ok = (sendResponse) => sendResponse({ success: true });

/** Reply with the work's result; a failure is logged and answered, so the window is never left waiting. */
function answer(work, sendResponse) {
  work.then(sendResponse, (e) => { console.error('Answering a request failed:', e); sendResponse({ error: 'That did not work. Try again.' }); });
}

/** Tell every open new tab that bookmarks or pages changed, so they show it. */
function announce(result) {
  if (result && result.ok) chrome.runtime.sendMessage({ atlas: { act: 'data-changed' } }, () => void chrome.runtime.lastError);
  return result;
}

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
  // --- Usage totals (components/atlas/atlas-usage.js sends these) ---
  recordUsage: (m, send) => { recordUsage(m).then(() => ok(send)); },
  clearUsage: (m, send) => { clearUsage().then(() => ok(send)); },
  // --- Add bookmark / Add page in the address bar (src/modules/23-addbar-core.js) ---
  addInfo: (m, send) => answer(addInfo(m), send),
  addGroups: (m, send) => answer(addGroups(m), send),
  addSuggest: (m, send) => answer(addSuggest(m), send),
  addBookmark: (m, send) => answer(addBookmarkTo(m).then(announce), send),
  addPage: (m, send) => answer(addPageTo(m).then(announce), send),
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (Object.prototype.hasOwnProperty.call(ACTIONS, message.action)) {
    ACTIONS[message.action](message, sendResponse);
    return true;
  }
  return false;
});

/* In Vivaldi this file runs inside the browser window's own page (src/modules/02-bridge-setup.js), and Chrome
   never delivers a message to the page that sent it. So code in that page (the address bar's Add flow) asks
   here directly. Resolves to the answer, or undefined when the message is not one of ours. */
globalThis.__atlasWorker = {
  ask(message) {
    return new Promise((resolve) => {
      if (!message || !Object.prototype.hasOwnProperty.call(ACTIONS, message.action)) { resolve(undefined); return; }
      try {
        ACTIONS[message.action](message, resolve);
      } catch (e) {
        console.error('Answering a request failed:', e);
        resolve(undefined);
      }
    });
  },
};
