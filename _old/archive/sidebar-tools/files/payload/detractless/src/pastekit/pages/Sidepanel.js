// sidepanel/sidepanel.js — Pastekit library in the browser side panel.
// Bundled by esbuild into dist/sidepanel.bundle.js.
// Full snippet management: browse/search/fill/copy, in-card editor slide
// (list <-> edit form inside the white card), row actions via right-click
// or the hover "…" button, quick settings with import/export + tag cloud.
import { MSG, call } from '../utils/messages.js';
import { getSettings, setSettings } from '../utils/settings.js';
import { openPanelDialog } from '../../pages/sidepanel/panelDialog.js';
import { Icons } from '../../constants/icons.js';
import { emptyState } from '../../components/shared/emptyState.js';

// Required-element lookup: throws loudly if the markup and JS drift apart.
const $ = (id) => {
  const foundEl = document.getElementById(id);
  if (!foundEl) throw new Error(`Sidepanel: required element #${id} not found`);
  return foundEl;
};
const input = (id) => /** @type {HTMLInputElement} */ ($(id));
const button = (id) => /** @type {HTMLButtonElement} */ ($(id));
const textarea = (id) => /** @type {HTMLTextAreaElement} */ ($(id));
const els = {
  search: input('search'), list: $('list'), bar: $('pkBar'),
  libraryPage: $('pkLibraryPage'), editorPage: $('pkEditorPage'),
  settingsPage: $('pkSettingsPage'), foot: $('pkFoot'),
  fillBtn: button('fillBtn'), copyBtn: button('copyBtn'), splitLines: input('splitLines'),
  splitWrap: $('splitWrap'), status: $('status'),
  libActions: $('libActions'), editActions: $('editActions'),
  cancelBtn: button('cancelBtn'), saveBtn: button('saveBtn'),
  settingsBtn: $('settingsBtn'), newBtn: $('newBtn'), hdTitle: $('hdTitle'),
  hdActions: $('pkHdActions'),
  edError: $('edError'),
  fName: input('fName'), fDesc: input('fDesc'), fTags: input('fTags'),
  fText: textarea('fText'), fHtml: textarea('fHtml'),
  fHtmlWrap: /** @type {HTMLDetailsElement} */ ($('fHtmlWrap')),
  tagCloud: $('tagCloud'),
  dotModeRow: $('dotModeRow'), dotModeVal: $('dotModeVal'),
  limitRow: $('limitRow'), limitVal: $('limitVal'),
};

let snippets = [];
let query = '';
const selection = [];
let editing = null;     // snippet being edited (null = new)
let editorOpen = false;
let tagFilter = null;   // the tag chip currently filtering the list

// Called by the combined sidepanel entry once the DOM is ready.
export function initSidepanel() { return init(); }

/**
 * The header arrow, one level at a time. PasteKit owns its page state, and the
 * combined entry owns which VIEW is showing, so the entry asks first and only
 * leaves for home when this says there is nothing left to walk back from.
 * @returns {boolean} true when a page was closed and the view should stay open
 */
export function pasteKitBack() {
  if (editorOpen) { closeEditor(); return true; }
  if (settingsOpen) { showSettings(false); return true; }
  return false;
}

async function init() {
  els.search.addEventListener('input', () => { query = els.search.value; refresh(); });
  els.fillBtn.addEventListener('click', startFill);
  els.copyBtn.addEventListener('click', copySelected);
  els.settingsBtn.addEventListener('click', () => showSettings(!settingsOpen));
  els.newBtn.addEventListener('click', () => openEditor(null));
  els.cancelBtn.addEventListener('click', closeEditor);
  els.saveBtn.addEventListener('click', saveEditor);
  els.dotModeRow.addEventListener('click', pickDotMode);
  els.limitRow.addEventListener('click', pickRowsVisible);

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === MSG.SNIPPETS_CHANGED) refresh();
  });

  /* Escape walks up one level, matching the header arrow. The slide-over strips
     it used to dismiss are gone; panelDialog owns Escape while a dialog is open
     and stops it there, so this only ever sees the pages. */
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (editorOpen) closeEditor();
    else if (settingsOpen) showSettings(false);
  });

  await refresh();
  await checkInProgress();
}

// ------------------------------- data + render ------------------------------

async function refresh() {
  try {
    snippets = await call(MSG.SNIPPET_SEARCH, { query, folderId: null });
  } catch (_) { snippets = []; }
  /* The tag filter narrows what the search already returned, so a query and a
     chip compose instead of fighting. */
  if (tagFilter) {
    snippets = snippets.filter(s => (s.tags || []).includes(tagFilter));
  }
  drawList();
  updateFooter();
  drawTags();
}

function drawList() {
  els.list.replaceChildren();
  if (!snippets.length) {
    /* R-038: the shared builder, like every other view. The filtered state uses
       the search glyph even when only a TAG is set, because a chip is a filter
       and clearing it brings the list back, same as a query. */
    els.list.appendChild((query || tagFilter)
      ? emptyState(Icons.search, 'No snippets match')
      : emptyState(Icons.clipboard, 'No snippets yet'));
    return;
  }
  for (const s of snippets) {
    const pos = selection.indexOf(s.id);

    /* A DIV, not a button: the row contains the menu button and buttons cannot
       nest. Spec 005 swapped .row for the shared settings row, so PasteKit,
       Saved Tabs and the new tab's settings all draw the same object. */
    const rowEl = document.createElement('div');
    rowEl.className = 'settings-row' + (pos !== -1 ? ' selected' : '');
    rowEl.dataset.id = String(s.id);
    if (s.tags && s.tags.length) rowEl.title = s.tags.join(', ');

    const textEl = document.createElement('span'); textEl.className = 'settings-row-text';
    const nmEl = document.createElement('span'); nmEl.className = 'settings-row-title';
    nmEl.textContent = s.name;
    textEl.appendChild(nmEl);
    if (s.description) {
      const dsEl = document.createElement('span'); dsEl.className = 'settings-row-value';
      dsEl.textContent = s.description;
      textEl.appendChild(dsEl);
    }
    rowEl.appendChild(textEl);

    /* The queue position, unchanged in meaning: it says WHERE in the fill order
       this snippet sits, so it only exists while the snippet is selected. */
    if (pos !== -1) {
      const qposEl = document.createElement('span'); qposEl.className = 'qpos';
      qposEl.textContent = String(pos + 1);
      rowEl.appendChild(qposEl);
    }

    const moreEl = document.createElement('button');
    moreEl.className = 'sp-row-btn'; moreEl.textContent = '\u22EF';
    moreEl.title = 'Copy / edit / delete';
    moreEl.addEventListener('click', (e) => { e.stopPropagation(); snippetMenu(s); });
    rowEl.appendChild(moreEl);

    // Row click still SELECTS for filling; that is PasteKit's core gesture.
    rowEl.addEventListener('click', () => toggleSelect(s.id, selection.indexOf(s.id) === -1));
    rowEl.addEventListener('contextmenu', (e) => { e.preventDefault(); snippetMenu(s); });

    els.list.appendChild(rowEl);
  }
}

/* One menu per snippet, the picker (R-029). Copy lives here now rather than only
   in the foot, because the foot copies the SELECTION while this copies the one
   snippet you pointed at. Delete arms in place; no filled destructive button. */
function snippetMenu(s) {
  openPanelDialog({
    title: s.name,
    subtitle: s.description || undefined,
    rows: [
      {
        icon: Icons.copy, label: 'Copy text',
        onPick: async () => {
          try {
            await navigator.clipboard.writeText(s.contentText || '');
            els.status.textContent = 'Copied ' + s.name + '.';
          } catch (_) { els.status.textContent = 'Copy failed.'; }
        },
      },
      { icon: Icons.edit, label: 'Edit', onPick: () => openEditor(s) },
      {
        icon: Icons.delete, label: 'Delete', danger: true,
        onPick: () => {
          call(MSG.SNIPPET_DELETE, { id: s.id })
            .then(() => {
              const i = selection.indexOf(s.id);
              if (i !== -1) selection.splice(i, 1);
            })
            .catch((e) => { els.status.textContent = 'Delete failed: ' + e.message; });
          // the list refresh arrives via the SNIPPETS_CHANGED broadcast
        },
      },
    ],
  });
}

// ------------------------------- editor page --------------------------------
function openEditor(snippet) {
  editing = snippet;
  editorOpen = true;
  /* The ONE header names the page; there is no second head to keep in sync. */
  els.hdTitle.textContent = snippet ? 'Edit snippet' : 'New snippet';
  els.edError.textContent = '';
  els.fName.value = snippet ? snippet.name : '';
  els.fDesc.value = snippet ? (snippet.description || '') : '';
  els.fTags.value = snippet ? (snippet.tags || []).join(', ') : '';
  els.fText.value = snippet ? (snippet.contentText || '') : '';
  els.fHtml.value = snippet ? (snippet.contentHtml || '') : '';
  els.fHtmlWrap.open = !!(snippet && snippet.contentHtml);
  showPage('editor');
  // Footer swaps to Cancel / Save while editing.
  els.libActions.classList.add('hidden');
  els.editActions.classList.remove('hidden');
  els.splitWrap.style.visibility = 'hidden';
  els.status.textContent = '';
  /* Pages fade rather than slide, so there is no transition to focus past:
     the old 300ms wait existed only because focusing mid-slide made the card
     scroll sideways (see focusAfterSlide in pages/sidepanel/sidepanel.js). */
  try { els.fName.focus(); } catch (_) { /* page swapped again already */ }
}

function closeEditor() {
  editing = null;
  editorOpen = false;
  els.hdTitle.textContent = 'PasteKit';
  showPage('library');
  els.libActions.classList.remove('hidden');
  els.editActions.classList.add('hidden');
  els.splitWrap.style.visibility = '';
}

/* The three pages of this view. One is visible at a time; the header title and
   the foot say which. Search only exists on the library page, where it has
   something to search. */
function showPage(which) {
  els.libraryPage.hidden = which !== 'library';
  els.editorPage.hidden = which !== 'editor';
  els.settingsPage.hidden = which !== 'settings';
  els.bar.hidden = which !== 'library';
  /* The chips filter the library list, so they leave with it. */
  els.tagCloud.hidden = which !== 'library';
  els.foot.hidden = which === 'settings';

  /* THE HEADER ACTIONS BELONG TO THE LIBRARY. + makes a new snippet and the gear
     opens settings: both act on the LIST, and neither means anything once you
     are inside a sub-page. Leaving them live cost two real defects. On the
     settings page the gear turned itself into a SECOND back arrow, facing the
     one already on the left. On the editor page they stayed fully live, so +
     replaced an in-progress edit with a blank form and the gear walked away from
     it, both without a prompt. One rule here rather than a line per page, which
     is how those two drifted apart in the first place. */
  els.hdActions.hidden = which !== 'library';
}

async function saveEditor() {
  const rec = {
    name: els.fName.value.trim(),
    description: els.fDesc.value.trim(),
    folderId: editing ? (editing.folderId || 0) : 0,
    tags: els.fTags.value.split(',').map(t => t.trim()).filter(Boolean),
    contentText: els.fText.value,
    contentHtml: els.fHtml.value.trim(),
  };
  if (editing) rec.id = editing.id;
  if (!rec.name) { els.edError.textContent = 'Name is required.'; return; }
  try {
    await call(MSG.SNIPPET_SAVE, { snippet: rec });
    closeEditor();
  } catch (e) {
    els.edError.textContent = e.message;
  }
}

// ------------------------------ selection/footer ----------------------------
function toggleSelect(id, on) {
  const i = selection.indexOf(id);
  if (on && i === -1) selection.push(id);
  else if (!on && i !== -1) selection.splice(i, 1);
  drawList();
  updateFooter();
}

function updateFooter() {
  const n = selection.length;
  els.fillBtn.textContent = `Fill (${n})`;
  els.fillBtn.disabled = n === 0;
  els.copyBtn.disabled = n === 0;
}

async function collectSelectedFull() {
  let all = snippets;
  const missing = selection.some(id => !snippets.find(s => s.id === id));
  if (missing) {
    try { all = await call(MSG.SNIPPET_LIST, {}); }
    catch (_) { /* SW unreachable — fall back to the already-loaded search results */ }
  }
  const byId = new Map(all.map(s => [s.id, s]));
  return selection.map(id => byId.get(id)).filter(Boolean);
}

// ------------------------------- fill / copy --------------------------------
async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

async function startFill() {
  const chosen = await collectSelectedFull();
  if (!chosen.length) return;
  let items = chosen.map(s => ({ id: s.id, text: s.contentText, html: s.contentHtml, label: s.name }));
  if (els.splitLines.checked) {
    items = items.flatMap(it =>
      it.text.split(/\r?\n/).map(t => t.trim()).filter(Boolean)
        .map(t => Object.assign({}, it, { text: t, html: null })));
  }
  const tab = await activeTab();
  if (!tab || tab.id == null) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: MSG.FILL_START, snippets: items });
    selection.length = 0;
    drawList();
    updateFooter();
    els.status.textContent = 'Fill mode active — click fields on the page.';
  } catch (_) {
    els.status.textContent = 'Cannot fill on this page (try reloading it).';
  }
}

async function copySelected() {
  const chosen = await collectSelectedFull();
  if (!chosen.length) return;
  const text = chosen.map(s => s.contentText).join('\n\n');
  try {
    await navigator.clipboard.writeText(text);
    els.status.textContent = 'Copied ' + chosen.length + ' snippet(s).';
  } catch (_) { els.status.textContent = 'Copy failed.'; }
}

async function checkInProgress() {
  try {
    const tab = await activeTab();
    if (!tab || tab.id == null) return;
    const tabId = tab.id;
    const res = await chrome.tabs.sendMessage(tabId, { type: MSG.FILL_STATUS });
    if (res && res.active) {
      els.status.textContent = `Fill in progress ${res.cursor}/${res.total}`;
      els.fillBtn.textContent = 'Cancel fill';
      els.fillBtn.disabled = false;
      els.fillBtn.onclick = async () => {
        try { await chrome.tabs.sendMessage(tabId, { type: MSG.FILL_CANCEL }); }
        catch (_) { /* content script already gone — fill is over either way */ }
        els.status.textContent = '';
        els.fillBtn.onclick = startFill;
        updateFooter();
      };
    }
  } catch (_) { /* no content script on this page */ }
}

// ------------------------------- quick settings -----------------------------
let settingsOpen = false;
const toggles = /** @type {HTMLInputElement[]} */ (Array.from(document.querySelectorAll('input[data-setting]')));

function showSettings(on) {
  settingsOpen = on;
  els.hdTitle.textContent = on ? 'Quick settings' : 'PasteKit';
  /* The gear STAYS a gear. It used to become a back arrow while settings were
     open, which made sense when the left arrow always went straight home; since
     spec 005 that arrow walks up one level, so the gear's version was a second
     way to do the same thing. It is hidden on this page anyway now. */
  showPage(on ? 'settings' : 'library');
  if (on) loadToggles();
}

const PICKER_MIN = 1, PICKER_MAX = 15;

async function loadToggles() {
  try {
    const s = await getSettings();
    for (const t of toggles) t.checked = !!s[t.dataset.setting];
    setPickerLimit(s.pickerLimit ?? 10, false);
    setDotMode(s.dotMode || 'always', false);
  } catch (_) { /* settings unavailable — leave the controls at their defaults */ }
}

/* VALUE ROWS, not a stepper and a segment strip (spec 005). Both were vocabulary
   the new tab does not have, and both jobs already had a pattern there: this is
   its theme picker and its UI-scale picker, which is likewise a list of discrete
   values behind a row that shows the current one. */
function setPickerLimit(n, save = true) {
  n = Math.max(PICKER_MIN, Math.min(PICKER_MAX, n));
  els.limitVal.textContent = String(n);
  if (save) setSettings({ pickerLimit: n }).catch(() => {});
}

const DOT_MODES = [
  { value: 'always', label: 'Always' },
  { value: 'hover', label: 'On hover' },
  { value: 'focus', label: 'On focus' },
];
let dotMode = 'always';

function setDotMode(mode, save = true) {
  dotMode = mode;
  const found = DOT_MODES.find(m => m.value === mode);
  els.dotModeVal.textContent = found ? found.label : mode;
  if (save) setSettings({ dotMode: mode }).catch(() => {});
}

/** A radio row for a picker: the filled-dot mark, never a ring (UI-RULES). */
function choiceRows(options, current, onPick) {
  return options.map(opt => ({
    icon: '',
    label: opt.label,
    mark: opt.value === current,
    onPick: () => onPick(opt.value),
  }));
}

function pickDotMode() {
  openPanelDialog({
    title: 'Dot visibility',
    rows: choiceRows(DOT_MODES, dotMode, (v) => setDotMode(v)),
  });
}

function pickRowsVisible() {
  const options = [];
  for (let n = PICKER_MIN; n <= PICKER_MAX; n++) options.push({ value: n, label: String(n) });
  openPanelDialog({
    title: 'Rows visible',
    rows: choiceRows(options, Number(els.limitVal.textContent), (v) => setPickerLimit(v)),
  });
}

for (const t of toggles) {
  t.addEventListener('change', () => {
    const key = t.dataset.setting;
    if (!key) return;
    setSettings({ [key]: t.checked }).catch(() => {});
  });
}

// --------------------------------- tags -------------------------------------
/* THE TAG CLOUD MOVED (spec 005). It used to sit in quick settings, where it
   changed nothing: it is a read-only answer to "what can I search for", so it
   now lives under the search field and the chips FILTER. Drawn once at refresh
   rather than only when settings opened, since it is part of the library now. */
async function drawTags() {
  let tags = [];
  try { tags = await call(MSG.TAG_LIST); }
  catch (_) { /* SW unreachable: leave the bar empty, :empty hides it */ }
  els.tagCloud.replaceChildren();
  for (const t of tags) {
    const chip = document.createElement('button');
    chip.className = 'sp-chip' + (t === tagFilter ? ' active' : '');
    chip.textContent = t;
    chip.addEventListener('click', () => {
      /* Tapping the active chip clears it, so the bar is its own escape. */
      tagFilter = (t === tagFilter) ? null : t;
      refresh();
    });
    els.tagCloud.appendChild(chip);
  }
}
