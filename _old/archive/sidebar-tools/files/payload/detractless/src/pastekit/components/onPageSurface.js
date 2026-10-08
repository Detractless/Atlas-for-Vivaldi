// src/pastekit/components/onPageSurface.js — the ONE owner of PasteKit's
// on-page visual vocabulary (spec 009, R-041).
//
// WHY THIS FILE IS ALLOWED LITERAL HEX, AND WHY THAT IS NARROW. Every surface
// PasteKit draws on a website lives in a CLOSED shadow root. Custom properties
// do not cross that boundary, so the CSS cannot say var(--surface-card); it has
// to carry values. The UI guard's exemption is all-or-nothing, so this path is
// exempted and then guarded HARDER by tests/onPageSurface.test.mjs, which
// asserts every colour below appears in styles/themes.css under the matching
// theme. That test exists because the hook's own comments record what happens
// otherwise: src/pastekit/styles/tokens.css once grew a second palette that
// drifted from the real one without ever tripping a guard.
//
// THE ONE SHADOW. R-041 grants a single soft ambient shadow to a popover
// rendered on a foreign page, on the CONTAINER only. The ban's rationale is
// that surfaces do the separating, and on a page we do not own that guarantee
// fails: where a site's background sits near our canvas the popover's outer
// edge dissolves. Rows never carry it, the dot never carries it, and nothing
// inside the extension's own pages may use this file.

/* Mirrored from styles/themes.css. Any change there must be made here too, and
   the test fails until it is. */
const PALETTE = {
  light: {
    canvas: '#E3E3E0',
    card: '#FFFFFF',
    muted: '#EFEEEC',
    hoverOnCanvas: '#F4F3F1',
    ink: '#0A0A09',
    inkSoft: '#76766F',
    inkFaint: '#9A9A95',
    inverse: '#111110',
    onInverse: '#FFFFFF',
    errorBg: '#FBEAE8',
    errorInk: '#B3382E',
  },
  dark: {
    canvas: '#111110',
    card: '#262622',
    muted: '#33332E',
    hoverOnCanvas: '#2D2D29',
    ink: '#F2F1EE',
    inkSoft: '#A0A099',
    inkFaint: '#7B7B75',
    inverse: '#EFEEEC',
    onInverse: '#111110',
    errorBg: '#2E1815',
    errorInk: '#E07A70',
  },
};

const FONT = '"Schibsted Grotesk", "Helvetica Neue", "Segoe UI", Arial, sans-serif';
/* Mirrors --font-mono. The scroll count is the only thing on a page surface that
   needs it, for the same reason the panel's does: a digit that changes as you
   scroll must not reflow the pill it sits in. */
const MONO = 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace';
const EASE = 'cubic-bezier(.22,1,.36,1)';
const Z_MAX = 2147483647;

/**
 * The extension's theme, not the site's.
 *
 * theme.js writes `_themeCache` to BOTH localStorage and chrome.storage.local;
 * the second copy exists for readers like this one, since a content script runs
 * in the page's origin and cannot see extension localStorage. 'system' resolves
 * the same way themePreinit resolves it, so the page surfaces and the panel
 * never disagree.
 *
 * @returns {Promise<'light'|'dark'>}
 */
export async function resolveOnPageTheme() {
  let pref = null;
  try {
    const got = await chrome.storage.local.get('_themeCache');
    pref = got && got._themeCache;
  } catch (_) { /* storage unreachable: fall through to system */ }

  if (pref === 'light' || pref === 'dark') return pref;
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch (_) {
    return 'light';
  }
}

/** Subscribe to extension theme changes. Returns an unsubscribe function. */
export function onThemeChange(fn) {
  const listener = (changes, area) => {
    if (area === 'local' && changes._themeCache) resolveOnPageTheme().then(fn);
  };
  try { chrome.storage.onChanged.addListener(listener); } catch (_) { return () => {}; }
  return () => { try { chrome.storage.onChanged.removeListener(listener); } catch (_) {} };
}

/**
 * The shared on-page vocabulary, as CSS text for a shadow root.
 *
 * One object, three consumers: the @ menu, the dot's picker and the dot. Each
 * used to carry its own private style block, which is how they drifted apart
 * from the extension and from each other.
 *
 * @param {'light'|'dark'} theme
 */
export function surfaceCSS(theme) {
  const c = PALETTE[theme] || PALETTE.light;
  return `
  :host { all: initial; }

  /* THE POPOVER: a well that brings its own canvas, because the page cannot be
     trusted to be one. Canvas outer, card rows inside, 11/3 sandwich. */
  .pk-pop {
    position: fixed; display: none; flex-direction: column; gap: 2px;
    box-sizing: border-box; padding: 8px;
    background: ${c.canvas}; border-radius: 18px;
    font: 400 14px ${FONT}; color: ${c.ink};
    z-index: ${Z_MAX};
    max-height: 264px; overflow-y: auto;
    scrollbar-width: none;
    /* R-041: the one granted shadow, container only. */
    box-shadow: 0 10px 32px rgba(10, 10, 9, 0.18);
  }
  .pk-pop::-webkit-scrollbar { display: none; }
  .pk-pop.open { display: flex; }

  /* A rows container, for the picker, whose list sits under a search field and
     scrolls on its own. The @ menu has no field so its rows are direct children
     of the popover; both arrangements need the same 2px seams, and :first-child
     resolves against whichever parent holds the rows, so the sandwich corners
     stay correct either way. */
  .pk-list {
    display: flex; flex-direction: column; gap: 2px;
    overflow-y: auto; scrollbar-width: none;
    /* min-height:0 lets this actually scroll inside the capped popover. Without
       it a flex child refuses to shrink below its content, and the overflow
       never engages. */
    min-height: 0; flex: 1 1 auto;
  }
  .pk-list::-webkit-scrollbar { display: none; }

  /* ── Scroll affordance (R-010) on a page surface ──────────────────────
     Same rule as the extension's own pages: this popover hides its scrollbar
     (scrollbar-width:none above), so something else has to say "there is more".
     The behaviour is not reimplemented here, only the paint: the shared
     components/shared/scrollAffordance.js drives it, called with prefix
     'pk-scroll' so it emits these class names instead of the panel's, which
     cannot reach a closed shadow root.

     GEOMETRY IS THE PANEL'S, UNCHANGED (chosen over a popover-scaled variant on
     2026-08-15): 40px fade, card pill on the right at the same 12/8 insets, mono
     count, filled chevron. The colours are literal for the reason the whole file
     is, and the fade's is CANVAS because that is what the rows sit on. */
  .pk-pop .pk-scroll-affordance { position: relative; display: flex; min-height: 0; flex: 1 1 auto; }
  .pk-scroll-affordance > * { flex: 1; min-width: 0; }
  .pk-scroll-fade {
    position: absolute; left: 0; right: 0; height: 40px; pointer-events: none;
    opacity: 1; transition: opacity .18s ${EASE};
  }
  .pk-scroll-fade.hidden { opacity: 0; }
  .pk-scroll-fade-top {
    top: 0; background: linear-gradient(to top, transparent, ${c.canvas});
  }
  .pk-scroll-fade-bot {
    bottom: 0; background: linear-gradient(to bottom, transparent, ${c.canvas});
  }
  /* Card on canvas: the same figure and ground as the rows it counts, so this
     adds a component and no new material. */
  .pk-scroll-count {
    position: absolute; right: 12px;
    display: inline-flex; align-items: center; gap: 5px;
    background: ${c.card}; color: ${c.inkFaint};
    font-family: ${MONO}; font-size: 10px; line-height: 1;
    padding: 5px 9px; border-radius: 999px;
    pointer-events: none; opacity: 1;
    transition: opacity .18s ${EASE};
  }
  .pk-scroll-count.hidden { opacity: 0; }
  .pk-scroll-count-top { top: 8px; }
  .pk-scroll-count-bot { bottom: 8px; }
  /* A filled shape, not two box sides: outlines are banned and this needs none. */
  .pk-scroll-count-chev { width: 6px; height: 6px; flex: none; position: relative; }
  .pk-scroll-count-chev::before {
    content: ""; position: absolute; inset: 0;
    background: ${c.inkFaint};
    clip-path: polygon(50% 100%, 0 30%, 18% 14%, 50% 66%, 82% 14%, 100% 30%);
  }
  .pk-scroll-count-top .pk-scroll-count-chev::before { transform: rotate(180deg); }

  .pk-row {
    display: flex; flex-direction: column; gap: 1px;
    box-sizing: border-box; padding: 8px 12px;
    /* flex:none IS THE BUG FIX, not a tidy-up. These rows live in a flex column
       with a height cap, where the default flex-shrink:1 lets them COMPRESS to
       fit instead of letting the container scroll: ten snippets rendered as ten
       slivers of clipped text. Rows keep their height and the list scrolls. */
    flex: none;
    background: ${c.card}; border-radius: 3px;
    color: ${c.ink}; font: 400 13px ${FONT};
    cursor: pointer; text-align: left;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    transition: background .14s ${EASE};
  }
  .pk-row:first-child { border-radius: 11px 11px 3px 3px; }
  .pk-row:last-child { border-radius: 3px 3px 11px 11px; }
  .pk-row:only-child { border-radius: 11px; }
  /* ADR-1: hover names what is UNDERNEATH. A row sits on the WELL, which is
     canvas, so hover moves away from CANVAS tone, not card tone. Getting this
     wrong is not subtle: the card hover is a much bigger step and reads as a
     press rather than a hover, in both themes. This is the same mistake R-032
     already corrected in the panel, made again here because the palette key was
     called plain "hover" and answered no question about what it sat on. */
  .pk-row:hover, .pk-row.active { background: ${c.hoverOnCanvas}; }
  .pk-row b { font-weight: 700; }
  .pk-ds {
    font-size: 11px; color: ${c.inkFaint};
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }

  /* The search field: the panel's muted input shape. Surface separates it from
     the rows, so there is no line, which is what the old border was doing. */
  .pk-search {
    box-sizing: border-box; width: 100%;
    background: ${c.muted}; border-radius: 8px;
    padding: 8px 12px; margin-bottom: 8px;
    font: 400 13px ${FONT}; color: ${c.ink};
    border: none; outline: none;
    /* Same trap as the rows: a compressible search field is a squashed one. */
    flex: none;
  }
  .pk-search::placeholder { color: ${c.inkFaint}; }

  /* R-038's empty state, scaled for a popover: glyph, short line, centred. */
  .pk-empty {
    display: flex; flex-direction: column; align-items: center; gap: 8px;
    padding: 18px 12px; text-align: center;
    background: ${c.card}; border-radius: 11px;
    color: ${c.inkFaint}; font: 400 12px ${FONT};
  }
  .pk-empty svg { width: 22px; height: 22px; }

  /* THE CORNER TOAST: the clip confirmation and the fill indicator, both pinned
     bottom-right. An INVERSE FILL, which is the extension's own vocabulary for
     a primary surface, and which is why these get NO shadow even though they
     float on a foreign page: R-041's exception exists for surfaces that separate
     by subtle surface contrast, and near-black on anything (or near-white in
     dark) separates by LUMINANCE instead. The exception is for popovers that
     need it, not a licence for everything on a page. */
  .pk-toast {
    display: flex; align-items: center; gap: 10px;
    box-sizing: border-box; padding: 9px 16px;
    background: ${c.inverse}; color: ${c.onInverse};
    border-radius: 999px;
    font: 500 13px ${FONT};
    cursor: default; user-select: none;
    max-width: 320px; white-space: nowrap;
    overflow: hidden; text-overflow: ellipsis;
    animation: pk-rise .18s ${EASE};
  }
  /* Errors use the extension's danger pair, the same one an armed Delete row
     uses. The old toast invented its own red that matched no token at all. */
  .pk-toast.error { background: ${c.errorBg}; color: ${c.errorInk}; }
  @keyframes pk-rise {
    from { opacity: 0; transform: translateY(6px); }
    to   { opacity: 1; transform: none; }
  }
  .pk-toast .pk-preview {
    max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .pk-toast button {
    all: unset; cursor: pointer; padding: 0 4px; opacity: .65;
  }
  .pk-toast button:hover { opacity: 1; }
  /* Queue progress: filled, next, pending. "Next" was an outlined dot, and
     outlines are banned; it is a full-size solid against half-size pending
     dots now, so the state reads by weight rather than by a ring. */
  .pk-qdot {
    width: 6px; height: 6px; border-radius: 50%;
    background: ${c.onInverse}; opacity: .35; flex: none;
  }
  .pk-qdot.filled { opacity: .7; }
  .pk-qdot.next { width: 9px; height: 9px; opacity: 1; }

  /* The dot. Unchanged except that its shadow is gone: it sits ON the page, not
     over it, so it never qualified for R-041's exception. */
  .pk-dot {
    position: fixed; box-sizing: border-box;
    border-radius: 50%; background: ${c.inverse};
    cursor: pointer; display: none;
    transition: transform .14s ${EASE};
  }
  .pk-dot::after {
    content: 'P'; color: ${c.onInverse};
    font: 700 11px ${FONT};
    display: flex; align-items: center; justify-content: center;
    width: 100%; height: 100%;
  }
  .pk-dot:hover { transform: scale(1.12); }
  `;
}

/** The search glyph, matching the extension's icon set, for empty states. */
export const SEARCH_GLYPH =
  '<svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" fill="none" '
  + 'stroke-linecap="round" stroke-linejoin="round">'
  + '<circle cx="11" cy="11" r="8"></circle>'
  + '<line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>';

export { PALETTE };
