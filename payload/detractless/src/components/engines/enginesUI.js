import './enginesUI.css';
import { loadEngines, saveEngines } from '../../services/engineStorage.js';
import { Icons } from '../../constants/icons.js';
import {
  searchEngines, setSearchEngines,
  currentEngine, setCurrentEngine,
  defaultEngineKey, setDefaultEngineKey,
  searchEngineBehavior, setSearchEngineBehavior
} from '../../pages/newtab/newtabState.js';
import { setEngineIconSrc } from './engineIcons.js';
import { renderEngineListInModal } from './engineModal.js';
import { storageGet, storageSet } from '../../services/storage.js';
import { warn } from '../../services/log.js';

let _onManageEngines = null;
export function setManageEnginesCallback(cb) { _onManageEngines = cb; }

export async function loadSearchEngines() {
  setSearchEngines(await loadEngines());
}

export function saveSearchEngines() {
  saveEngines(searchEngines, () => {
    renderEngineDropdown(); renderEngineListInModal();
  });
}

export function renderEngineDropdown() {
  const container = document.getElementById('engine-links');
  if (!container) return;
  container.innerHTML = '';
  Object.keys(searchEngines).sort((a, b) => (a === 'default' ? -1 : b === 'default' ? 1 : 0)).forEach(key => {
    const engine = searchEngines[key]; if (engine.isHidden) return;
    const a = document.createElement('a'); a.href = '#'; a.className = 'plus__link'; a.dataset.engine = key; a.title = engine.name;
    const img = document.createElement('img');
    img.alt = ''; img.width = 14; img.height = 14;
    img.style.cssText = 'width:14px;height:14px;object-fit:contain;flex-shrink:0;';
    img.onerror = () => { img.style.display = 'none'; };
    setEngineIconSrc(img, engine, key);
    const nameSpan = document.createElement('span'); nameSpan.textContent = engine.name;
    a.appendChild(img); a.appendChild(nameSpan);
    container.appendChild(a);
  });
  const manageBtn = document.createElement('button'); manageBtn.className = 'plus__link plus__manage';
  manageBtn.innerHTML = `${Icons.list} Engine Lists`;
  manageBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const plusEl = document.getElementById('plus'); if (plusEl) plusEl.classList.remove('plus--active');
    const linksEl = document.getElementById('engine-links'); if (linksEl) linksEl.classList.remove('active');
    if (_onManageEngines) _onManageEngines();
  });
  container.appendChild(manageBtn);
}

/* Show an engine on the engine button and make it the current one. */
function showEngine(engineKey) {
  const engine = searchEngines[engineKey]; const iconDisplay = document.getElementById('current-engine-icon-display');
  if (!iconDisplay || !engine) return false;
  iconDisplay.innerHTML = ''; const img = document.createElement('img'); setEngineIconSrc(img, engine, engineKey);
  img.alt = engine.name; img.onerror = () => { img.src = 'src/assets/svg/default.api.svg'; };
  iconDisplay.appendChild(img); setCurrentEngine(engineKey);
  return true;
}

export function updateCurrentEngine(engineKey) {
  if (showEngine(engineKey)) saveSelectedEngine(engineKey);
}

/** An engine picked elsewhere (the address bar's engine button) shows here
    too, unless engines always reset to the default. */
export function followEnginePicks() {
  if (!(window.chrome && chrome.storage && chrome.storage.onChanged)) return;
  chrome.storage.onChanged.addListener((changes, area) => {
    const c = area === 'sync' && changes.selectedSearchEngine;
    if (!c || searchEngineBehavior === 'always-default') return;
    if (c.newValue && c.newValue !== currentEngine && searchEngines[c.newValue]) showEngine(c.newValue);
  });
}

export function loadSavedEngine() {
  try {
    if (window.chrome && window.chrome.storage) {
      storageGet('sync', ['selectedSearchEngine', 'searchEngineBehavior', 'defaultEngineKey']).then((result) => {
        setSearchEngineBehavior(result.searchEngineBehavior || "remember");
        setDefaultEngineKey(result.defaultEngineKey || "default");
        if (searchEngineBehavior === "always-default") { setCurrentEngine(defaultEngineKey); updateCurrentEngine(defaultEngineKey); }
        else if (result.selectedSearchEngine && searchEngines[result.selectedSearchEngine]) { setCurrentEngine(result.selectedSearchEngine); updateCurrentEngine(currentEngine); }
        else { updateCurrentEngine(defaultEngineKey); }
        renderEngineDropdown();
      });
    }
  } catch (error) { warn('loading the saved engine failed', error); }
}

export function saveSelectedEngine(engineKey) { try { if (window.chrome && window.chrome.storage) { storageSet('sync', { selectedSearchEngine: engineKey }); } } catch (error) { warn('saving the selected engine failed', error); } }