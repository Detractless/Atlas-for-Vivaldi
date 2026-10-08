// content/settingsCache.js — in-memory settings cache for the content world.
// Loaded once at startup, kept fresh via storage.onChanged. Modules read the
// cache synchronously to gate their behavior (no async hop per keystroke).
import { DEFAULT_SETTINGS, getSettings, onSettingsChanged } from './settings.js';

let settings = Object.assign({}, DEFAULT_SETTINGS);

export function getCachedSettings() {
  return settings;
}

export function initSettingsCache() {
  getSettings().then((s) => { settings = s; }).catch(() => {});
  onSettingsChanged((s) => { settings = s; });
}
