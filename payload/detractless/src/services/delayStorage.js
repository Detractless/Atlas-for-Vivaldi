export async function loadDelaySettings() {
  return chrome.storage.sync.get(['searchDelaySeconds', 'showQueryOnDelay']);
}

export async function getDelaySeconds() {
  const result = await chrome.storage.sync.get('searchDelaySeconds');
  return result.searchDelaySeconds;
}

export async function saveDelaySeconds(seconds) {
  return chrome.storage.sync.set({ searchDelaySeconds: seconds });
}

export async function clearPendingDecrease() {
  return chrome.storage.sync.remove('pendingDelayDecrease');
}

export async function savePendingDecrease(targetDelay, startTime) {
  return chrome.storage.sync.set({ pendingDelayDecrease: { targetDelay, startTime } });
}

export async function getPendingDecrease() {
  const result = await chrome.storage.sync.get('pendingDelayDecrease');
  return result.pendingDelayDecrease;
}
