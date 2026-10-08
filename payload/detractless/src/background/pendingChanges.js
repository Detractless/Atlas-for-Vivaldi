import { activeDelays, setTabLimit, setSearchDelayMs } from './workerState.js';
import { enforceTabLimit } from './tabLimiter.js';
import { storageGet, storageRemove, storageSet } from '../services/storage.js';

const DELAY_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

export function pruneActiveDelays() {
  const now = Date.now()
  let changed = false
  for (const key of Object.keys(activeDelays)) {
    if (now - activeDelays[key].startTime > DELAY_TTL_MS) {
      delete activeDelays[key]
      changed = true
    }
  }
  if (changed) storageSet('local', { activeDelays })
}

export async function checkPendingIncrease() {
  const result = await storageGet('sync', ['pendingIncrease'])
  const pending = result.pendingIncrease

  if (pending && pending.targetLimit !== undefined && pending.startTime) {
    const elapsed = Date.now() - pending.startTime
    const duration = 30 * 60 * 1000 // 30 mins

    if (elapsed >= duration) {
      await storageSet('sync', { tabLimit: pending.targetLimit })
      await storageRemove('sync', 'pendingIncrease')
      setTabLimit(pending.targetLimit)
      enforceTabLimit()
    } else {
      setTimeout(checkPendingIncrease, Math.min(duration - elapsed, 60000))
    }
  }
}

// Search Delay: Delayed Decrease
export async function checkPendingDelayDecrease() {
  const result = await storageGet('sync', ['pendingDelayDecrease'])
  const pending = result.pendingDelayDecrease

  if (pending && pending.targetDelay !== undefined && pending.startTime) {
    const elapsed = Date.now() - pending.startTime
    const duration = 30 * 60 * 1000 // 30 mins

    if (elapsed >= duration) {
      await storageSet('sync', { searchDelaySeconds: pending.targetDelay })
      await storageRemove('sync', 'pendingDelayDecrease')
      setSearchDelayMs(pending.targetDelay * 1000)
    } else {
      setTimeout(checkPendingDelayDecrease, Math.min(duration - elapsed, 60000))
    }
  }
}
