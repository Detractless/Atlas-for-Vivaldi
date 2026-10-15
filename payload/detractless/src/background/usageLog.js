// Keeps the usage totals (utils/usageLog.js) in chrome.storage.local under one key. Pages send small
// deltas; this is the only writer, and it handles them one at a time so two tabs cannot overwrite
// each other's totals.
import { storageGet, storageSet, storageRemove } from '../services/storage.js';
import { addUsage, cleanHost, cleanDelta, hasUsage } from '../utils/usageLog.js';

let chain = Promise.resolve();

/** Add a page's message ({ host, delta }) to the totals. Resolves true when something was added. */
export function recordUsage(message) {
  const host = cleanHost(message && message.host);
  const delta = cleanDelta(message && message.delta);
  if (!host || !hasUsage(delta)) return Promise.resolve(false);
  const job = chain.then(async () => {
    const stored = await storageGet('local', ['atlas_usage']);
    await storageSet('local', { atlas_usage: addUsage(stored.atlas_usage, host, delta, Date.now()) });
    return true;
  });
  chain = job.catch((e) => { console.error('Recording usage failed:', e); });
  return job.catch(() => false /* the failure was logged just above */);
}

export function clearUsage() {
  const job = chain.then(() => storageRemove('local', 'atlas_usage'));
  chain = job.catch((e) => { console.error('Clearing usage failed:', e); });
  return job;
}
