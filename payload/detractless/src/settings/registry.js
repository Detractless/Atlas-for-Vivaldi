// src/settings/registry.js — one owner for every setting the Settings page shows.
//
// Each setting is defined once (settings/definitions.js) with what applying it
// does to the page. The registry then does the rest the same way for all of them:
// - loadSettings() reads every key from chrome.storage.sync and applies it;
// - setSetting() saves AT ONCE (no Save button) and applies it on this page;
// - a chrome.storage.onChanged listener applies changes made in any other tab,
//   or by a profile switch, so every open new tab stays live.
// Defaults come from constants/atlasKeys.json.
import { syncDefault } from '../constants/storageKeys.js';
import { storageGet, storageSet } from '../services/storage.js';

const entries = new Map();
const values = new Map();
const listeners = [];
let watching = false;

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * @param {{ key: string, apply?: (value, ctx: {initial: boolean, local: boolean}) => void,
 *           write?: (value) => Promise<void> }} entry
 * `write` replaces the plain save, for settings whose change is queued (tab limit,
 * search delay). Its storage writes come back through onChanged like any other.
 */
export function defineSetting(entry) {
  entries.set(entry.key, entry);
  values.set(entry.key, syncDefault(entry.key));
}

export function getSetting(key) {
  if (!entries.has(key)) throw new Error(`Unknown setting: ${key}`);
  return values.get(key);
}

/** Save and apply one setting now. */
export async function setSetting(key, value) {
  const entry = entries.get(key);
  if (!entry) throw new Error(`Unknown setting: ${key}`);
  if (entry.write) {
    await entry.write(value);
    return;
  }
  update(key, value, { initial: false, local: true });
  await storageSet('sync', { [key]: value });
}

/** Read every setting from storage and apply it (page start, profile switch, import). */
export async function loadSettings() {
  const keys = [...entries.keys()];
  const stored = await storageGet('sync', keys);
  for (const key of keys) {
    const value = stored[key] !== undefined ? stored[key] : syncDefault(key);
    update(key, value, { initial: true, local: false }, true);
  }
}

/** Follow changes made elsewhere. Safe to call more than once. */
export function watchSettings() {
  if (watching) return;
  watching = true;
  window.chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    for (const key of Object.keys(changes)) {
      if (!entries.has(key)) continue;
      const next = changes[key].newValue !== undefined ? changes[key].newValue : syncDefault(key);
      if (!same(next, values.get(key))) update(key, next, { initial: false, local: false });
    }
  });
}

/** fn(key, value) after any setting changes. */
export function onSettingChange(fn) {
  listeners.push(fn);
}

function update(key, value, ctx, always = false) {
  if (!always && same(value, values.get(key)) && !ctx.local) return;
  values.set(key, value);
  const entry = entries.get(key);
  if (entry.apply) entry.apply(value, ctx);
  for (const fn of listeners.slice()) {
    try { fn(key, value); } catch (e) { console.error('[settings] listener failed', e); }
  }
}
