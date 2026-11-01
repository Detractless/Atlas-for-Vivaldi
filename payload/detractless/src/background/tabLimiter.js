import { tabLimit, setTabLimit, managementMethod, setManagementMethod } from './workerState.js';
import { saveClosingTabs } from '../services/tabSaver.js';
import { storageGet } from '../services/storage.js';
import { warn } from '../services/log.js';

/* A sidebar web panel is not a tab you opened, but Vivaldi lists its page as one. It carries
   a panelId in vivExtData, which no ordinary tab has, so that is how every panel is found
   (the Downloads panel, ChatGPT, whatever is added later). The addresses below are the
   older Tools sidebars, kept as a second way to recognise them. */
export function isTabLimitExcluded(tab) {
  const data = (typeof tab?.vivExtData === "string") ? tab.vivExtData : "";
  if (/"panelId"\s*:/.test(data)) return true;
  const url = (typeof tab?.url === "string") ? tab.url : "";
  return /^chrome-extension:\/\/mpognobbkildjkofajifpdfhcoklimli\/sidepanel\.html(?:\?.*)?$/.test(url)
    || /^chrome-extension:\/\/fcoeoabgfenejglbffodgkkbkcdhcgfn\/sidepanel\.html(?:\?.*)?$/.test(url)
    || /^chrome-extension:\/\/hehggadaopoacecdllhhajmbjkdcmajg\/codex-sidepanel\/index\.html(?:\?.*)?$/.test(url)
    // The Downloads panel, by address too: a new panel's page has no panelId yet when onCreated fires.
    || /^chrome-extension:\/\/[a-p]{32}\/components\/atlas\/downloads-panel\.html(?:\?.*)?$/.test(url);
}

async function getAllTabs() {
  const tabs = await chrome.tabs.query({})
  return tabs.filter((tab) => !isTabLimitExcluded(tab));
}

/**
 * How old a tab is, for closing purposes. `lastAccessed` is the real answer;
 * `id` is the fallback, and it points the same way (ids ascend over time) so the
 * fallback never inverts the ordering.
 */
function staleness(tab) {
  return (typeof tab.lastAccessed === 'number') ? tab.lastAccessed : tab.id;
}

/**
 * Least-recently-used first. ONE definition of "oldest", used by both the
 * enforce path and the onCreated path.
 *
 * This ordering is the fix for a real bug: enforceTabLimit used to sort
 * DESCENDING and then take from the front, so hitting the limit closed the tabs
 * you were actively using and kept the ones you had abandoned. The onCreated
 * path sorted the other way and called [0] "oldest", so the two halves of the
 * feature disagreed, which is how it went unnoticed.
 */
function byStalestFirst(tabs) {
  return [...tabs].sort((a, b) => staleness(a) - staleness(b));
}

/**
 * Which tabs to close, given the whole tab list and the settings. Pure: no
 * chrome APIs, no module state, and the caller's array is never reordered.
 *
 * Returns [] when the limit is 0 (off) or the list is within the limit.
 */
export function selectTabsToClose(tabs, limit, method) {
  if (!limit || limit <= 0) return [];
  const excessCount = tabs.length - limit;
  if (excessCount <= 0) return [];

  if (method === "random") {
    return [...tabs].sort(() => Math.random() - 0.5).slice(0, excessCount);
  }
  return byStalestFirst(tabs).slice(0, excessCount);
}

export async function enforceTabLimit() {
  try {
    // Re-fetch settings to be safe
    const result = await storageGet('sync', ['tabLimit', 'managementMethod'])
    setTabLimit(result.tabLimit !== undefined ? result.tabLimit : 0)
    setManagementMethod(result.managementMethod || "block")

    if (tabLimit === 0) return

    const allTabs = await getAllTabs()
    const tabsToClose = selectTabsToClose(allTabs, tabLimit, managementMethod)

    /* BEFORE the removals, not after: a closed tab has no url or title left to
       read. This is the whole point of the tab saver, since parking a page by
       leaving it open is exactly what the limiter takes away. */
    try { await saveClosingTabs(tabsToClose) } catch (error) { warn('tab limiter: saving closing tabs failed', error) }

    for (const tab of tabsToClose) {
      try { await chrome.tabs.remove(tab.id) } catch (error) { /* the tab closed on its own meanwhile */ }
    }
  } catch (error) { warn('tab limiter: enforcing the limit failed', error) }
}

/* Registration is guarded so this module can be IMPORTED by a test runner, where
   there is no chrome global. The listener is the only side effect in the file;
   everything above it is callable without a browser. */
if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.onCreated) {
  chrome.tabs.onCreated.addListener(async (tab) => {
    const result = await storageGet('sync', ['tabLimit', 'managementMethod'])
    setTabLimit(result.tabLimit !== undefined ? result.tabLimit : 0)
    setManagementMethod(result.managementMethod || "block")

    if (tabLimit === 0) return

    const allTabs = await getAllTabs()

    if (allTabs.length > tabLimit) {
      if (managementMethod === "block") {
        /* Block means the NEW tab does not get to exist. Nothing already open is
           touched, which is what makes this different from the enforce path. */
        if (!isTabLimitExcluded(tab)) {
          try { await chrome.tabs.remove(tab.id) } catch (error) { /* the tab closed on its own meanwhile */ }
        }
      } else if (managementMethod === "random") {
        /* byStalestFirst, not a local sort: this line used to define "oldest" for
           itself, the other way round from enforceTabLimit. One definition now. */
        const oldestTab = byStalestFirst(allTabs)[0]
        const victim = (oldestTab && oldestTab.id !== tab.id) ? oldestTab : tab
        try { await saveClosingTabs([victim]) } catch (error) { warn('tab limiter: saving the closed tab failed', error) }
        try { await chrome.tabs.remove(victim.id) } catch (error) { /* the tab closed on its own meanwhile */ }
      }
    }
  })
}
