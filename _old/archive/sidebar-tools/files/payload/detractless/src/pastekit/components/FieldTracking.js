// src/components/FieldTracking.js — document-level pointer/focus tracking for
// the field dot: hover state (drives 'hover' dot mode), focused-field capture
// (drives 'focus' mode + the picker's insert target), and outside-click /
// Escape dismissal of the picker.

export function installFieldTracking({ host, shadow, isEditable, tracker, picker, requestPositionAll }) {
  const realTarget = (ev) => ev.composedPath ? ev.composedPath()[0] : ev.target;

  // Hover tracking via cursor proximity — no enter/leave event edge cases.
  // pointermove handles normal navigation; pointerover catches the case where
  // the cursor is already inside a field (e.g. page scrolled under a stationary cursor).
  function updateCursor(ev) {
    tracker.mouseX = ev.clientX;
    tracker.mouseY = ev.clientY;
    if (tracker.dotMode === 'hover') requestPositionAll();
  }
  document.addEventListener('pointermove', updateCursor, { capture: true, passive: true });
  document.addEventListener('pointerover', updateCursor, { capture: true, passive: true });

  // Focus tracking — drives 'focus' mode visibility + always tracks insert target.
  document.addEventListener('focusin', (ev) => {
    const t = realTarget(ev);
    if (t === host || shadow.contains(t)) return;
    if (isEditable(t)) {
      tracker.field = t;
      if (tracker.dotMode === 'focus') requestPositionAll();
    }
  }, true);

  document.addEventListener('focusout', (ev) => {
    if (tracker.dotMode !== 'focus') return;
    // Focus moved into the picker (shadow) — dot should stay visible.
    const rel = ev.relatedTarget;
    if (rel === host || shadow.contains(rel)) return;
    setTimeout(requestPositionAll, 0);
  }, true);

  // Outside click / Escape close the picker.
  document.addEventListener('pointerdown', (ev) => {
    const t = realTarget(ev);
    if (t !== host && !shadow.contains(t)) picker.close();
  }, true);

  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && picker.isOpen()) {
      ev.stopImmediatePropagation();
      picker.close();
    }
  }, true);
}
