// src/settings/lockable.js — what a Focus control gets when a lock sits beside it (utils/focusLock.js).
import { getSetting } from './registry.js';
import { lockState, changeAllowed } from '../utils/focusLock.js';
import { clickFocusLock } from '../services/focusLocks.js';

/* A control with a lock beside it: its lock's state, what clicking the lock does, and
   which values it may take now (menu.js greys out the rest). */
export function lockable(control, key, click = () => clickFocusLock(key)) {
  return Object.assign(control, {
    lockKey: key,
    lockState: () => lockState(getSetting("focusLocks"), key),
    clickLock: click,
    allows: (v) => changeAllowed(getSetting("focusLocks"), key, getSetting(key), v),
  });
}
