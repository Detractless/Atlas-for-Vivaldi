import { BookmarkDB } from '../../services/bookmarksDB.js';
import { generateAcronymSvg } from '../shared/acronymBadge.js';
import { readFileAsDataURL } from '../../utils/file.js';
import { attachScrollAffordance } from '../shared/scrollAffordance.js';
import { createSubpageNav } from '../shared/subpageNav.js';
import { ContextMenu } from '../contextMenu/contextMenu.js';
import { buildDialog } from '../bookmarks/bookmarkDialog.js';
import { Icons } from '../../constants/icons.js';
import {
  searchEngines,
  currentEngine, setCurrentEngine,
  defaultEngineKey, setDefaultEngineKey
} from '../../pages/newtab/newtabState.js';
import { setEngineIconSrc } from './engineIcons.js';
import { saveSearchEngines, updateCurrentEngine } from './enginesUI.js';

/* ══════════════════════════════════════════════════════════════════════
   ENGINE MODAL: subpage navigation + popup dialogs

   TWO views inside the engine modal card:
     #engine-home               engine list + "Add new engine" row
     [data-engine-panel="add"]  Add Engine form (clean; icon via picker)

   This comment used to claim a third, [data-engine-panel="edit"], holding
   Rename/Edit URL/Delete rows. No such panel has ever existed in index.html.
   Editing an engine is a right-click on its row, which opens the shared
   buildDialog (R-012) as an overlay; see openEngineItemDialog.

   Subpage navigation itself is NOT implemented here. It is the shared
   openSubpage/closeSubpage in components/shared/subpageNav.js (R-015), because
   the add flow is adopting the same pattern and one copy each would drift.

   Icon selection opens as a floating picker-card overlay, the same pattern
   used by the bookmark and settings pickers.
   ══════════════════════════════════════════════════════════════════════ */

/* _editingKey and _deleteArmed used to sit here too. Both were only ever
   WRITTEN (declared, then cleared on returning home) and never read: they held
   the state of the edit subpage that this file's header claimed existed and
   index.html never had. They went with the dead dialogs. */
let _iconType    = 'file';
let _iconFile    = null;
let _iconAcronym = { text: '', color: '#3b82f6' };

/* ── Subpage navigation ───────────────────────────────────────────── */

/* The four coupled writes now live in subpageNav.js (R-015). What stays here
   is only what is specific to THIS card: which selectors it drives. The add
   form's own state is reset by resetAddForm on the way IN, not on the way out,
   so returning home has nothing left to clear. */
const nav = createSubpageNav({
  panels:    '.engine-subpage',
  home:      '#engine-home',
  title:     '#engine-modal-title',
  closeBtn:  '#close-engine-modal',
  homeTitle: 'Search Engines',
  panelAttr: 'data-engine-panel',
  titleAttr: 'engineTitle',
});

const openEngineSubpage  = (name, customTitle) => nav.open(name, customTitle);
const closeEngineSubpage = () => nav.close();

/* ── Popup dialog builder ─────────────────────────────────────────── */

const DIALOG_CLASS = 'engine-popup-dialog';

function closeAllEngineDialogs() {
  document.querySelectorAll('.' + DIALOG_CLASS).forEach(n => n.remove());
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls)  e.className  = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function buildEngineDialog({ title, subtitle, body, foot }) {
  closeAllEngineDialogs();

  const overlay = el('div', `modal show ${DIALOG_CLASS}`);
  const card    = el('div', 'picker-card');

  card.appendChild(el('div', 'picker-title', title));
  if (subtitle) card.appendChild(el('div', 'picker-subtitle', subtitle));
  if (body) card.appendChild(body);

  if (foot && foot.length) {
    const footEl = el('div', 'picker-foot');
    foot.forEach(({ label, primary, onClick }) => {
      const btn = el('button', 'picker-btn' + (primary ? ' picker-btn--primary' : ''), label);
      btn.type = 'button';
      btn.addEventListener('click', onClick);
      footEl.appendChild(btn);
    });
    card.appendChild(footEl);
  }

  overlay.appendChild(card);
  overlay.addEventListener('click', e => { if (e.target === overlay) closeAllEngineDialogs(); });
  document.body.appendChild(overlay);
  return overlay;
}

/* ── Icon type picker — layer 1 ───────────────────────────────────── */

function openIconTypePicker() {
  const body = el('div', 'picker-pane picker-pane--on');

  /* The options sit in a well like every other dialog list, and the current one
     is marked with the shared tick. This was the THIRD consumer of .picker-radio
     and the one I missed when deleting it: the class had no rules left, so the
     mark would have rendered as nothing at all. */
  const host = el('div', 'picker-wellhost');
  const well = el('div', 'picker-well');

  [{ type: 'file', label: 'Upload SVG' }, { type: 'acronym', label: 'Acronym' }].forEach(({ type, label }) => {
    const row = el('button', 'picker-row' + (_iconType === type ? ' is-current' : ''));
    row.type = 'button';
    row.appendChild(el('span', 'picker-check'));
    const span = el('span', '', label); span.style.flex = '1';
    row.append(span);
    row.addEventListener('click', () => {
      _iconType = type;
      const labelEl = document.getElementById('engine-add-icon-label');
      if (labelEl) labelEl.textContent = type === 'file' ? 'Upload SVG' : 'Acronym';
      closeAllEngineDialogs();
      setTimeout(() => openIconInputPicker(type), 80);
    });
    well.appendChild(row);
  });
  host.appendChild(well);
  body.appendChild(host);

  buildEngineDialog({ title: 'Icon type', subtitle: 'How the engine icon is provided', body, foot: [] });
}

/* ── Icon input picker — layer 2 ──────────────────────────────────── */

function openIconInputPicker(type) {
  const body = el('div', 'picker-fieldwrap');
  let inputEl;

  if (type === 'file') {
    inputEl = document.createElement('input');
    inputEl.type = 'file'; inputEl.accept = '.svg';
    inputEl.style.display = 'none';
    const proxyBtn = document.createElement('button');
    proxyBtn.className = 'picker-btn';
    proxyBtn.type = 'button';
    proxyBtn.style.width = '100%';
    proxyBtn.textContent = 'Select SVG File';
    proxyBtn.addEventListener('click', () => inputEl.click());
    inputEl.addEventListener('change', () => {
      const file = inputEl.files?.[0];
      proxyBtn.textContent = file ? file.name : 'Select SVG File';
    });
    body.append(inputEl, proxyBtn);
  } else {
    const row = el('div'); row.style.cssText = 'display:flex;gap:10px;align-items:center;';
    inputEl = document.createElement('input');
    inputEl.type = 'text'; inputEl.maxLength = 2; inputEl.placeholder = 'e.g. YT';
    inputEl.className = 'picker-field'; inputEl.value = _iconAcronym.text; inputEl.style.flex = '1';
    const colorInput = document.createElement('input');
    colorInput.type = 'color'; colorInput.value = _iconAcronym.color;
    colorInput.className = 'color-picker-circle'; colorInput.style.flexShrink = '0';
    colorInput.addEventListener('input', () => { _iconAcronym.color = colorInput.value; });
    row.append(inputEl, colorInput); body.appendChild(row);
  }

  buildEngineDialog({
    title: type === 'file' ? 'Upload SVG' : 'Acronym',
    subtitle: type === 'acronym' ? 'Up to 2 letters and a colour' : undefined,
    body,
    foot: [
      { label: 'Back', onClick: () => { closeAllEngineDialogs(); setTimeout(() => openIconTypePicker(), 80); } },
      { label: 'Done', primary: true, onClick: () => {
        if (type === 'file') { _iconFile = inputEl.files?.[0] || null; }
        else { _iconAcronym.text = inputEl.value.trim(); }
        closeAllEngineDialogs();
      }},
    ],
  });

  if (type === 'acronym') requestAnimationFrame(() => { inputEl.focus(); inputEl.select(); });
}

/* Rename and Edit URL used to live here as a second pair of dialogs, reached
   through exports nothing imported. They were an ABANDONED COPY of what
   openEngineItemDialog already does with the shared buildDialog, and both of
   their save handlers called openEditSubpage(), a function that has never
   existed in this file. esbuild tree-shook the pair out of the bundle because
   the exports were unreachable, so the broken call never threw; deleted here
   rather than repaired, since the live path below is the one to keep. */

/* ── Engine list rendering ────────────────────────────────────────── */

function makeStarSvg(filled) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('width', '16'); svg.setAttribute('height', '16');
  svg.setAttribute('fill', filled ? 'currentColor' : 'none');
  svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '2');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z');
  svg.appendChild(path); return svg;
}

export function renderEngineListInModal() {
  closeEngineSubpage();
  const listContainer = document.getElementById('engine-list-container');
  if (!listContainer) return;
  listContainer.innerHTML = '';
  const keys = Object.keys(searchEngines);

  keys.forEach((key, i) => {
    const engine = searchEngines[key];
    const first = i === 0, last = i === keys.length - 1;

    const row = document.createElement('div');
    row.className = 'settings-row engine-list-row'; row.style.cursor = 'default';
    if      (first && last) row.style.borderRadius = '16px';
    else if (first)         row.style.borderRadius = '16px 16px 4px 4px';
    else if (last)          row.style.borderRadius = '4px 4px 16px 16px';
    else                    row.style.borderRadius = '4px';
    if (engine.isHidden) row.style.opacity = '0.5';

    const iconWrap = document.createElement('div'); iconWrap.className = 'engine-row-icon';
    const img = document.createElement('img');
    setEngineIconSrc(img, engine, key); img.width = 16; img.height = 16;
    img.onerror = () => { img.src = 'src/assets/svg/default.api.svg'; };
    iconWrap.appendChild(img); row.appendChild(iconWrap);

    const textWrap = document.createElement('span'); textWrap.className = 'settings-row-text';
    const nameEl = document.createElement('span'); nameEl.className = 'settings-row-title'; nameEl.textContent = engine.name;
    const urlEl  = document.createElement('span'); urlEl.className  = 'settings-row-value';  urlEl.textContent  = engine.url || 'Default Browser Search';
    textWrap.append(nameEl, urlEl); row.appendChild(textWrap);

    const controls = document.createElement('div'); controls.className = 'engine-row-controls';
    const starBtn = document.createElement('button'); starBtn.className = 'engine-star-btn'; starBtn.type = 'button'; starBtn.title = 'Set as default';
    const isDefault = key === defaultEngineKey; starBtn.classList.toggle('active', isDefault);
    starBtn.appendChild(makeStarSvg(isDefault));
    starBtn.addEventListener('click', e => { e.stopPropagation(); setDefaultEngine(key); });

    const toggleLabel = document.createElement('label'); toggleLabel.className = 'toggle-switch small-switch';
    const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = !engine.isHidden;
    checkbox.addEventListener('change', e => { e.stopPropagation(); toggleEngineVisibility(key, e.target.checked); });
    const slider = document.createElement('span'); slider.className = 'toggle-slider';
    toggleLabel.append(checkbox, slider);
    controls.append(toggleLabel, starBtn); row.appendChild(controls);

    row.addEventListener('contextmenu', e => { e.preventDefault(); if (ContextMenu.disabled) return; openEngineItemDialog(key); });
    listContainer.appendChild(row);
  });
}

/* ── Open edit subpage ────────────────────────────────────────────── */

/* ── Open edit dialog ────────────────────────────────────────────── */

function openEngineItemDialog(key) {
  const engine = searchEngines[key]; if (!engine) return;
  buildDialog({
    title: engine.name,
    subtitle: engine.url || 'Default Browser Search',
    actions: [
      {
        kind: 'input', label: 'Rename', paneTitle: 'Rename engine',
        icon: Icons.edit, fieldValue: engine.name,
        save: (newName) => {
          if (!newName.trim()) return;
          searchEngines[key].name = newName.trim();
          saveSearchEngines(); renderEngineListInModal();
          if (currentEngine === key) updateCurrentEngine(key);
        },
      },
      {
        kind: 'input', label: 'Edit URL', paneTitle: 'Edit URL',
        icon: Icons.link, fieldValue: engine.url || '', placeholder: 'https://example.com/search?q=',
        save: (newUrl) => {
          searchEngines[key].url = newUrl.trim();
          saveSearchEngines(); renderEngineListInModal();
          if (currentEngine === key) updateCurrentEngine(key);
        },
      },
      {
        kind: 'danger', label: 'Delete engine', icon: Icons.delete, count: 1,
        confirm: async () => { await doDeleteEngine(key); }
      },
    ],
  });
}

/* ── Engine actions ───────────────────────────────────────────────── */

function setDefaultEngine(key) {
  setDefaultEngineKey(key);
  window.chrome.storage.sync.set({ defaultEngineKey: key }, () => { renderEngineListInModal(); });
}

function toggleEngineVisibility(key, isVisible) {
  if (!searchEngines[key]) return;
  searchEngines[key].isHidden = !isVisible;
  if (!isVisible && currentEngine === key) { if (searchEngines['default']) searchEngines['default'].isHidden = false; updateCurrentEngine('default'); }
  saveSearchEngines(); renderEngineListInModal();
}

async function doDeleteEngine(key) {
  if (currentEngine === key) { setCurrentEngine('default'); updateCurrentEngine('default'); }
  if (searchEngines[key]?.isCustomIcon) await BookmarkDB.deleteIcon(key);
  delete searchEngines[key]; saveSearchEngines(); renderEngineListInModal();
}

/* ── Modal init ───────────────────────────────────────────────────── */

export function initEngineModal() {
  const body = document.querySelector('#engine-modal .settings-body');
  if (body) {
    const affordance = attachScrollAffordance(body, {
      items: '.settings-section-header, .settings-row',
      noun: ''
    });
    document.addEventListener('engine-modal-opened', () => {
      requestAnimationFrame(affordance.refresh);
    });
  }

  const closeBtn = document.getElementById('close-engine-modal');
  if (closeBtn) closeBtn.addEventListener('click', () => {
    // Asks the nav, not the button: which dataset key records "on a subpage"
    // is subpageNav's private detail now, and this used to read it directly.
    if (nav.isSubpage()) closeEngineSubpage();
    else document.getElementById('engine-modal').classList.remove('show');
  });

  const saveBtn = document.getElementById('save-engines');
  if (saveBtn) saveBtn.addEventListener('click', () => {
    document.getElementById('engine-modal').classList.remove('show');
  });

  const addEngineBtn = document.getElementById('add-engine-btn');
  if (addEngineBtn) addEngineBtn.addEventListener('click', () => {
    resetAddForm(); openEngineSubpage('add');
    requestAnimationFrame(() => { document.getElementById('engine-add-name')?.focus(); });
  });

  const iconRow = document.getElementById('engine-add-icon-row');
  if (iconRow) iconRow.addEventListener('click', openIconTypePicker);

  const addSubmit = document.getElementById('engine-add-submit');
  if (addSubmit) addSubmit.addEventListener('click', handleAddEngine);

}

/* ── Add form helpers ─────────────────────────────────────────────── */

function resetAddForm() {
  _iconType = 'file'; _iconFile = null; _iconAcronym = { text: '', color: '#3b82f6' };
  const nameField = document.getElementById('engine-add-name');
  const urlField  = document.getElementById('engine-add-url');
  const iconLabel = document.getElementById('engine-add-icon-label');
  const errEl     = document.getElementById('engine-add-error');
  if (nameField)  nameField.value = '';
  if (urlField)   urlField.value  = '';
  if (iconLabel)  iconLabel.textContent = 'Upload SVG';
  if (errEl)      { errEl.textContent = ''; errEl.classList.remove('picker-error--show'); }
}

async function handleAddEngine() {
  const nameVal = (document.getElementById('engine-add-name')?.value || '').trim();
  const urlVal  = (document.getElementById('engine-add-url')?.value  || '').trim();
  const errEl   = document.getElementById('engine-add-error');

  if (!nameVal || !urlVal) {
    if (errEl) { errEl.textContent = 'Name and URL are required.'; errEl.classList.add('picker-error--show'); }
    return;
  }

  const id = 'custom_' + Date.now();
  let isCustomIcon = false; let iconData = null;

  try {
    if (_iconType === 'acronym') {
      if (!_iconAcronym.text) {
        if (errEl) { errEl.textContent = 'Click "Icon type" to set an acronym first.'; errEl.classList.add('picker-error--show'); }
        return;
      }
      iconData = generateAcronymSvg(_iconAcronym.text, _iconAcronym.color); isCustomIcon = true;
    } else if (_iconFile) {
      iconData = await readFileAsDataURL(_iconFile); isCustomIcon = true;
    }
    if (isCustomIcon && iconData) await BookmarkDB.saveIcon(id, iconData);
  } catch (_) {
    if (errEl) { errEl.textContent = 'Failed to process the icon.'; errEl.classList.add('picker-error--show'); }
    return;
  }

  searchEngines[id] = { name: nameVal, url: urlVal, isCustomIcon, icon: isCustomIcon ? null : 'src/assets/svg/default.api.svg', isDefault: false };
  saveSearchEngines(); renderEngineListInModal();
}

/* Five more exports stood here (renameEngine, editEngineUrl, deleteEngine,
   toggleIconInput, addNewEngine). Nothing in the project imported any of them:
   the module's only consumers are enginesUI.js, modalVisibility.js and
   newtab.js, and between them they take renderEngineListInModal and
   initEngineModal. toggleIconInput had already decayed to an empty body. */