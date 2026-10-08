import { appThemeConfig, uiScale, spotlightVisible, searchEngineBehavior, bookmarkPillBehavior, currentBookmarkPage, activeTabs, setAppThemeConfig, setUiScale } from './newtabState.js';
import { applyThemeConfig, syncThemePicker } from './theme.js';
import { applyScale } from './displayEffects.js';
import { updateLimiterUI } from '../../components/tabLimiter/tabLimiterUI.js';
import { updateDelayPendingUI } from '../../components/searchDelay/searchDelay.js';
import { renderEngineListInModal } from '../../components/engines/engineModal.js';

let _settingsSnapshotTheme = null;
let _settingsSnapshotScale = null;

export function _revertSettingsModal() {
  if (_settingsSnapshotTheme !== null) {
    setAppThemeConfig(_settingsSnapshotTheme);
    applyThemeConfig(appThemeConfig);
    try { chrome.storage.sync.set({ Theme: appThemeConfig }); } catch (err) {}
    syncThemePicker();
  }
  if (_settingsSnapshotScale !== null) {
    setUiScale(_settingsSnapshotScale);
    applyScale(uiScale);
  }
  const resetConfirmBox = document.getElementById('reset-confirm-box');
  const resetAllBtn = document.getElementById('reset-all-btn');
  if (resetConfirmBox) resetConfirmBox.style.display = 'none';
  if (resetAllBtn) resetAllBtn.style.display = '';
}

export async function showModal(modalId) {
  /* R-021: no "add-modal" branch any more. The add card is four small dialogs
     built by bookmarkModal.js, none of which is a registered modal id, so there
     is nothing here to prime. */
  if (modalId === "engine-modal") {
    renderEngineListInModal(); 
    document.dispatchEvent(new CustomEvent('engine-modal-opened'));
  }
  if (modalId === "settings-modal") {
    _settingsSnapshotTheme = appThemeConfig ? Object.assign({}, appThemeConfig) : null;
    _settingsSnapshotScale = uiScale;
    const spotlightCheckbox = document.getElementById("spotlight-checkbox"); if (spotlightCheckbox) spotlightCheckbox.checked = spotlightVisible;
    syncThemePicker();

    const behaviorRadios = document.querySelectorAll('input[name="search-behavior"]');
    behaviorRadios.forEach(radio => {
      if (radio.value === searchEngineBehavior) radio.checked = true;
    });

    const pillBehaviorRadios = document.querySelectorAll('input[name="bookmark-pill-behavior"]');
    pillBehaviorRadios.forEach(radio => {
      if (radio.value === bookmarkPillBehavior) radio.checked = true;
    });

    // Open on the home list, and let the row layer refresh its value labels.
    closeSettingsSubpage();
    document.dispatchEvent(new CustomEvent('settings-modal-opened'));
  }
  // R-011: the delay modal no longer has a current-value readout to prime.
  // updateDelayPendingUI lights the pill that holds the current value.

  const modal = document.getElementById(modalId); if (modal) modal.classList.add("show")
}

export function hideModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.remove("show");
  if (modalId === "settings-modal" && (location.hash === "#settings" || location.hash === "")) {
    try {
      history.replaceState(null, "", location.pathname + location.search);
    } catch (e) {}
  }
}

/* Settings is one scrolling phone-style page; Backup/Sync/Reset are drill-in
   sub-pages. While a sub-page is open the header title names it and the header
   disc becomes a back button (settingsModal.js wires the disc). */

export function openSettingsSubpage(name) {
  const page = document.querySelector(`.settings-subpage[data-panel="${name}"]`);
  const home = document.getElementById('settings-home');
  if (!page || !home) return;
  document.querySelectorAll('.settings-subpage').forEach(p => { p.hidden = true; });
  home.hidden = true;
  page.hidden = false;
  const title = document.getElementById('settings-title');
  if (title) title.textContent = page.dataset.subpageTitle || 'Settings';
  const closeBtn = document.getElementById('close-settings-modal');
  if (closeBtn) { closeBtn.textContent = '‹'; closeBtn.title = 'Back'; closeBtn.dataset.mode = 'back'; }
  const body = page.closest('.settings-body');
  if (body) body.scrollTop = 0;

  if (name === 'limiter') updateLimiterUI();
  if (name === 'delay') updateDelayPendingUI();
}

export function closeSettingsSubpage() {
  const home = document.getElementById('settings-home');
  if (!home) return;
  document.querySelectorAll('.settings-subpage').forEach(p => { p.hidden = true; });
  home.hidden = false;
  const title = document.getElementById('settings-title');
  if (title) title.textContent = 'Settings';
  const closeBtn = document.getElementById('close-settings-modal');
  if (closeBtn) { closeBtn.textContent = '×'; closeBtn.title = 'Close'; closeBtn.dataset.mode = 'close'; }
}

export function settingsSubpageOpen() {
  return !!document.querySelector('.settings-subpage:not([hidden])');
}

/* Kept for callers that still navigate by old tab name: sub-page names open
   their page, everything else lands on the home list. */
export function switchSettingsTab(name) {
  if (name === 'backup' || name === 'sync' || name === 'reset') openSettingsSubpage(name);
  else closeSettingsSubpage();
}

/**
 * The open modal that is visually on top.
 *
 * z-index first, DOM order as the tie-break — the same rule the browser paints by,
 * so "topmost" here always means the one the user can actually see. This matters
 * because modals genuinely stack: the dev-setup modal opens over Settings, and the
 * password prompt (`z-index: 300`) opens over that.
 */
function topmostOpenModal() {
  let best = null;
  let bestZ = -Infinity;
  for (const modal of document.querySelectorAll('.modal.show')) {
    const z = parseInt(getComputedStyle(modal).zIndex, 10) || 0;
    if (z >= bestZ) { bestZ = z; best = modal; } // >= so a later sibling wins a tie
  }
  return best;
}

/**
 * Dismiss a modal by doing EXACTLY what its own × does.
 *
 * Clicking the real button rather than hiding the element is the whole safety
 * argument. Every modal's close already carries behaviour that hiding would skip:
 * Settings reverts the theme and scale it was previewing, the password prompt
 * RESOLVES its pending promise (hiding it would strand the caller forever), and the
 * dev-setup modal clears its status line. One dismissal path, no second definition
 * of "closed" to keep in sync.
 *
 * Every modal in index.html currently has a wired `.close-btn`; the fallback is
 * there so a future one without it degrades to today's behaviour rather than
 * trapping the user.
 */
function dismissModal(modal) {
  if (!modal) return;
  const closeBtn = modal.querySelector('.close-btn');
  if (closeBtn) closeBtn.click();
  else modal.classList.remove('show');
}

/**
 * Escape presses the topmost modal's own close control; a click on the backdrop
 * closes most of them.
 *
 * ESCAPE IS UNIVERSAL — it is a deliberate keystroke, so losing a half-typed form to
 * it is the user's own choice, exactly as pressing × would be. The password prompt is
 * skipped only because it already runs its own document-level Escape handler; letting
 * both fire would work (closePrompt is idempotent) but leaves two owners of one
 * behaviour.
 *
 * ESCAPE IS NOT "CLOSE THE MODAL", it is "click .close-btn", and on a drilled-in
 * subpage those differ. This file used to claim the former while dismissModal below
 * has always done the latter. The behaviour is the one worth keeping and the sentence
 * was the error: a modal showing a subpage has swapped its close disc for a back
 * chevron (subpageNav.js), so Escape steps back one level and a second press leaves.
 * Escape doing something OTHER than the button it visibly presses would be the real
 * defect, and it would also silently discard a subpage's form on the first keystroke.
 *
 * BACKDROP IS OPT-OUT. A stray click beside a dialog is not an intention, so any
 * modal holding text the user cannot easily retype carries
 * `data-no-backdrop-close`. That covers the bookmark and engine editors. Settings
 * deliberately DOES close: its × reverts, so there is nothing to lose.
 */
function initModalDismissal() {
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    const modal = topmostOpenModal();
    if (!modal) return;
    event.preventDefault();
    dismissModal(modal);
  });

  document.querySelectorAll('.modal').forEach((modal) => {
    if (modal.hasAttribute('data-no-backdrop-close')) return;
    modal.addEventListener('click', (event) => {
      // Only the backdrop itself. `.modal` is the full-screen overlay and the panel
      // is its child, so without this every click inside the dialog would close it.
      if (event.target !== modal) return;
      dismissModal(modal);
    });
  });
}

function initModalBehaviour() {
  initModalDismissal();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initModalBehaviour);
} else {
  initModalBehaviour();
}
