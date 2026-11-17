import { renderEngineListInModal } from '../../components/engines/engines-modal.js';

export async function showModal(modalId) {
  /* No "add-modal" branch: the add popup (components/add-popup) builds itself
     and is not a registered modal id. Settings is a page (settings/shell.js). */
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

/** The visible top modal: highest z-index, then latest DOM order. */
function topmostOpenModal() {
  let best = null;
  let bestZ = -Infinity;
  for (const modal of document.querySelectorAll('.modal.show')) {
    const z = parseInt(getComputedStyle(modal).zIndex, 10) || 0;
    if (z >= bestZ) { bestZ = z; best = modal; } // >= so a later sibling wins a tie
  }
  return best;
}

/** Click the modal's own close control so subpages can step back and dialogs can clean up. */
function dismissModal(modal) {
  if (!modal) return;
  const closeBtn = modal.querySelector('.close-btn');
  if (closeBtn) closeBtn.click();
  else modal.classList.remove('show');
}

/** Escape uses the top modal's own close control; the password prompt handles Escape itself. */
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
      // Ignore clicks inside the panel; only a click on the full-screen backdrop closes it.
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
