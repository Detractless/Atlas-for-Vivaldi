import { DEFAULT_ENGINES } from '../constants/engines.js';
import { storageGet, storageSet } from './storage.js';

export async function loadEngines() {
  return new Promise((resolve) => {
    if (window.chrome && window.chrome.storage) {
      storageGet('sync', ['customSearchEngines']).then((result) => {
        if (result.customSearchEngines && Object.keys(result.customSearchEngines).length > 0) {
          resolve(result.customSearchEngines);
        } else {
          const defaults = JSON.parse(JSON.stringify(DEFAULT_ENGINES));
          storageSet('sync', { customSearchEngines: defaults }).then(() => resolve(defaults));
        }
      });
    } else {
      resolve(JSON.parse(JSON.stringify(DEFAULT_ENGINES)));
    }
  });
}

export function saveEngines(engines, callback) {
  if (window.chrome && window.chrome.storage) {
    storageSet('sync', { customSearchEngines: engines }).then(callback);
  }
}
