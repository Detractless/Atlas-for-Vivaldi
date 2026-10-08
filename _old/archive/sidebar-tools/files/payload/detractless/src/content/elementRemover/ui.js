export const UI_ID = "rhe-ui-container";

/* Spec 008: the ONLY on-page UI is the key-hint chip, shown while the picker is
   armed. The hints used to be printed in the side panel, a manual for keys that
   only work HERE, on the page, where your hands already are. buildUI/removeUI
   are the arm/disarm hooks, so the chip's lifetime is exactly the armed state.
   Styled in inject.css: content-script CSS is not panel vocabulary, it lives on
   foreign pages and is scoped to its own id. */
export function buildUI() {
  if (document.getElementById(UI_ID)) return;
  const chip = document.createElement('div');
  chip.id = UI_ID;
  /* textContent, never innerHTML: this element lives in an arbitrary page. */
  chip.textContent = 'Space removes · Q parent · W child · Esc stops';
  (document.body || document.documentElement).appendChild(chip);
}

export function removeUI() {
  const chip = document.getElementById(UI_ID);
  if (chip) chip.remove();
}

export function applyTheme() {
  // The chip uses fixed colors readable on any page; no theme to apply.
}