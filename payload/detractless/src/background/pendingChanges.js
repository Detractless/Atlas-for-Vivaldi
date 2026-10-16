import { activeDelays, setTabLimit, setSearchDelayMs } from './workerState.js';
import { enforceTabLimit } from './tabLimiter.js';
import { storageGet, storageRemove, storageSet } from '../services/storage.js';
import { changeAllowed } from '../utils/focusLock.js';

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

/* Before the Focus locks, a higher tab limit or a shorter delay waited 30 minutes here. Settings no longer queues
   them (a change applies at once unless it is locked, utils/focusLock.js), but one saved by the version before still
   finishes on time, unless the setting has been locked since: then it is dropped, as Settings would refuse it. */

export async function checkPendingIncrease() {
  const result = await storageGet('sync', ['pendingIncrease', 'tabLimit', 'focusLocks'])
  const pending = result.pendingIncrease

  if (pending && pending.targetLimit !== undefined && pending.startTime) {
    const elapsed = Date.now() - pending.startTime
    const duration = 30 * 60 * 1000 // 30 mins

    if (elapsed >= duration) {
      await storageRemove('sync', 'pendingIncrease')
      if (!changeAllowed(result.focusLocks, 'tabLimit', result.tabLimit, pending.targetLimit)) return
      await storageSet('sync', { tabLimit: pending.targetLimit })
      setTabLimit(pending.targetLimit)
      enforceTabLimit()
    } else {
      setTimeout(checkPendingIncrease, Math.min(duration - elapsed, 60000))
    }
  }
}

// Search Delay: Delayed Decrease
export async function checkPendingDelayDecrease() {
  const result = await storageGet('sync', ['pendingDelayDecrease', 'searchDelaySeconds', 'focusLocks'])
  const pending = result.pendingDelayDecrease

  if (pending && pending.targetDelay !== undefined && pending.startTime) {
    const elapsed = Date.now() - pending.startTime
    const duration = 30 * 60 * 1000 // 30 mins

    if (elapsed >= duration) {
      await storageRemove('sync', 'pendingDelayDecrease')
      if (!changeAllowed(result.focusLocks, 'searchDelaySeconds', result.searchDelaySeconds, pending.targetDelay)) return
      await storageSet('sync', { searchDelaySeconds: pending.targetDelay })
      setSearchDelayMs(pending.targetDelay * 1000)
    } else {
      setTimeout(checkPendingDelayDecrease, Math.min(duration - elapsed, 60000))
    }
  }
}
