// shared/settings.js — Settings defaults + a chrome.storage.local wrapper + onChanged helper.
// Settings propagate via storage.onChanged (no messaging needed).

export const SETTINGS_KEY = 'pastekit.settings';

export const DEFAULT_SETTINGS = {
  tokenSystem:       true,   // master switch for @ token engine
  tokenAutocomplete: true,   // show @ dropdown while typing
  fieldDot:          true,   // show the Grammarly-style field dot
  smartDetect:       true,   // detectFieldType-based ranking in the picker
  pickerLimit:       10,     // max visible rows in the field-dot picker (1–15)
  dotMode:           'always', // 'always' | 'hover' | 'focus'
};

export async function getSettings() {
  let stored = {};
  try {
    const bag = await chrome.storage.local.get(SETTINGS_KEY);
    stored = (bag && bag[SETTINGS_KEY]) || {};
  } catch (_) { stored = {}; }
  return Object.assign({}, DEFAULT_SETTINGS, stored);
}

export async function setSettings(partial) {
  const current = await getSettings();
  const next = Object.assign({}, current, partial);
  await chrome.storage.local.set({ [SETTINGS_KEY]: next });
  return next;
}

/**
 * Subscribe to settings changes. Callback gets the full merged settings object.
 * Returns an unsubscribe function.
 */
export function onSettingsChanged(cb) {
  const listener = (changes, area) => {
    if (area !== 'local' || !changes[SETTINGS_KEY]) return;
    const next = Object.assign({}, DEFAULT_SETTINGS, changes[SETTINGS_KEY].newValue || {});
    cb(next);
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
