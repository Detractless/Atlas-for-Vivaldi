import { renderEngineListInModal } from '../../components/engines/engineModal.js';

export async function showModal(modalId) {
  /* R-021: no "add-modal" branch any more. The add card is four small dialogs
     built by bookmarkModal.js, none of which is a registered modal id, so there
     is nothing here to prime. Settings is a page now (settings/shell.js). */
  if (modalId === "engine-modal") {
    renderEngineListInModal();
    document.dispatchEvent(new CustomEvent('engine-modal-opened'));
  }
  const modal = document.getElementById(modalId); if (modal) modal.classList.add("show");
}

export function hideModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.remove("show");
}

/**
 * The open modal that is visually on top.
 *
 * z-index first, DOM order as the tie-break — the same rule the browser paints by,
 * so "topmost" here always means the one the user can actually see. This matters
 * because modals can stack (a picker dialog over the engine editor).
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
 * a subpage's × steps back one level instead of closing (subpageNav.js), and a
 * dialog's own close may tidy up state that hiding alone would leave behind. One dismissal path, no second definition
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
 * `data-no-backdrop-close`. That covers the bookmark and engine editors.
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
