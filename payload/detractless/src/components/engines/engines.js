import './engines.css';
import { loadEngines } from '../../services/settings/engineStorage.js';
import {
  searchEngines, setSearchEngines,
  defaultEngineKey, setDefaultEngineKey,
  searchEngineBehavior, setSearchEngineBehavior, setCurrentEngine
} from '../../pages/newtab/newtabState.js';
import { storageGet, storageSet } from '../../services/storage.js';
import { warn } from '../../services/log.js';

export async function loadSearchEngines() {
  setSearchEngines(await loadEngines());
}

/* The page's engine button, its dropdown and the storage listener that followed
   the address bar's engine picks stood here. The address bar owns the engine
   choice now, so this file keeps only the list, the saved choice and the
   settings the address bar reads back. */
export function updateCurrentEngine(engineKey) {
  if (!searchEngines[engineKey]) return;
  setCurrentEngine(engineKey);
  saveSelectedEngine(engineKey);
}

export function loadSavedEngine() {
  try {
    if (window.chrome && window.chrome.storage) {
      storageGet('sync', ['selectedSearchEngine', 'searchEngineBehavior', 'defaultEngineKey']).then((result) => {
        setSearchEngineBehavior(result.searchEngineBehavior || "remember");
        setDefaultEngineKey(result.defaultEngineKey || "default");
        if (searchEngineBehavior === "always-default") setCurrentEngine(defaultEngineKey);
        else if (result.selectedSearchEngine && searchEngines[result.selectedSearchEngine]) setCurrentEngine(result.selectedSearchEngine);
        else setCurrentEngine(defaultEngineKey);
      });
    }
  } catch (error) { warn('loading the saved engine failed', error); }
}

export function saveSelectedEngine(engineKey) { try { if (window.chrome && window.chrome.storage) { storageSet('sync', { selectedSearchEngine: engineKey }); } } catch (error) { warn('saving the selected engine failed', error); } }
