/* ══════════════════════════════════════════════════════════════════════
   SUBPAGE NAVIGATION (R-015)

   Drill-in inside ONE modal card: show a panel, swap the header title, turn
   the close disc into a back chevron. Navigation never stacks a second
   overlay, which is the property that separates this from a picker dialog.

   WHY IT IS SHARED. This was four coupled writes living inside
   engineModal.js: the visible panel, the header text, the close disc's glyph
   AND its title attribute, and a dataset flag the click handler branches on.
   Miss one and the card claims to be somewhere it is not. The add flow is
   adopting the same pattern, and this project has twice paid for the
   alternative: two different switches in components.css, and the hand-rolled
   bookmark fade that R-010 had to replace. One implementation, two callers.

   WHAT IT DELIBERATELY DOES NOT OWN. Focus, scroll restoration beyond
   scrollTop=0, and per-caller state resets stay with the caller, because they
   are about the CONTENT of a panel and this is only about which panel is on.

   ESCAPE FALLS OUT FOR FREE. The global handler in modalVisibility.js presses
   .close-btn rather than hiding the modal, so a card wearing a back chevron
   steps back one level on Escape and leaves on the second press. That is the
   contract, not a coincidence; see the note in that file.
   ══════════════════════════════════════════════════════════════════════ */

const BACK_GLYPH  = '‹';
const CLOSE_GLYPH = '×';

/**
 * @param {object} spec
 * @param {string} spec.panels    selector for every subpage panel in the card
 * @param {string} spec.home      selector for the home view
 * @param {string} spec.title     selector for the header title element
 * @param {string} spec.closeBtn  selector for the close disc
 * @param {string} spec.homeTitle title to restore when returning home
 * @param {string} [spec.panelAttr] attribute naming each panel. Defaults to
 *        "data-subpage"; the engine card's markup predates this and uses
 *        "data-engine-panel".
 * @param {string} [spec.titleAttr] dataset key on a panel holding its title.
 *        Defaults to "subpageTitle"; engine panels use "engineTitle".
 * @returns {{open: (name: string, customTitle?: string) => boolean,
 *            close: () => void,
 *            isSubpage: () => boolean}}
 */
export function createSubpageNav(spec) {
  const {
    panels, home, title, closeBtn, homeTitle,
    panelAttr = 'data-subpage',
    titleAttr = 'subpageTitle',
  } = spec;

  // Resolved per call, never cached. renderEngineListInModal rebuilds rows on
  // every save, and a card's markup may not exist yet at module init.
  const q  = (sel) => document.querySelector(sel);
  const qa = (sel) => document.querySelectorAll(sel);

  // The one place the four writes happen together.
  function setChrome(text, mode) {
    const titleEl = q(title);
    const btn     = q(closeBtn);
    if (titleEl) titleEl.textContent = text;
    if (!btn) return;
    if (mode === 'back') {
      btn.textContent = BACK_GLYPH; btn.title = 'Back';
      btn.dataset.navMode = 'back';
    } else {
      btn.textContent = CLOSE_GLYPH; btn.title = 'Close';
      delete btn.dataset.navMode;
    }
  }

  function open(name, customTitle) {
    const page   = q(`${panels}[${panelAttr}="${name}"]`);
    const homeEl = q(home);
    // Both, not either: hiding home while no panel showed left an empty card,
    // and showing a panel while home stayed visible stacked the two.
    if (!page || !homeEl) return false;

    homeEl.hidden = true;
    qa(panels).forEach(p => { p.hidden = true; });
    page.hidden = false;

    setChrome(customTitle || page.dataset[titleAttr] || homeTitle, 'back');

    // A panel opened after the previous one was scrolled would otherwise
    // inherit that offset and start part way down its own form.
    const body = page.closest('.settings-body');
    if (body) body.scrollTop = 0;
    return true;
  }

  function close() {
    const homeEl = q(home);
    if (!homeEl) return;
    qa(panels).forEach(p => { p.hidden = true; });
    homeEl.hidden = false;
    setChrome(homeTitle, 'close');
  }

  // Lets a close handler ask "back or out?" without reading the dataset key,
  // which is this module's private detail.
  const isSubpage = () => q(closeBtn)?.dataset.navMode === 'back';

  return { open, close, isSubpage };
}
