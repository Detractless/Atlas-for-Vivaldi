// src/components/TokenMenu.js — the @ engine's suggestion dropdown.
//
// Spec 009 (R-041): PILLS ARE GONE. They were a shape the panel retired in spec
// 005, and on a website they read as a third party's widget rather than as this
// extension. Matches are now the same rows every picker draws, inside a popover
// that brings its own canvas, because the page cannot be relied on to be one.
// All styling comes from onPageSurface so the three on-page surfaces cannot
// drift apart again; this file owns behaviour only.
import { createShadowHost } from './ShadowHost.js';
import { surfaceCSS, resolveOnPageTheme, onThemeChange, SEARCH_GLYPH } from './onPageSurface.js';
import { attachScrollAffordance } from '../../components/shared/scrollAffordance.js';

const MENU_W = 320;
const MENU_H = 264;   // matches .pk-pop's max-height

/**
 * Creates the dropdown. `onPick(snippet)` fires when a row is chosen.
 * Returns { host, shadow, open, close, isOpen, draw } — the engine owns
 * match state and passes it into draw().
 */
export function createTokenMenu(onPick) {
  /* Rendered light-first, then corrected once storage answers. The alternative
     is holding the menu closed on an await while the user is mid-keystroke,
     which would make the @ menu feel slower than the page it sits on. */
  const { host, shadow, styleEl } = createShadowHost(
    'data-pastekit-token', surfaceCSS('light'));
  resolveOnPageTheme().then(t => { styleEl.textContent = surfaceCSS(t); });
  onThemeChange(t => { styleEl.textContent = surfaceCSS(t); });

  const menuEl = document.createElement('div'); menuEl.className = 'pk-pop';
  /* THE ROWS MOVED INTO A .pk-list, and that is the point of this change, not a
     tidy-up. The popover used to be its own scroller with the rows as direct
     children, which left nowhere to hang R-010's fade: the affordance needs a
     positioned wrapper AROUND the scroller, and wrapping .pk-pop would have
     wrapped the fixed-positioned element that position() moves. The picker was
     already built this way, so both surfaces now scroll the same thing. The
     11/3 corner sandwich is unaffected: :first-child resolves against whichever
     parent holds the rows, which onPageSurface's comment already anticipated. */
  const affEl = document.createElement('div'); affEl.className = 'pk-scroll-affordance';
  const listEl = document.createElement('div'); listEl.className = 'pk-list';
  affEl.appendChild(listEl);
  menuEl.appendChild(affEl);
  shadow.append(menuEl);
  const listAff = attachScrollAffordance(listEl, {
    host: affEl, prefix: 'pk-scroll', noun: '',
  });

  function draw(matches, activeIdx) {
    listEl.replaceChildren();
    if (!matches.length) {
      /* R-038's empty state, the same one the panel and the dot picker show. */
      const emptyEl = document.createElement('div');
      emptyEl.className = 'pk-empty';
      const glyph = document.createElement('span');
      glyph.innerHTML = SEARCH_GLYPH;
      emptyEl.append(glyph, document.createTextNode('No snippets match'));
      listEl.appendChild(emptyEl);
      listAff.refresh();
      return;
    }
    matches.forEach((m, i) => {
      const rowEl = document.createElement('div');
      rowEl.className = 'pk-row' + (i === activeIdx ? ' active' : '');
      const nameEl = document.createElement('span');
      nameEl.appendChild(fuzzyHtmlToNodes(m.html));
      rowEl.appendChild(nameEl);
      /* The description is a VALUE LINE now, not a tooltip: a row has room to
         say it, and a title attribute on a website is easy to miss. */
      if (m.s.description) {
        const dsEl = document.createElement('span');
        dsEl.className = 'pk-ds'; dsEl.textContent = m.s.description;
        rowEl.appendChild(dsEl);
      }
      rowEl.addEventListener('mousedown', (ev) => {
        ev.preventDefault(); ev.stopPropagation();
        onPick(m.s);
      }, true);
      listEl.appendChild(rowEl);
    });
    /* Redrawn on every keystroke, and the arrow keys redraw it too to move
       .active. Measure in the same tick so the count never lags the list it
       counts by a frame. */
    listAff.refresh();
  }

  function position(anchorRect) {
    if (!anchorRect) return;
    const mh = Math.min(MENU_H, menuEl.scrollHeight || MENU_H);
    let left = anchorRect.left;
    let top = anchorRect.bottom + 4;
    if (left + MENU_W > innerWidth - 8) left = Math.max(8, innerWidth - MENU_W - 8);
    if (top + mh > innerHeight - 8) top = Math.max(8, anchorRect.top - mh - 4);
    menuEl.style.left = Math.max(8, left) + 'px';
    menuEl.style.top = top + 'px';
    menuEl.style.width = MENU_W + 'px';
  }

  return {
    host, shadow,
    draw, position,
    /* refresh() after the class, not before: the menu measures zero while it is
       still display:none, and the affordance would clear itself to "0 above,
       0 below" over a list that does overflow. */
    open()   { const wasOpen = menuEl.classList.contains('open'); menuEl.classList.add('open'); listAff.refresh(); return wasOpen; },
    close()  { menuEl.classList.remove('open'); },
    isOpen() { return menuEl.classList.contains('open'); },
  };
}

// fuzzyHighlight() emits only <b>…</b> around HTML-escaped text; parse that
// narrow format into real nodes instead of assigning innerHTML.
function fuzzyHtmlToNodes(html) {
  const frag = document.createDocumentFragment();
  let s = String(html || '');
  while (s) {
    const open = s.indexOf('<b>');
    if (open === -1) { frag.appendChild(document.createTextNode(unescapeHtml(s))); break; }
    if (open > 0) frag.appendChild(document.createTextNode(unescapeHtml(s.slice(0, open))));
    const close = s.indexOf('</b>', open + 3);
    if (close === -1) { frag.appendChild(document.createTextNode(unescapeHtml(s.slice(open)))); break; }
    const boldEl = document.createElement('b');
    boldEl.textContent = unescapeHtml(s.slice(open + 3, close));
    frag.appendChild(boldEl);
    s = s.slice(close + 4);
  }
  return frag;
}

function unescapeHtml(s) {
  return s
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}
