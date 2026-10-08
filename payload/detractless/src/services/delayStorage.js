import { storageGet, storageRemove, storageSet } from './storage.js';
export async function loadDelaySettings() {
  return storageGet('sync', ['searchDelaySeconds', 'showQueryOnDelay']);
}

export async function getDelaySeconds() {
  const result = await storageGet('sync', 'searchDelaySeconds');
  return result.searchDelaySeconds;
}

export async function saveDelaySeconds(seconds) {
  return storageSet('sync', { searchDelaySeconds: seconds });
}

export async function clearPendingDecrease() {
  return storageRemove('sync', 'pendingDelayDecrease');
}

export async function savePendingDecrease(targetDelay, startTime) {
  return storageSet('sync', { pendingDelayDecrease: { targetDelay, startTime } });
}

export async function getPendingDecrease() {
  const result = await storageGet('sync', 'pendingDelayDecrease');
  return result.pendingDelayDecrease;
}
