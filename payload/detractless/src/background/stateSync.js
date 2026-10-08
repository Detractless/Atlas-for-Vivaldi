import { setTabLimit, setManagementMethod, setSearchDelayMs, setManagedEngines, setActiveDelays } from './workerState.js';
import { enforceTabLimit } from './tabLimiter.js';
import { pruneActiveDelays, checkPendingIncrease, checkPendingDelayDecrease } from './pendingChanges.js';
import { syncDefault } from '../constants/storageKeys.js';
import { storageGet, storageSet } from '../services/storage.js';

const SEEDED_KEYS = ['tabLimit', 'managementMethod', 'searchDelaySeconds', 'showQueryOnDelay', 'customSearchEngines'];

const initializeState = async () => {
  try {
    const result = await storageGet('sync', ['tabLimit', 'managementMethod', 'searchDelaySeconds', 'customSearchEngines'])

    if (result.tabLimit !== undefined) setTabLimit(result.tabLimit)
    else setTabLimit(0);

    if (result.managementMethod !== undefined) setManagementMethod(result.managementMethod)

    if (result.searchDelaySeconds !== undefined) {
      setSearchDelayMs(result.searchDelaySeconds * 1000)
    } else {
      setSearchDelayMs(0);
    }

    if (result.customSearchEngines) {
      setManagedEngines(result.customSearchEngines);
    }

    const localResult = await storageGet('local', ['activeDelays'])
    setActiveDelays(localResult.activeDelays || {})
    pruneActiveDelays()

    enforceTabLimit()
    setTimeout(() => enforceTabLimit(), 1000)
    checkPendingIncrease()
    checkPendingDelayDecrease()

    console.log("Detractless background state initialized")
  } catch (e) {
    console.error("Error initializing background state:", e)
  }
}

initializeState()

chrome.runtime.onInstalled.addListener(() => {
  // Seed the settings the service worker reads, with defaults from atlasKeys.json.
  storageGet('sync', SEEDED_KEYS).then((result) => {
    for (const key of SEEDED_KEYS) {
      if (result[key] === undefined) storageSet('sync', { [key]: syncDefault(key) });
    }
  });
  storageSet('local', { activeDelays: {} });
})

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "sync") {
    if (changes.tabLimit) {
      setTabLimit(changes.tabLimit.newValue)
      enforceTabLimit()
    }
    if (changes.managementMethod) {
      setManagementMethod(changes.managementMethod.newValue)
    }
    if (changes.searchDelaySeconds) {
      setSearchDelayMs(changes.searchDelaySeconds.newValue * 1000)
    }
    if (changes.customSearchEngines) {
      setManagedEngines(changes.customSearchEngines.newValue);
    }
  }
})
