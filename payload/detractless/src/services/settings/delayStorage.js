import { storageGet, storageRemove, storageSet } from '../storage.js';

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
