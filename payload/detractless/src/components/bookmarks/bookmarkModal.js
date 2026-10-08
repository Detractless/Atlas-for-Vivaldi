/* ══════════════════════════════════════════════════════════════════════
   THE ADD MENU (R-021) AND THE SEQUENTIAL ADD FLOW

   R-021 settled two things about this surface at once.

   THE MENU IS CENTRED NOW, not anchored under the + disc. R-016 had it hanging
   off the trigger, decided before the R-012 dialog family had spread across the
   rest of the bookmarks area; every other branch here (Rename, Edit URL, Move to
   page) is a centred card over a blurred page, and this was the one the pattern
   never reached. Its rows take verb labels, and the "N pages" tally it used to
   carry is gone: it was the only value row in the app showing a count rather
   than a chosen value.

   IT IS STILL NOT class="modal", and this is the trap R-014 documented. The
   shared dismissal in modalVisibility.js hides a modal by clicking its
   .close-btn and otherwise stripping .show, and this has neither a close button
   nor a single element to strip, so that path would leave a scrim over an
   unblurred page or a panel with no scrim. setMenuOpen owns both halves.
   Centring a dialog and delegating its dismissal are separate decisions;
   R-021 took only the first.

   THE CARD IS GONE, replaced by FOUR SMALL DIALOGS: name, url, page, group.
   The large single card was itself a replacement for a four-step wizard, and the
   history matters because this walks part of it back. What made the wizard bad
   was its step counter, which read "Step 2 of 4" over a conditional step and so
   was wrong whenever an existing group was chosen. Sequencing was never the
   problem; lying about progress was. SO THERE IS NO STEP COUNTER HERE.

   BACK AND ESCAPE BOTH WORK. Back restores the answer you already gave, which is
   why the state is a reducer in utils/addBookmarkFlow.js rather than module-level
   variables: Back means steps are revisited in arbitrary order, and that is worth
   testing. Escape cancels the whole flow.

   NOTHING IS WRITTEN UNTIL THE LAST STEP. Because Escape can cancel from
   anywhere, a per-step commit would strand a half-made bookmark, or worse a new
   group, in the database. resolveFlow returns all four values and addBookmark
   writes once.

   NO GROUP ROW IN THE MENU, deliberately, and this survives unchanged: a group
   in this data model is a key in the page's bookmarks object holding a non-empty
   array, and the delete path drops the key when its last bookmark goes
   (bookmarks.js). An empty group cannot persist, so "add a group" would create
   something that vanishes on the next render. Groups are created from inside the
   bookmark flow, which is the only moment one can exist.
   ══════════════════════════════════════════════════════════════════════ */

import { BookmarkDB } from '../../services/bookmarksDB.js';
import { addBookmark } from './bookmarks.js';
import { openListPicker, openInputPicker } from './bookmarkDialog.js';
import {
  NEW_GROUP,
  createFlowState, setValue, goNext, goBack, validateStep, resolveFlow,
} from '../../utils/addBookmarkFlow.js';
import {
  activeTabs,
  currentBookmarkPage
} from '../../pages/newtab/newtabState.js';

const byId = (id) => document.getElementById(id);
const pages = () => activeTabs.filter(t => t.type !== 'search');
const pageLabel = (id) => pages().find(t => String(t.id) === String(id))?.label || '';

/* The flow's only piece of mutable state: which walk we are currently on. Each
   step replaces it with the next immutable snapshot. */
let _flow = null;

/* Every step opens the next dialog a frame late. onePaneDialog removes any
   existing .bookmark-dialog when it opens, and a pick or a save removes its own
   dialog moments later; opening the next one in the same tick would put it in
   front of that removal and it would be torn down immediately. */
function openStep(fn) {
  requestAnimationFrame(fn);
}

/* ── The four steps ─────────────────────────────────────────────────── */

export function startAddBookmarkFlow() {
  _flow = createFlowState(currentBookmarkPage);
  stepName();
}

function stepName() {
  openInputPicker({
    /* FIELD NAMES, not task names, across all four steps (R-022). "Add bookmark"
       here with "URL" and "Page" after it named the task once and the field three
       times, so the set did not read as one flow. The row you just clicked
       already said Add bookmark. */
    title: 'Bookmark name',
    value: _flow.name,
    placeholder: 'e.g. GitHub',
    /* No `back` on the first step. There is nowhere behind it, so the foot's
       Back button keeps its leaf meaning and closes. */
    save: (raw) => {
      const next = setValue(_flow, 'name', raw);
      const error = validateStep(next, 'name');
      if (error) return error;
      _flow = goNext(next);
      openStep(stepUrl);
      return true;
    },
  });
}

function stepUrl() {
  openInputPicker({
    title: 'Bookmark URL',
    value: _flow.url,
    placeholder: 'https://example.com',
    back: () => { _flow = goBack(_flow); openStep(stepName); },
    save: (raw) => {
      const next = setValue(_flow, 'url', raw);
      const error = validateStep(next, 'url');
      if (error) return error;
      _flow = goNext(next);
      openStep(stepPage);
      return true;
    },
  });
}

function stepPage() {
  openListPicker({
    title: 'Bookmark page',
    options: pages().map(t => ({ label: t.label, value: t.id })),
    emptyText: 'There are no bookmark pages',
    back: () => { _flow = goBack(_flow); openStep(stepUrl); },
    pick: (value) => {
      /* setValue clears the group when the page changes, per R-017: the groups
         on offer belong to the page, so one carried over from a different page
         could be saved into without ever having been offered. */
      _flow = goNext(setValue(_flow, 'page', value));
      openStep(stepGroup);
    },
  });
}

async function groupsOnPage(pageId) {
  const pageBookmarks = await BookmarkDB.getBookmarks(pageId);
  return pageBookmarks ? Object.keys(pageBookmarks).sort() : [];
}

async function stepGroup() {
  const groups = await groupsOnPage(_flow.page);
  openListPicker({
    title: 'Bookmark group',
    subtitle: `on ${pageLabel(_flow.page)}`,
    options: [
      ...groups.map(name => ({ label: name, value: name })),
      { label: 'New group', value: NEW_GROUP },
    ],
    back: () => { _flow = goBack(_flow); openStep(stepPage); },
    pick: (value) => {
      if (value === NEW_GROUP) {
        _flow = setValue(_flow, 'group', NEW_GROUP);
        openStep(stepNewGroupName);
        return;
      }
      _flow = goNext(setValue(_flow, 'group', value));
      openStep(finish);
    },
  });
}

function stepNewGroupName() {
  openInputPicker({
    title: 'New group',
    value: _flow.newGroupName,
    placeholder: 'e.g. WORK',
    upper: true,
    back: () => openStep(stepGroup),
    save: async (raw) => {
      const name = raw.trim().toUpperCase();
      if (!name) return 'Give the group a name.';
      /* A "new" group that already exists on this page is just that group.
         Creating a duplicate key was impossible, so the old path quietly merged
         into it without saying so. */
      const existing = await groupsOnPage(_flow.page);
      if (existing.includes(name)) return `${name} already exists on this page.`;
      _flow = goNext(setValue(_flow, 'newGroupName', name));
      openStep(finish);
      return true;
    },
  });
}

/* ── The one write ──────────────────────────────────────────────────── */

async function finish() {
  const resolved = resolveFlow(_flow);
  if (resolved.error) {
    /* Reachable only by walking Back and blanking an earlier answer, which is
       why resolveFlow re-checks every step rather than trusting the walk. Drop
       the user back at the step that is actually wrong. */
    _flow = createFlowState(currentBookmarkPage);
    stepName();
    return;
  }
  await addBookmark(resolved);
  _flow = null;
}

/* ── The centred menu ───────────────────────────────────────────────── */

/* Both halves, always together. Split toggles are what leave a scrim over an
   unblurred page, which is the bug R-014 called out in the page nav. */
function setMenuOpen(open) {
  const panel   = byId('add-menu-panel');
  const scrim   = byId('add-menu-scrim');
  const trigger = byId('global-add-btn');
  if (!panel || !scrim) return;
  panel.hidden = !open;
  scrim.hidden = !open;
  /* No .is-open on the action bar any more. Its only job was lifting the bar's
     stacking context so an ANCHORED panel could escape it; R-021 centred the
     panel on the viewport, so there is nothing to lift. */
  trigger?.setAttribute('aria-expanded', String(open));
  if (open) {
    requestAnimationFrame(() => panel.querySelector('.picker-row')?.focus());
  }
}

const menuOpen = () => !byId('add-menu-panel')?.hidden;

function initAddMenu() {
  const trigger = byId('global-add-btn');
  const panel   = byId('add-menu-panel');
  if (!trigger || !panel) return;

  trigger.addEventListener('click', (event) => {
    event.stopPropagation();     // or the document handler below closes it again
    setMenuOpen(!menuOpen());
  });

  /* The scrim sits INSIDE #global-actions, so a contains() test alone would
     read a backdrop click as a click on the bar and keep the menu open. It is
     named as a dismissal surface explicitly, the same way the page nav does. */
  document.addEventListener('click', (event) => {
    if (!menuOpen()) return;
    const bar = byId('global-actions');
    if (event.target === byId('add-menu-scrim') || !bar?.contains(event.target)) {
      setMenuOpen(false);
    }
  });

  document.addEventListener('keydown', (event) => {
    if (!menuOpen()) return;
    if (event.key === 'Escape') {
      /* A modal wins: modalVisibility.js owns Escape while one is open, and
         consuming it here would close this menu instead of the dialog the user
         is looking at. */
      if (document.querySelector('.modal.show')) return;
      event.preventDefault();
      setMenuOpen(false);
      byId('global-add-btn')?.focus();
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const rows = Array.from(panel.querySelectorAll('.picker-row'));
    const at = rows.indexOf(document.activeElement);
    const next = rows[at + (event.key === 'ArrowDown' ? 1 : -1)];
    if (next) { event.preventDefault(); next.focus(); }
  });
}

/* ── Init ───────────────────────────────────────────────────────────── */

export function initBookmarkAddModal() {
  initAddMenu();

  /* Menu rows. Both close the menu first, so nothing is ever layered over an
     open menu, which is the rule the page nav's row handlers follow too. */
  byId('add-row-bookmark')?.addEventListener('click', () => {
    setMenuOpen(false);
    openStep(startAddBookmarkFlow);
  });

  byId('add-row-page')?.addEventListener('click', () => {
    setMenuOpen(false);
    /* Imported lazily: tabs.js imports bookmarks.js, which imports this file,
       so a top-level import here would close that cycle. */
    import('../tabs/tabs.js').then(m => m.addNewTab());
  });
}
