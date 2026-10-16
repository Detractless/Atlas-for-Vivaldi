// Saving the color slider. Moves come in fast while dragging, so they are saved in short steps
// (chrome.storage.sync allows only about 120 writes a minute), and the last one always lands.
// What a move does is decided by utils/saturationLock.js: it applies, unless the slider is locked
// (utils/focusLock.js), when going grayer still applies and going back toward color is refused.
import { storageGet, storageSet } from '../../services/storage.js';
import { planChange } from '../../utils/saturationLock.js';
import { clickFocusLock } from '../../services/focusLocks.js';

const STEP_MS = 250;
let want = null;
let timer = 0;
let waiting = [];
let running = Promise.resolve();

/* One job at a time, in order; a failed job does not stop the ones after it (storage.js logs the failure). */
function enqueue(job) {
  const result = running.then(job);
  running = result.catch(() => { /* logged by storage.js; the next job still runs */ });
  return result;
}

/** Ask for a color level (0 to 100). Resolves once what was asked for has been saved. */
export function requestSaturation(target) {
  want = target;
  return new Promise((resolve) => {
    waiting.push(resolve);
    clearTimeout(timer);
    timer = setTimeout(flushSaturation, STEP_MS);
  });
}

/** Save at once, without waiting for the next step (the slider was let go). */
export function flushSaturation() {
  clearTimeout(timer);
  const done = waiting;
  waiting = [];
  return enqueue(saveWanted).catch(() => { /* the failure was logged; the callers waiting are released below */ })
    .then(() => done.forEach((resolve) => resolve()));
}

/** Click the slider's lock (lock it, start unlocking, or keep it locked), after saving where the slider is. */
export function clickSaturationLock() {
  clearTimeout(timer);
  const done = waiting;
  waiting = [];
  return enqueue(async () => { await saveWanted(); return clickFocusLock('saturation'); })
    .finally(() => done.forEach((resolve) => resolve()));
}

async function saveWanted() {
  if (want === null) return;
  const target = want;
  want = null;
  const stored = await storageGet('sync', ['saturation', 'focusLocks']);
  const plan = planChange({
    current: typeof stored.saturation === 'number' ? stored.saturation : 100,
    locks: stored.focusLocks,
    target,
  });
  if (plan.changed) await storageSet('sync', { saturation: plan.saturation });
}
