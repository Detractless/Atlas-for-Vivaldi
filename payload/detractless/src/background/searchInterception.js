import { searchDelayMs, activeDelays, managedEngines } from './workerState.js';
import { isSearchEngine, standardiseUrl } from './searchUrl.js';
import { storageSet } from '../services/storage.js';

export function handleSearchInterception(tabId, url) {
  // Skip if delay is disabled
  if (searchDelayMs === 0) return

  // Skip internal URLs
  if (url.startsWith('chrome://') || url.startsWith('chrome-extension://')) return
  if (url.includes('gate.html')) return

  if (!isSearchEngine(url, managedEngines)) return

  const stdUrl = standardiseUrl(url, managedEngines)
  if (!stdUrl) return

  const now = Date.now()

  if (activeDelays[stdUrl]) {
    const delayInfo = activeDelays[stdUrl]
    const elapsed = now - delayInfo.startTime

    if (elapsed < searchDelayMs) {
      chrome.tabs.update(tabId, {
        url: chrome.runtime.getURL('gate.html') + '?url=' + encodeURIComponent(url)
      })
    } else if (!delayInfo.completed) {
      chrome.tabs.update(tabId, {
        url: chrome.runtime.getURL('gate.html') + '?url=' + encodeURIComponent(url)
      })
    }
  } else {
    activeDelays[stdUrl] = {
      startTime: now,
      completed: false
    }
    storageSet('local', { activeDelays })

    chrome.tabs.update(tabId, {
      url: chrome.runtime.getURL('gate.html') + '?url=' + encodeURIComponent(url)
    })
  }
}

// Intercept new navigations
chrome.webNavigation.onBeforeNavigate.addListener(
  (details) => {
    if (details.frameId !== 0) return
    handleSearchInterception(details.tabId, details.url)
  },
  { url: [{ schemes: ['http', 'https'] }] }
)

// Intercept in-page updates (SPA like YouTube)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url) {
    handleSearchInterception(tabId, changeInfo.url)
    // "reapplyRules" / "triggerFade" used to be sent here for the Element
    // Remover's page script, archived in _old/archive/sidebar-tools/.
  }
})
