import { searchDelayMs, activeDelays, setSearchDelayMs } from './workerState.js';
import { enforceTabLimit } from './tabLimiter.js';
import { standardiseUrl } from './searchUrl.js';
import { checkPendingIncrease, checkPendingDelayDecrease, pruneActiveDelays } from './pendingChanges.js';
import { handleElementRemoverMessage, toggleRemoverForTab, getRemoverState } from './removerController.js';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  // --- Tab Limiter Messages ---
  if (message.action === "enforceLimit") {
    enforceTabLimit().then(() => sendResponse({ success: true }))
    return true
  }
  if (message.action === "startIncrease") {
    checkPendingIncrease()
    sendResponse({ success: true })
    return true
  }
  if (message.action === "cancelIncrease") {
    sendResponse({ success: true })
    return true
  }

  // --- Search Delay Messages ---
  if (message.action === "updateSearchDelay") {
    setSearchDelayMs(message.delaySeconds * 1000)
    sendResponse({ success: true })
    return true
  }

  if (message.action === "startDelayDecrease") {
    checkPendingDelayDecrease()
    sendResponse({ success: true })
    return true
  }

  if (message.action === "cancelDelayDecrease") {
    sendResponse({ success: true })
    return true
  }

  if (message.action === "checkDelayStatus") {
    const stdUrl = standardiseUrl(message.url)
    const delayInfo = activeDelays[stdUrl]

    if (!delayInfo) {
      sendResponse({ inDelay: false })
      return true
    }

    const now = Date.now()
    const elapsed = now - delayInfo.startTime
    const remaining = Math.max(0, searchDelayMs - elapsed)

    sendResponse({
      inDelay: true,
      completed: delayInfo.completed,
      remainingSeconds: Math.ceil(remaining / 1000),
      showRevealButton: remaining === 0 && !delayInfo.completed
    })
    return true
  }

  if (message.action === "markDelayCompleted") {
    const stdUrl = standardiseUrl(message.url)
    if (activeDelays[stdUrl]) {
      activeDelays[stdUrl].completed = true
      pruneActiveDelays()
      chrome.storage.local.set({ activeDelays })
    }
    sendResponse({ success: true })
    return true
  }

  // --- Sidebar → Remover (per-tab, async: state lives in storage.session) ---
  if (message.action === "toggleRemoverOnTab") {
    toggleRemoverForTab(message.tabId).then((state) => sendResponse({ state }));
    return true;
  }

  if (message.action === "getRemoverState") {
    getRemoverState(message.tabId).then((state) => sendResponse({ state }));
    return true;
  }

  // --- Element Remover Messages ---
  if (message.path === "page-to-background") {
    handleElementRemoverMessage(message, sender, sendResponse);
    return true; // Keep channel open
  }

  return false
})
