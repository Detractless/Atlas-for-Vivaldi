import { DEFAULT_ENGINES } from '../constants/engines.js';

export async function loadEngines() {
  return new Promise((resolve) => {
    if (window.chrome && window.chrome.storage) {
      window.chrome.storage.sync.get(['customSearchEngines'], (result) => {
        if (result.customSearchEngines && Object.keys(result.customSearchEngines).length > 0) {
          resolve(result.customSearchEngines);
        } else {
          const defaults = JSON.parse(JSON.stringify(DEFAULT_ENGINES));
          window.chrome.storage.sync.set({ customSearchEngines: defaults }, () => resolve(defaults));
        }
      });
    } else {
      resolve(JSON.parse(JSON.stringify(DEFAULT_ENGINES)));
    }
  });
}

export function saveEngines(engines, callback) {
  if (window.chrome && window.chrome.storage) {
    window.chrome.storage.sync.set({ customSearchEngines: engines }, callback);
  }
}
