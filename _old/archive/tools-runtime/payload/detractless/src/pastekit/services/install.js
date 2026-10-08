// background/install.js — onInstalled: seed default settings only.
// The library starts empty.
import { SETTINGS_KEY, DEFAULT_SETTINGS } from '../utils/settings.js';

export function initInstall() {
  chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason !== 'install') return;
    seed().catch((e) => console.error('[Pastekit] seed failed', e));
  });
}

async function seed() {
  // Default settings into chrome.storage.local. No demo content —
  // users build their own snippet library from scratch.
  try {
    const existing = await chrome.storage.local.get(SETTINGS_KEY);
    if (!existing || !existing[SETTINGS_KEY])
      await chrome.storage.local.set({ [SETTINGS_KEY]: DEFAULT_SETTINGS });
  } catch (_) { /* storage unavailable during install — defaults apply lazily on first read */ }
}
