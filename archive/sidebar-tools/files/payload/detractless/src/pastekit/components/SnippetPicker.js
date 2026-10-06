// src/components/SnippetPicker.js — searchable snippet picker overlay opened
// by the field dot. Lives inside the FieldDot shadow root; inserts the chosen
// snippet into the field the picker was opened for.
// Spec 009 (R-041): the private style block is gone. This overlay drew the LAST
// border in the extension, a line under the search field, which surface contrast
// now does instead. Everything visual comes from onPageSurface; this file owns
// behaviour only. It shares the FieldDot shadow root, so it inherits that host's
// stylesheet rather than appending a second one.
import { MSG, call } from '../utils/messages.js';
import { insertText } from './InsertText.js';
import { SEARCH_GLYPH } from './onPageSurface.js';
import { attachScrollAffordance } from '../../components/shared/scrollAffordance.js';

const DOT = 22; // must match FieldDot's dot size for anchor math

export function createSnippetPicker(shadow, getField) {
  const overlayEl = document.createElement('div');
  overlayEl.className = 'pk-pop';
  const searchEl = document.createElement('input');
  searchEl.className = 'pk-search';
  searchEl.type = 'text'; searchEl.placeholder = 'Search snippets and #tags…';
  const listEl = document.createElement('div'); listEl.className = 'pk-list';
  /* R-010: the list hides its scrollbar, so it owes a fade and a count. The host
     is built here rather than letting attachScrollAffordance insert one, because
     the wrapper has to sit INSIDE the popover, under the search field, and the
     auto-inserted variant would wrap whatever the list's parent happened to be. */
  const affEl = document.createElement('div'); affEl.className = 'pk-scroll-affordance';
  affEl.appendChild(listEl);
  overlayEl.append(searchEl, affEl);
  shadow.append(overlayEl);
  const listAff = attachScrollAffordance(listEl, {
    host: affEl, prefix: 'pk-scroll', noun: '',
  });

  let snippets = [], activeIdx = -1;
  let pickerLimit = 10;

  function place(r) {
    const ow = 320, oh = Math.min(overlayEl.scrollHeight || 400, innerHeight - 16);
    let left = Math.min(r.left - DOT - 6, innerWidth - ow - 8);
    let top  = r.top + 4 + DOT + 6;
    if (top + oh > innerHeight - 8) top = Math.max(8, r.top - oh - 6);
    overlayEl.style.left = Math.max(8, left) + 'px';
    overlayEl.style.top = top + 'px';
    /* The width used to live in the private stylesheet that spec 009 deleted.
       Set here, next to the `ow` the placement maths already uses, so the two
       cannot disagree about how wide this overlay is. */
    overlayEl.style.width = ow + 'px';
  }

  function toggle() {
    if (overlayEl.classList.contains('open')) { close(); return; }
    overlayEl.classList.add('open');
    searchEl.value = '';
    render('');
    const field = getField();
    if (field) place(field.getBoundingClientRect());
    /* The affordance observes the LIST, and opening toggles a class on the
       POPOVER, so no mutation record reaches it. The ResizeObserver does fire on
       the display change, but a frame later, which shows as the fade arriving
       after the rows. Measure now instead. */
    listAff.refresh();
    setTimeout(() => {
      try { searchEl.focus(); }
      catch (_) { /* focus can fail if the overlay was closed in the same tick */ }
    }, 0);
  }

  function close() { overlayEl.classList.remove('open'); }
  function isOpen() { return overlayEl.classList.contains('open'); }

  function reposition() {
    const field = getField();
    if (field && isOpen()) place(field.getBoundingClientRect());
  }

  async function render(query) {
    try {
      snippets = await call(MSG.SNIPPET_SEARCH, { query: query || '' });
    } catch (_) { snippets = []; }
    activeIdx = snippets.length ? 0 : -1;
    drawList();
  }

  function drawList() {
    listEl.replaceChildren();
    if (!snippets.length) {
      /* R-038's empty state, the same object the panel and the @ menu show:
         glyph, short line, centred. Was a left-aligned grey sentence. */
      const emptyEl = document.createElement('div');
      emptyEl.className = 'pk-empty';
      const glyph = document.createElement('span');
      glyph.innerHTML = SEARCH_GLYPH;
      emptyEl.append(glyph, document.createTextNode('No snippets match'));
      listEl.appendChild(emptyEl);
      listEl.style.maxHeight = '';
      return;
    }
    snippets.forEach((s, i) => listEl.appendChild(rowFor(s, i)));
    /* The rows-visible setting still caps the list. Measured off the first ROW
       rather than the retired .item, which is the kind of stale selector that
       silently stops capping anything. */
    const firstEl = listEl.querySelector('.pk-row');
    if (firstEl instanceof HTMLElement && snippets.length > pickerLimit) {
      listEl.style.maxHeight = (firstEl.offsetHeight * pickerLimit + 8) + 'px';
    } else {
      listEl.style.maxHeight = '';
    }
  }

  function rowFor(s, i) {
    const itemEl = document.createElement('div');
    itemEl.className = 'pk-row' + (i === activeIdx ? ' active' : '');
    const nmEl = document.createElement('span');
    nmEl.textContent = s.name;
    itemEl.appendChild(nmEl);
    if (s.description) {
      const dsEl = document.createElement('span');
      dsEl.className = 'pk-ds'; dsEl.textContent = s.description;
      itemEl.appendChild(dsEl);
    }
    itemEl.addEventListener('mousedown', (ev) => {
      ev.preventDefault(); ev.stopImmediatePropagation();
      choose(s);
    }, true);
    return itemEl;
  }

  function choose(s) {
    const field = getField();
    if (field) insertText(field, s.contentText, s.contentHtml);
    close();
  }

  function move(delta) {
    if (!snippets.length) return;
    activeIdx = (activeIdx + delta + snippets.length) % snippets.length;
    drawList();
    const el = listEl.children[activeIdx];
    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
  }

  searchEl.addEventListener('input', () => render(searchEl.value));
  searchEl.addEventListener('keydown', (ev) => {
    if (ev.key === 'ArrowDown') { ev.preventDefault(); move(1); }
    else if (ev.key === 'ArrowUp') { ev.preventDefault(); move(-1); }
    else if (ev.key === 'Enter') { ev.preventDefault(); if (snippets[activeIdx]) choose(snippets[activeIdx]); }
    else if (ev.key === 'Escape') {
      ev.preventDefault(); ev.stopImmediatePropagation();
      close();
      const field = getField();
      if (field) field.focus();
    }
  });

  return {
    toggle, close, isOpen, reposition,
    setPickerLimit(n) { pickerLimit = n; },
  };
}
