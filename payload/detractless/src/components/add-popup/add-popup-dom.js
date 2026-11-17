/* ═══════════════════════════════════════════════════════
   THE ADD POPUP — DOM HELPERS

   The overlay lookup and error-slot writes every other part of the popup
   needs. Kept apart so the screens and the wiring can both use them
   without either owning the other.
   ═══════════════════════════════════════════════════════ */

export function close(popup) {
  popup.overlay.remove();
}

export const $ = (popup, sel) => popup.overlay.querySelector(sel);
export const field = (popup, name) => $(popup, `[data-field="${name}"]`);

export function showError(popup, name, message) {
  const slot = $(popup, `[data-error-for="${name}"]`);
  if (slot) slot.textContent = message || '';
}

export function clearErrors(popup) {
  popup.overlay.querySelectorAll('[data-error-for]').forEach((s) => { s.textContent = ''; });
}
