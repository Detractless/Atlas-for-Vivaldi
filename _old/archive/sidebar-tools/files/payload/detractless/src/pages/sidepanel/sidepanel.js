// src/pages/sidepanel/sidepanel.js — combined sidebar entry point.
// Hosts the home view, the PasteKit panel, and the Remover view.
// Bundled by esbuild into src/dist/sidepanel.bundle.js.
// Token layer FIRST: esbuild emits CSS in import order, and these define the
// roles the stylesheets below resolve against. base.css follows them and before
// the panel sheets, so the panel can still override what it needs to.
import '../../styles/tokens.css';
import '../../styles/themes.css';
import '../../styles/base.css';
import '../../styles/components.css';
/* R-022: the shared panel vocabulary, ahead of BOTH consumers. It used to live
   inside PasteKit's sheet, which meant notes and saved tabs had nothing to adopt
   and grew a parallel set instead. Order matters: either consumer below can
   still override, neither has to reinvent. */
import '../../styles/panel.css';
import '../../pastekit/pages/sidepanel.css';
import './sidepanel.css';
import { initSidepanel, pasteKitBack } from '../../pastekit/pages/Sidepanel.js';
import { BookmarkDB } from '../../services/bookmarksDB.js';
import { attachScrollAffordance } from '../../components/shared/scrollAffordance.js';
import { openPanelDialog } from './panelDialog.js';
import { Icons } from '../../constants/icons.js';
import { createNoteSession } from '../../services/noteEditor.js';
import { readRule, ruleName, ruleLabel } from '../../services/removerRules.js';
import { emptyState, fillEmptyState } from '../../components/shared/emptyState.js';
import {
  listSavedGroups, removeSavedTab, removeSavedGroup, setGroupDescription,
  listOpenTabCandidates, defaultSelection, saveAndCloseSelected,
  groupMatches, updateSavedTab,
} from '../../services/tabSaver.js';

// ─── View navigation ─────────────────────────────────────────────────────────

function showPane(id) {
  document.querySelectorAll('.pane').forEach(p => p.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

/* Entering a view that searches puts the cursor in its search field, so you can
   type the moment it opens. rAF waits for the pane to become visible — focus on
   a display:none input is a no-op. Remover has no search, so it is left alone. */
function focusSearch(sel) {
  requestAnimationFrame(() => {
    const el = document.querySelector(sel);
    if (el) { try { el.focus(); } catch (_) { /* pane swapped again */ } }
  });
}

document.getElementById('tilePastekit').addEventListener('click', () => {
  showPane('view-pastekit');
  focusSearch('#search');
});
document.getElementById('tileRemover').addEventListener('click', () => {
  showPane('view-remover');
  loadRemoverView();
});
document.getElementById('tileNotes').addEventListener('click', () => {
  showPane('view-notes');
  renderNotes();
  focusSearch('#noteSearch');
});
document.getElementById('tileTabs').addEventListener('click', () => {
  showPane('view-tabs');
  renderSavedTabs();
  focusSearch('#tabsSearch');
});
document.getElementById('pkBack').addEventListener('click', () => {
  /* PasteKit has pages of its own now (spec 005), so the arrow walks up one
     level at a time and only leaves the view once it is back at the library. */
  if (pasteKitBack()) return;
  showPane('view-home');
});
document.getElementById('removerBack').addEventListener('click', () => showPane('view-home'));
document.getElementById('notesBack').addEventListener('click', () => {
  /* Walks UP one level, as in PasteKit and Saved Tabs. */
  /* The arrow means "done", not "undo": it COMMITS like Save. Only Cancel
     reverts, because only Cancel says so. */
  if (!document.getElementById('notesEditorPage').hidden) { commitNoteEditor(); return; }
  showPane('view-home');
});
document.getElementById('tabsBack').addEventListener('click', () => {
  /* Walks UP one level, the settings pattern: from a session's details back
     to the list, from the list back home. */
  /* Choose tabs walks back to the list too, and abandoning it saves and closes
     nothing, which is why that page has no Cancel button of its own. */
  if (!document.getElementById('tabsChoosePage').hidden) { showTabsListPage(); return; }
  if (!document.getElementById('tabsDetailPage').hidden) { showTabsListPage(); return; }
  showPane('view-home');
});

// ─── PasteKit ─────────────────────────────────────────────────────────────────
// Sidepanel.js runs its module-level element lookups and constant initialisations
// at import time (all elements are in the DOM). initSidepanel() fires the async
// setup: event listeners, first data fetch, fill-in-progress check.
initSidepanel();

// ─── Remover view ─────────────────────────────────────────────────────────────

let currentTabId = null;
let currentHost = null;
let removerArmed = false;

const armBtn = /** @type {HTMLButtonElement} */ (document.getElementById('armBtn'));
const removerTitle = /** @type {HTMLElement} */ (document.getElementById('removerTitle'));
const rulesList = /** @type {HTMLElement} */ (document.getElementById('removerRulesList'));
const removerEmpty = /** @type {HTMLElement} */ (document.getElementById('removerEmpty'));
const rememberChk = /** @type {HTMLInputElement} */ (document.getElementById('spRemoverRemember'));

chrome.storage.local.get('rhe_remember', (res) => {
  if (res.rhe_remember !== undefined) rememberChk.checked = res.rhe_remember;
});
rememberChk.addEventListener('change', () => {
  chrome.storage.local.set({ rhe_remember: rememberChk.checked });
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.rhe_rules && currentHost) {
    const newRules = changes.rhe_rules.newValue || {};
    renderRules(newRules[currentHost] || []);
  }
  // Live theme sync. themePreinit sets data-theme before first paint, but a panel
  // left open while the theme changes in the new tab would otherwise keep the old
  // one until it was reopened. __applyTheme is themePreinit's own resolver, so
  // 'system' is handled the same way in both places.
  if (changes._themeCache && window.__applyTheme) {
    window.__applyTheme(changes._themeCache.newValue);
  }
});

armBtn.addEventListener('click', async () => {
  if (!currentTabId) return;
  try {
    const res = await chrome.runtime.sendMessage({ action: 'toggleRemoverOnTab', tabId: currentTabId });
    removerArmed = res && res.state === 'ON';
  } catch (_) {
    removerArmed = !removerArmed;
  }
  /* armBtn is an icon disc now (R-040), not a text button, so its label lives in
     the tooltip/aria — setting textContent would wipe the SVG. The armed class
     carries the visible state. */
  setArmState(removerArmed);
});

/* One place that reflects the armed state onto the disc, so the click handler and
   the view reset cannot disagree about label or class. */
function setArmState(armed) {
  armBtn.classList.toggle('armed', armed);
  const label = armed ? 'Disarm picker' : 'Arm picker';
  armBtn.title = label;
  armBtn.setAttribute('aria-label', label);
}

/* "Nuke overlays": the kill-sticky trick, run once in the active tab. Hides every
   fixed/sticky element and restores scrolling (a modal locks the page BOTH with a
   fixed overlay AND overflow:hidden on the scroller, so we must undo both). This
   is a one-shot unstick, not a saved rule — it's the escape hatch for overlays a
   selector can't cleanly target. Runs from this (Vivaldi) extension via scripting. */
function killStickyInPage() {
  var all = document.querySelectorAll('body *');
  for (var i = 0; i < all.length; i++) {
    var el = all[i], cs = getComputedStyle(el);
    if (cs.position === 'fixed' || cs.position === 'sticky') el.style.setProperty('display', 'none', 'important');
    if (cs.overflow === 'hidden' || cs.overflowY === 'hidden') el.style.setProperty('overflow', 'visible', 'important');
  }
  document.documentElement.style.setProperty('overflow', 'auto', 'important');
  document.body.style.setProperty('overflow', 'auto', 'important');
}
const nukeBtn = document.getElementById('nukeOverlays');
if (nukeBtn) nukeBtn.addEventListener('click', () => {
  if (!currentTabId || !chrome.scripting || !chrome.scripting.executeScript) return;
  chrome.scripting.executeScript({ target: { tabId: currentTabId }, func: killStickyInPage }).catch(() => {});
});

async function loadRemoverView() {
  currentTabId = null;
  currentHost = null;
  removerArmed = false;
  setArmState(false);
  /* The header carries the HOST, the way a session's name takes over Saved
     Tabs' header: the title answers "rules for what". 'Remover' is the fallback
     for the states where there is no site to name. */
  removerTitle.textContent = 'Remover';

  let tab;
  try {
    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  } catch (_) { /* no permission or no tab */ }

  if (!tab || !tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
    /* Same posture as Choose tabs at zero: say why, disable the action. */
    armBtn.disabled = true;
    renderRules([], 'No accessible tab');
    return;
  }

  armBtn.disabled = false;
  try {
    currentHost = new URL(tab.url).hostname;
    currentTabId = tab.id;
  } catch (_) {
    armBtn.disabled = true;
    renderRules([], 'Unknown site');
    return;
  }

  removerTitle.textContent = currentHost;

  // Sync arm state with background (per-tab). setArmState, NOT textContent — the
  // arm button is an icon disc, so writing text would wipe its SVG (that was the
  // "icon missing / stuck on 'Arm picker'" bug).
  try {
    const res = await chrome.runtime.sendMessage({ action: 'getRemoverState', tabId: currentTabId });
    removerArmed = res && res.state === 'ON';
    setArmState(removerArmed);
  } catch (_) { /* SW asleep: leave disarmed */ }

  const result = await chrome.storage.local.get('rhe_rules');
  const allRules = result.rhe_rules || {};
  renderRules(allRules[currentHost] || []);
}

function renderRules(rules, emptyText) {
  rulesList.replaceChildren();
  /* R-038 shortened the R-037 paragraph back to a line: the glyph carries the
     mood, the hint keeps the one thing worth teaching (what arming does). Error
     states pass their own line and earn no hint, since arming is disabled. */
  if (emptyText) fillEmptyState(removerEmpty, Icons.eraser, emptyText);
  else fillEmptyState(removerEmpty, Icons.eraser, 'No rules for this site yet',
    'Arm the picker, then click parts of the page to hide them');
  removerEmpty.hidden = rules.length > 0;

  rules.forEach((rule, idx) => {
    const r = readRule(rule);
    const row = el('button', 'settings-row');
    row.type = 'button';

    const text = el('span', 'settings-row-text');
    /* NAMED BY THE TARGET, not the path. The stored selector opens with the
       ancestor id, so left-truncated titles made every rule on one feed item
       read identically. The tooltip keeps the whole path. */
    const title = el('span', 'settings-row-title sp-mono-title', ruleName(r.selector));
    title.title = r.selector;
    text.appendChild(title);
    text.appendChild(el('span', 'settings-row-value', ruleLabel(r)));
    row.appendChild(text);
    row.appendChild(el('span', 'sp-row-btn', '⋯'));

    row.addEventListener('click', () => openRuleMenu(r, idx));
    rulesList.appendChild(row);
  });
}

/* SCOPE is a storage edit the panel owns: the content script applies it at load
   time by comparing r.path against the page. BROAD is different in kind, and the
   menu keeps that difference honest: it REWRITES the stored selector, and only
   the page can do that, because the rewrite reads the live element from the
   page's archive of removed items. Known limit, unchanged from the old
   checkboxes: after a reload that archive is empty and the rewrite does not
   land. */
async function setRuleScope(idx, specific) {
  const allRules = (await chrome.storage.local.get('rhe_rules')).rhe_rules || {};
  const hostRules = allRules[currentHost] || [];
  const prev = hostRules[idx];
  if (prev === undefined) return;
  hostRules[idx] = typeof prev === 'string'
    ? { selector: prev, specific, broad: false, path: null }
    : { ...prev, specific };
  allRules[currentHost] = hostRules;
  await chrome.storage.local.set({ rhe_rules: allRules });
}

function openRuleMenu(r, idx) {
  openPanelDialog({
    /* The NAME, never the raw path: a page-generated selector ran twelve lines
       and became the whole dialog (R-037). Page-derived text is hostile and
       gets a ceiling before it enters a fixed-size component. */
    title: ruleName(r.selector),
    subtitle: 'Where this rule applies',
    rows: [
      { mark: !r.specific, label: 'Whole site', onPick: () => setRuleScope(idx, false) },
      { mark: r.specific, label: 'This page only', onPick: () => setRuleScope(idx, true) },
      /* Independent of the scope pair: its tick means ON, not "the choice". */
      {
        mark: r.broad, label: 'Broad match',
        onPick: () => {
          if (!currentTabId) return;
          chrome.tabs.sendMessage(currentTabId, {
            method: 'toggleBroad',
            data: { oldSelector: r.selector, isBroad: !r.broad, isSpecific: r.specific },
            path: 'background-to-page',
          });
        },
      },
      {
        danger: true, icon: Icons.delete, label: 'Delete rule',
        confirmLabel: 'Delete, are you sure?',
        onPick: () => deleteRule(idx),
      },
    ],
  });
}

async function deleteRule(idx) {
  const result = await chrome.storage.local.get('rhe_rules');
  const allRules = result.rhe_rules || {};
  const hostRules = (allRules[currentHost] || []).slice();
  hostRules.splice(idx, 1);
  if (hostRules.length === 0) delete allRules[currentHost];
  else allRules[currentHost] = hostRules;
  await chrome.storage.local.set({ rhe_rules: allRules });
  renderRules(allRules[currentHost] || []);
}


// ─── Notes ────────────────────────────────────────────────────────────────────
//
// R-022: rebuilt on the SHARED panel vocabulary in styles/panel.css. The first
// version invented .sp-row / .sp-btn / .sp-list / .sp-textarea beside PasteKit's
// equivalents, so notes sat on bare canvas and the Save and Delete buttons
// rendered browser-default, which is exactly what the comment on .actions said
// would happen to any button group not wired into it. Spec 006: migrated off the card language with everything else. One header
// whose title swaps, a list page and an editor page, and the row menu as a
// picker. Notes was the last sliding card in the panel.
//
// Notes live in the BOOKMARKS database, in the `notes` store v6 created and then
// left vestigial. Reusing it means resetService already clears them, and it keeps
// them out of the pastekit database whose whole-store lock gates snippets: a note
// is not a secret and must not be unreachable because snippets are locked.

const notesList   = document.getElementById('notesList');
const noteSearch  = document.getElementById('noteSearch');
const notesTitle      = document.getElementById('notesTitle');
const notesBar        = document.getElementById('notesBar');
const notesListPage   = document.getElementById('notesListPage');
const notesEditorPage = document.getElementById('notesEditorPage');
const noteActions     = document.getElementById('noteActions');
const noteListActions = document.getElementById('noteListActions');
const notesFoot       = document.getElementById('notesFoot');
const noteTitle   = document.getElementById('noteTitle');
const noteBody    = document.getElementById('noteBody');

/* THERE IS NO `editingNote` ANY MORE. It used to hold the note's text between
   opening the editor and pressing Save, because the fields were the draft and
   the database only heard about it at the end. Autosave inverts that: the
   session below owns the note, the fields are just the view of it, and a second
   copy of the text sitting in module scope would be a source of truth that
   nothing updates. Whether the editor is open is noteSession.isOpen.
 *
 * Notes autosave (R-034). The session debounces writes, mints the id on the
 * first one, and knows how to put the note back the way it was. */
const noteSession = createNoteSession(BookmarkDB);

async function renderNotes() {
  const query = (noteSearch.value || '').trim().toLowerCase();
  const all = await BookmarkDB.listNotes();
  const notes = query
    ? all.filter(n => (n.title || '').toLowerCase().includes(query)
                   || (n.body  || '').toLowerCase().includes(query))
    : all;

  notesList.replaceChildren();

  if (notes.length === 0) {
    /* A search that found nothing shows the SEARCH glyph, not the view's own:
       the state is about the query, and clearing it brings the notes back. */
    notesList.appendChild(query
      ? emptyState(Icons.search, 'No matching notes')
      : emptyState(Icons.pencil, 'No notes yet'));
    return;
  }

  for (const note of notes) {
    notesList.appendChild(noteRow(note));
  }
}

function noteRow(note) {
  const row = document.createElement('div');
  row.className = 'settings-row';

  const text = document.createElement('span');
  text.className = 'settings-row-text';

  const nm = document.createElement('span');
  nm.className = 'settings-row-title';
  /* Untitled notes are normal: the body is the point and the title is a
     convenience, so the row falls back to the first non-empty line rather than
     showing a row the user cannot identify. */
  nm.textContent = (note.title || '').trim() || firstLine(note.body) || 'Untitled note';

  const ds = document.createElement('span');
  ds.className = 'settings-row-value';
  /* A CLOCK TIME is right here, unlike on a saved session: this line answers
     "when did I last touch this", and the title above already says which note
     it is. formatWhen stays for exactly this. */
  ds.textContent = firstLine(note.body) || formatWhen(note.updatedAt);

  text.append(nm, ds);
  row.appendChild(text);

  const more = document.createElement('button');
  more.className = 'sp-row-btn';
  more.textContent = '\u22EF';
  more.title = 'Edit / delete';
  more.addEventListener('click', (e) => { e.stopPropagation(); noteMenu(note); });
  row.appendChild(more);

  row.addEventListener('click', () => openNoteEditor(note));
  row.addEventListener('contextmenu', (e) => { e.preventDefault(); noteMenu(note); });
  return row;
}

/* The note's own menu, the picker (R-029). Delete arms in place here rather than
   sitting in the editor foot beside Save, which is where it used to be. */
function noteMenu(note) {
  openPanelDialog({
    title: (note.title || '').trim() || firstLine(note.body) || 'Untitled note',
    rows: [
      { icon: Icons.edit, label: 'Edit', onPick: () => openNoteEditor(note) },
      {
        icon: Icons.delete, label: 'Delete', danger: true,
        onPick: async () => {
          if (note.id) await BookmarkDB.deleteNote(note.id);
          await renderNotes();
        },
      },
    ],
  });
}

function firstLine(body) {
  return (body || '').split('\n').find(line => line.trim()) || '';
}

/* A DAY, never a clock time. formatWhen below returns "3:38 AM" for anything
   saved today, which is right under a note (it answers "when did I touch this")
   and wrong as a session's own line, where it read as the session's NAME. Kept
   separate rather than changed, because notes still want the time. */
function formatDay(ts) {
  if (!ts) return '';
  const date = new Date(ts);
  const midnight = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((midnight(new Date()) - midnight(date)) / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function formatWhen(ts) {
  if (!ts) return '';
  const date = new Date(ts);
  const sameDay = date.toDateString() === new Date().toDateString();
  return sameDay
    ? date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

/* Pages, not a slide. createSlidingCard and its whole contract (the .editing
   toggle, the constant-height foot swap, focus timing past the transition, the
   scrollLeft reset) retired with the card language: a page swap has none of
   those hazards, so the helper that existed to survive them has nothing left to
   protect. */
function openNoteEditor(note) {
  const opening = note || { id: null, title: '', body: '' };
  noteTitle.value = opening.title || '';
  noteBody.value = opening.body || '';
  noteSession.open(note || null);

  /* Fixed at OPEN time and never re-read. A new note gains an id on its first
     autosave, and a header that flipped from "New note" to "Edit note" halfway
     through the first sentence would be reporting an implementation detail. */
  notesTitle.textContent = opening.id ? 'Edit note' : 'New note';
  showNotesPage('editor');
  noteListActions.classList.add('hidden');
  noteActions.classList.remove('hidden');
  /* No focus timer: the old 300ms wait existed because focusing mid-slide made
     the card scroll sideways. Pages fade, so focus can happen immediately. */
  try { noteTitle.focus(); } catch (_) { /* page swapped again already */ }
}

/* TEARDOWN ONLY. It does not decide the note's fate any more: commit and revert
   do that, and both call this afterwards. Keeping a write in here would mean two
   callers disagreeing about what closing means. */
function closeNoteEditor() {
  notesTitle.textContent = 'Notes';
  showNotesPage('list');
  noteListActions.classList.remove('hidden');
  noteActions.classList.add('hidden');
}

function showNotesPage(which) {
  notesListPage.hidden = which !== 'list';
  notesEditorPage.hidden = which !== 'editor';
  /* Search filters the LIST, so it leaves with it. */
  notesBar.hidden = which !== 'list';
  /* New note is a disc by the search bar now, so the list page owns no footer;
     the foot exists only for the editor's Cancel/Save (R-040). */
  notesFoot.hidden = which !== 'editor';
}

noteSearch.addEventListener('input', () => renderNotes());
document.getElementById('noteNewBtn').addEventListener('click', () => openNoteEditor(null));

/* TYPING IS SAVING. Both fields feed the same session, so the debounce covers
   the pair rather than each field having its own. No renderNotes here: the list
   page is hidden while the editor is up, so redrawing it per phrase would be
   work nobody can see. */
noteTitle.addEventListener('input', queueNoteAutosave);
noteBody.addEventListener('input', queueNoteAutosave);
function queueNoteAutosave() {
  noteSession.change(noteTitle.value, noteBody.value);
}

/* Leaving a field is a natural commit point and costs nothing when the debounce
   has already fired. It is what makes "type, click away, close the panel" safe
   without relying on teardown events landing an async write. */
noteTitle.addEventListener('blur', () => noteSession.flush());
noteBody.addEventListener('blur', () => noteSession.flush());

/* Last resort for the panel being dismissed mid-sentence. Best effort by
   nature: the write may not finish before the page goes. It is a backstop for
   the debounce window, not the mechanism. */
document.addEventListener('visibilitychange', () => {
  if (document.hidden) noteSession.flush();
});
window.addEventListener('pagehide', () => noteSession.flush());

/* CANCEL IS A REVERT NOW, and it undoes more than it used to. The text is
   already in the database, so closing cannot discard it; this puts the note back
   to what it said when the editor OPENED, or deletes it if it was new. */
document.getElementById('noteCancelBtn').addEventListener('click', async () => {
  const done = noteSession.revert();
  closeNoteEditor();
  await done;
  await renderNotes();
});

/* Save closes. It is no longer the thing that commits, because every word
   already did; it lands a pending debounce and leaves. Kept as a button because
   "I am finished" is still a thing people want to say, and because a screen with
   only Cancel on it reads as if there were nothing to keep. */
document.getElementById('noteSaveBtn').addEventListener('click', () => commitNoteEditor());

async function commitNoteEditor() {
  if (!noteSession.isOpen) { closeNoteEditor(); return; }
  const done = noteSession.commit();
  closeNoteEditor();
  await done;
  await renderNotes();
}

/* Deleting lives in the row's menu now (noteMenu), so the editor foot holds
   Cancel and Save only and no destructive button sits next to Save. */

/* ─── Scroll affordance (R-010) ───────────────────────────────────────────────
   base.css hides scrollbars across the whole extension, so every scroll region
   owes the fade-plus-count substitute. The new tab adopted it in five places;
   the panel had adopted it NOWHERE, so a long list simply cut off dead with
   nothing saying more exists. Each pane hosts its own affordance (pane-host /
   pane-scroll in the markup), so the fades slide with the pane instead of an
   off-screen pane painting its fades over the visible one.

   Attached once: re-renders go through replaceChildren and are caught by the
   affordance's own MutationObserver; a pane becoming visible is caught by its
   ResizeObserver on first reveal. The editor panes for notes and PasteKit hold
   fixed-height fields, not lists, so they are deliberately not adopters. */
/* R-010 applies to EVERY scroll region, not just the lists: base.css hides
   scrollbars globally, so a form that runs past the fold is exactly as mute as a
   list that does. The editor and settings pages were missed in spec 005 and the
   new structural check found them, so they count their own units: fields for the
   editor, rows and section labels for settings. */
const SCROLLERS = [
  ['list', '.settings-row'],              // PasteKit snippets
  ['notesList', '.settings-row'],
  ['notesEditorScroll', 'label'],
  ['savedTabsList', '.settings-row'],
  ['tabsDetailScroll', '.settings-row'],  // a session's tabs
  ['tabsChooseScroll', '.settings-row'],  // the open tabs, spec 007
  ['removerScroll', '.settings-row'],     // remover rules, spec 008
  ['pkEditorScroll', 'label, details'],   // the snippet form
  ['pkSettingsScroll', '.settings-row, .sp-sect'],
];
for (const [id, items] of SCROLLERS) {
  const scroller = document.getElementById(id);
  if (!scroller) continue;
  /* The host must be the scroller's OWN wrapper. Falling back to the nearest
     page was how PasteKit's fades ended up above its search bar: that page holds
     the bar and the tag row as well, so the host box started far above the list.
     Throwing beats guessing, since the wrong host looks like a styling accident
     rather than a missing element. */
  const host = scroller.closest('.pane-host, .sp-scrollhost');
  if (!host) {
    throw new Error(
      `scroll affordance: #${scroller.id} has no .sp-scrollhost or .pane-host parent. ` +
      'Wrap the scroller in one; a host that holds anything else paints the fades ' +
      'over its siblings.');
  }
  attachScrollAffordance(scroller, { host, items });
}

// ─── Saved tabs (spec 004: the final shape) ──────────────────────────────────
//
// One header whose title swaps; sessions named by description or date, never
// numbered; opening only via the visible pill; picker dialogs via panelDialog;
// the description feature deleted (Rename in the session menu writes through
// setGroupDescription instead). The open-confirm threshold left with the row
// click that justified it: a click can no longer open anything by accident,
// and the pill names its count before you press it.

const savedTabsList     = document.getElementById('savedTabsList');
const tabsSearch        = document.getElementById('tabsSearch');
const tabsBar           = document.getElementById('tabsBar');
const tabsFoot          = document.getElementById('tabsFoot');
const tabsTitle         = document.getElementById('tabsTitle');
const tabsListPage      = document.getElementById('tabsListPage');
const tabsDetailPage    = document.getElementById('tabsDetailPage');
const tabsDetailBody    = document.getElementById('tabsDetailBody');
const tabsListActions   = document.getElementById('tabsListActions');
const tabsDetailActions = document.getElementById('tabsDetailActions');
const tabsChoosePage    = document.getElementById('tabsChoosePage');
const tabsChooseScroll  = document.getElementById('tabsChooseScroll');
const tabsChooseActions = document.getElementById('tabsChooseActions');
const tabsSelectToggle  = document.getElementById('tabsSelectToggleBtn');
const tabsChooseSave    = document.getElementById('tabsChooseSaveBtn');

/* The session the details page is showing; also what "Open all tabs" opens. */
let detailGroup = null;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

/* A session's name IS its description; unnamed, it is the day it was saved.
   "Session N" numbering is gone: a number said nothing about what was inside. */
/* A session's name is what YOU called it; unnamed, it is its stored number.
   It used to fall back to formatWhen, which for anything saved today produced a
   bare clock time as the title ("3:38 AM"), a fine answer to "when" and a
   useless answer to "which one". The number is stable: it is stored at creation,
   so deleting an older session never renumbers this one. */
function sessionName(group) {
  return group.description || `Save ${group.seq || '?'}`;
}

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

/* Opens what a session held, in the background so the panel keeps its place.
   The tab limiter may close some again if the count goes over your limit; the
   saver catches those into today's automatic session rather than losing them. */
function openGroupTabs(group) {
  for (const entry of group.tabs) chrome.tabs.create({ url: entry.url, active: false });
}

/* ── dialogs ───────────────────────────────────────────────────────────────── */

function sessionMenu(group) {
  openPanelDialog({
    /* No subtitle: the date-and-count line was reviewed and disliked, and the
       row already shows both. */
    title: sessionName(group),
    rows: [
      {
        icon: Icons.edit, label: 'Rename',
        input: {
          value: group.description || '',
          onSave: async (value) => {
            await setGroupDescription(group.id, value.trim());
            if (detailGroup && detailGroup.id === group.id) {
              detailGroup = { ...detailGroup, description: value.trim() };
              tabsTitle.textContent = sessionName(detailGroup);
            }
            await renderSavedTabs();
          },
        },
      },
      {
        icon: Icons.delete, label: 'Delete', danger: true,
        onPick: async () => {
          await removeSavedGroup(group.id);
          if (detailGroup && detailGroup.id === group.id) showTabsListPage();
          await renderSavedTabs();
        },
      },
    ],
  });
}

/* The bookmark menu, verbatim: Rename and Change address as separate
   single-field panes rather than one big edit form, then the armed delete.
   updateSavedTab returns { error } with the reason a value was refused, which
   is exactly the string contract the input pane's onSave expects. */
function tabMenu(group, entry) {
  openPanelDialog({
    title: entry.title || entry.url,
    subtitle: entry.url,
    rows: [
      {
        icon: Icons.edit, label: 'Rename',
        input: {
          value: entry.title || '',
          onSave: async (value) => {
            const result = await updateSavedTab(group.id, entry.url, {
              title: value, url: entry.url,
            });
            if (result.error) return result.error;
            await refreshSessionDetail();
          },
        },
      },
      {
        icon: Icons.link, label: 'Change address',
        input: {
          value: entry.url,
          onSave: async (value) => {
            const result = await updateSavedTab(group.id, entry.url, {
              title: entry.title, url: value,
            });
            if (result.error) return result.error;
            await refreshSessionDetail();
          },
        },
      },
      {
        icon: Icons.delete, label: 'Delete', danger: true,
        onPick: async () => {
          await removeSavedTab(group.id, entry.url);
          await refreshSessionDetail();
        },
      },
    ],
  });
}

/* ── rows ──────────────────────────────────────────────────────────────────── */

function sessionRow(group) {
  /* A div, not a button: it contains the pill and the menu button, and buttons
     cannot nest. */
  const row = el('div', 'settings-row');
  const text = el('span', 'settings-row-text');
  const count = group.tabs.length;
  text.append(
    el('span', 'settings-row-title', sessionName(group)),
    /* Day and count together: the title already carries identity, so this line
       is free to answer both "when" and "how big" at a glance. */
    el('span', 'settings-row-value',
      `${formatDay(group.savedAt)} · ${count} ${count === 1 ? 'tab' : 'tabs'}`),
  );

  /* THE ONLY WAY TO OPEN: always visible, names its count, sits beside the
     menu button. The pill carries the number, so there is no badge. */
  const open = el('button', 'sp-open-pill', `Open ${group.tabs.length}`);
  open.addEventListener('click', (e) => { e.stopPropagation(); openGroupTabs(group); });

  const more = el('button', 'sp-row-btn', '\u22EF');
  more.title = 'Rename / delete';
  more.addEventListener('click', (e) => { e.stopPropagation(); sessionMenu(group); });

  row.append(text, open, more);
  /* Row click NAVIGATES, the safe act. Opening is never a side effect. */
  row.addEventListener('click', () => openSessionDetail(group));
  row.addEventListener('contextmenu', (e) => { e.preventDefault(); sessionMenu(group); });
  return row;
}

function tabRow(group, entry) {
  const row = el('div', 'settings-row');
  row.title = entry.url;
  const text = el('span', 'settings-row-text');
  text.append(
    el('span', 'settings-row-title', entry.title || entry.url),
    el('span', 'settings-row-value', hostOf(entry.url)),
  );
  const more = el('button', 'sp-row-btn', '\u22EF');
  more.title = 'Rename / edit / delete';
  more.addEventListener('click', (e) => { e.stopPropagation(); tabMenu(group, entry); });
  row.append(text, more);
  /* One tab is one click: opening a single, named page is the row's job, the
     same way clicking a bookmark opens it. */
  row.addEventListener('click', () => chrome.tabs.create({ url: entry.url }));
  row.addEventListener('contextmenu', (e) => { e.preventDefault(); tabMenu(group, entry); });
  return row;
}

/* ── the list page ─────────────────────────────────────────────────────────── */

async function renderSavedTabs() {
  const query = (tabsSearch.value || '').trim();
  const all = await listSavedGroups();
  const groups = all.filter(g => groupMatches(g, query));
  savedTabsList.replaceChildren();

  if (groups.length === 0) {
    savedTabsList.appendChild(query
      ? emptyState(Icons.search, 'No matching tabs')
      : emptyState(Icons.tabs, 'Nothing saved yet'));
    return;
  }
  for (const group of groups) savedTabsList.appendChild(sessionRow(group));
}

/* ── pages: one header, title swaps, back walks up ─────────────────────────── */

/* THREE pages now (spec 007), so the swap is a single function that names the
   one it wants rather than each caller hiding the other two. The old pair of
   functions each toggled exactly one sibling, which is correct for two pages and
   silently wrong for three: adding Choose tabs that way would have left the list
   visible underneath it. Same shape as showNotesPage. */
function showTabsPage(which) {
  tabsListPage.hidden   = which !== 'list';
  tabsDetailPage.hidden = which !== 'detail';
  tabsChoosePage.hidden = which !== 'choose';
  /* The search bar filters the SESSION LIST, so it leaves with it rather than
     sitting there searching something invisible. */
  tabsBar.hidden = which !== 'list';
  tabsListActions.classList.toggle('hidden', which !== 'list');
  tabsDetailActions.classList.toggle('hidden', which !== 'detail');
  tabsChooseActions.classList.toggle('hidden', which !== 'choose');
  /* Save-and-close is a disc by the search bar now, so the list page has no
     footer; the foot shows only for the detail and choose pages (R-040). */
  tabsFoot.hidden = which === 'list';
}

function showTabsListPage() {
  detailGroup = null;
  tabsTitle.textContent = 'Saved tabs';
  showTabsPage('list');
}

function openSessionDetail(group) {
  detailGroup = group;
  tabsTitle.textContent = sessionName(group);
  tabsDetailBody.replaceChildren();
  for (const entry of group.tabs) tabsDetailBody.appendChild(tabRow(group, entry));
  showTabsPage('detail');
}

/* Repaints the open session from FRESH storage after something inside changes.
   Removing the last tab deletes the session (pruneEmptyGroups): fall back to
   the list rather than sit on a page for something that no longer exists. */
async function refreshSessionDetail() {
  if (!detailGroup) { await renderSavedTabs(); return; }
  const fresh = (await listSavedGroups()).find(g => g.id === detailGroup.id);
  if (!fresh || fresh.tabs.length === 0) {
    showTabsListPage();
    await renderSavedTabs();
    return;
  }
  detailGroup = fresh;
  tabsTitle.textContent = sessionName(fresh);
  tabsDetailBody.replaceChildren();
  for (const entry of fresh.tabs) tabsDetailBody.appendChild(tabRow(fresh, entry));
  await renderSavedTabs();
}

/* ── wiring ────────────────────────────────────────────────────────────────── */

/* Deliberately unconfirmed: being on this page means you chose this session. */
document.getElementById('tabsOpenAllBtn').addEventListener('click', () => {
  if (detailGroup) openGroupTabs(detailGroup);
});

tabsSearch.addEventListener('input', () => renderSavedTabs());

/* ── Choose tabs (spec 007) ──────────────────────────────────────────────────
 *
 * The foot button OPENS this page rather than acting, so a bulk close is never
 * unpreviewable. Everything is ticked on arrival, which makes pressing straight
 * through identical to the old save-everything button.
 */

/* The candidates as listed, and the ids currently ticked. Held together because
   the count, both button labels and the save all read from the same pair; a
   count derived separately is how a footer starts disagreeing with its list. */
let chooseCandidates = [];
let chooseSelected = new Set();

function chooseRow(candidate) {
  const row = el('button', 'settings-row');
  row.type = 'button';
  if (chooseSelected.has(candidate.id)) row.classList.add('is-checked');

  const text = el('span', 'settings-row-text');
  text.appendChild(el('span', 'settings-row-title', candidate.title));

  /* The value line says WHY a row starts unticked, because an unticked row in a
     list of ticked ones is otherwise just unexplained. Ordinary tabs get their
     host, which is the useful thing when two tabs share a title. */
  const host = (() => {
    try { return new URL(candidate.url).hostname.replace(/^www\./, ''); }
    catch (_) { return candidate.url; }
  })();
  const label = candidate.isCurrent ? `Current tab · ${host}`
              : candidate.pinned    ? `Pinned · ${host}`
              : host;
  text.appendChild(el('span', 'settings-row-value', label));

  row.appendChild(text);
  row.appendChild(el('span', 'picker-check'));

  row.addEventListener('click', () => {
    if (chooseSelected.has(candidate.id)) chooseSelected.delete(candidate.id);
    else chooseSelected.add(candidate.id);
    row.classList.toggle('is-checked', chooseSelected.has(candidate.id));
    syncChooseFoot();
  });
  return row;
}

/* Both labels and the disabled state, from the one selection. */
function syncChooseFoot() {
  const n = chooseSelected.size;
  /* No "(0)": a count of nothing is noise, and the disabled button already says
     there is nothing to do. Leaving with nothing ticked saves and closes
     nothing, which is what makes the back arrow a working cancel. */
  tabsChooseSave.textContent = n ? `Save and close (${n})` : 'Save and close';
  tabsChooseSave.disabled = n === 0;
  /* Flips rather than sitting as a pair where one half is always dead. */
  tabsSelectToggle.textContent = n === chooseCandidates.length && n > 0
    ? 'Select none' : 'Select all';
}

async function openChooseTabs() {
  chooseCandidates = await listOpenTabCandidates();
  chooseSelected = new Set(defaultSelection(chooseCandidates));

  tabsChooseScroll.replaceChildren();
  if (chooseCandidates.length === 0) {
    /* Every open tab is a new tab page or a browser page, so there is nothing to
       save. Saying so beats an empty box with a dead button under it. */
    tabsChooseScroll.appendChild(emptyState(Icons.list, 'No open tabs to save'));
  } else {
    for (const c of chooseCandidates) tabsChooseScroll.appendChild(chooseRow(c));
  }

  tabsTitle.textContent = 'Choose tabs';
  showTabsPage('choose');
  syncChooseFoot();
}

document.getElementById('tabsSaveAllBtn').addEventListener('click', openChooseTabs);

tabsSelectToggle.addEventListener('click', () => {
  const all = chooseSelected.size === chooseCandidates.length && chooseCandidates.length > 0;
  chooseSelected = all ? new Set() : new Set(chooseCandidates.map(c => c.id));
  for (const row of tabsChooseScroll.querySelectorAll('.settings-row')) {
    row.classList.toggle('is-checked', !all);
  }
  syncChooseFoot();
});

/* No prompt afterwards: the description feature is gone. The new session appears
   in the list named by its date; naming it is Rename in its menu. */
tabsChooseSave.addEventListener('click', async () => {
  if (chooseSelected.size === 0) return;
  await saveAndCloseSelected([...chooseSelected]);
  showTabsListPage();
  await renderSavedTabs();
});
