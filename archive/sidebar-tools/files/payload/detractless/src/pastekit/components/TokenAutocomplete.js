// src/components/TokenAutocomplete.js — HAND-ROLLED @ engine (no Tribute.js):
//   * capture-phase keyup/input listener
//   * look-back parse of text before the caret to find `@word` (TriggerParse;
//     requireLeadingSpace so email@x doesn't trigger)
//   * fuzzy/prefix filter over snippet names (utils/fuzzyMatch)
//   * caret-position dropdown (TokenMenu + CaretRect)
//   * keyboard nav (ArrowUp/Down, Enter to insert, Esc to close)
//   * IME guard (skip while e.isComposing / keyCode 229)
import { MSG, call } from '../utils/messages.js';
import { fuzzyHighlight } from '../utils/fuzzyMatch.js';
import { getCachedSettings } from '../utils/settingsCache.js';
import { insertText } from './InsertText.js';
import { caretRectForInput, caretRectForCE } from './CaretRect.js';
import { createTokenMenu } from './TokenMenu.js';
import { parseTrigger } from './TriggerParse.js';

const MAX_ITEMS = 8;
// Suggestions now cost a round trip to the service worker (and an IndexedDB
// scan there) instead of a filter over an in-page cache, so coalesce bursts of
// typing. Short enough to feel instant, long enough that a fast typist sends
// one request per word rather than one per key.
const SUGGEST_DEBOUNCE_MS = 60;

export function initTokenAutocomplete() {
  // Gate on settings (settingsCache keeps them fresh).
  function enabled() {
    const s = getCachedSettings();
    if (!s) return true;
    return s.tokenSystem !== false && s.tokenAutocomplete !== false;
  }

  // ---------------------------- suggestions ----------------------------------
  // NO snippet cache. This used to hold every snippet, body included, fetched at
  // module init on every page and every frame — so snippet content sat in the
  // renderer of every site visited, for the whole session, to serve a dropdown
  // that appears for a moment after an "@". Suggestions are now fetched per
  // trigger and carry names only; the body is fetched at commit, for one id.
  //
  // Responses are async, so a stale reply must never draw over a newer query:
  // every request takes a sequence number and only the newest one may render.
  let reqSeq = 0;
  let suggestTimer = null;

  async function fetchSuggestions(query) {
    const seq = ++reqSeq;
    let items;
    try {
      items = await call(MSG.SNIPPET_SUGGEST, { query, limit: MAX_ITEMS });
    } catch (_) {
      return null; // SW asleep or context invalidated — leave the menu alone
    }
    if (seq !== reqSeq) return null; // superseded by a later keystroke
    return items || [];
  }

  // ------------------------------ engine state -------------------------------
  let target = null;        // trigger info for the field currently being edited
  let matches = [];         // suggestions currently drawn: { s: {id, name}, html }
  let activeIdx = 0;
  let open = false;

  const menu = createTokenMenu((suggestion) => commit(suggestion));

  // The server ranks; this only rebuilds the highlight markup for display.
  function decorate(items, query) {
    return items.map((s) => {
      const f = fuzzyHighlight(query, s.name || '');
      return { s, score: f ? f.score : 0, html: f ? f.html : (s.name || '') };
    });
  }

  // ------------------------------ show / hide --------------------------------
  // Coalesces a burst of keystrokes into one lookup. An already-open menu keeps
  // showing its current matches until the newer ones land, which is how every
  // other autocomplete behaves.
  function scheduleShowMenu(info) {
    if (suggestTimer) clearTimeout(suggestTimer);
    suggestTimer = setTimeout(() => { suggestTimer = null; showMenu(info); }, SUGGEST_DEBOUNCE_MS);
  }

  async function showMenu(info) {
    target = info;
    const items = await fetchSuggestions(info.query);
    if (items === null) return;          // superseded or failed
    if (target !== info) return;         // trigger moved on while we waited
    matches = decorate(items, info.query);
    activeIdx = 0;
    open = true;
    /* menu.open() still reports whether it was ALREADY open, but nothing needs
       that now: it fed an animate flag for the staggered pill fade-up, and the
       pills left in spec 009. Capturing it into an unread variable would just
       be a leftover for the next reader to wonder about. */
    menu.open();
    menu.draw(matches, activeIdx);
    const rect = info.kind === 'input'
      ? caretRectForInput(info.el, info.start)
      : caretRectForCE(info.node, info.start);
    menu.position(rect);
  }

  function hideMenu() {
    if (suggestTimer) { clearTimeout(suggestTimer); suggestTimer = null; }
    reqSeq++; // invalidate any reply still in flight
    open = false; target = null; matches = []; activeIdx = 0;
    menu.close();
  }

  // ------------------------------- committing --------------------------------
  // Replace the "@query" span with the snippet body via insertText.
  //
  // The body is fetched here, for this one id — it was never in this page's
  // memory before the user chose it. Everything after the await re-checks that
  // the field is still the one we started in, since the user could have typed,
  // clicked away, or triggered a re-render while the message was in flight.
  async function commit(suggestion) {
    if (!target || !suggestion) return;
    const info = target;

    let snippet;
    try {
      snippet = await call(MSG.SNIPPET_GET, { id: suggestion.id });
    } catch (_) {
      hideMenu();
      return;
    }
    // Null when the snippet was deleted mid-flight, or while the store is locked
    // (messageHub gates every snippet payload type on that).
    //
    if (!snippet) { hideMenu(); return; }
    if (target !== info) { hideMenu(); return; }

    if (info.kind === 'input') {
      const el = info.el;
      if (document.activeElement !== el) { hideMenu(); return; }
      const caret = el.selectionStart;
      // Select the trigger text ("@query") so insertText replaces it.
      try { el.setSelectionRange(info.start, caret); }
      catch (_) { /* setSelectionRange unsupported for this input type — insert at caret */ }
      insertText(el, snippet.contentText, null); // inputs = plain text
    } else {
      // contenteditable: build a range from '@' start to the current caret and replace.
      const sel = window.getSelection();
      if (!sel) return;
      try {
        const range = document.createRange();
        range.setStart(info.node, info.start);
        const cur = sel.getRangeAt(0);
        range.setEnd(cur.startContainer, cur.startOffset);
        sel.removeAllRanges();
        sel.addRange(range);
      } catch (_) { /* stale node/offset — insert at the current caret instead */ }
      insertText(info.el, snippet.contentText, snippet.contentHtml);
    }
    hideMenu();
  }

  // ------------------------------- listeners ---------------------------------
  // IME guard: while composing, do nothing.
  function composing(e) { return e.isComposing || e.keyCode === 229; }

  // Re-parse after input (covers typing, paste, autocorrect).
  document.addEventListener('input', (e) => {
    if (!enabled()) { if (open) hideMenu(); return; }
    if (/** @type {InputEvent} */ (e).isComposing) return;
    reevaluate();
  }, true);

  // keyup catches caret moves (arrows) that don't fire input.
  document.addEventListener('keyup', (e) => {
    if (!enabled()) { if (open) hideMenu(); return; }
    if (composing(e)) return;
    if (['ArrowLeft','ArrowRight','Home','End'].includes(e.key)) reevaluate();
  }, true);

  // Keydown owns navigation while the menu is open (runs before default).
  document.addEventListener('keydown', (e) => {
    if (!open) return;
    if (composing(e)) return;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault(); e.stopImmediatePropagation();
        if (matches.length) { activeIdx = (activeIdx + 1) % matches.length; menu.draw(matches, activeIdx); }
        break;
      case 'ArrowUp':
        e.preventDefault(); e.stopImmediatePropagation();
        if (matches.length) { activeIdx = (activeIdx - 1 + matches.length) % matches.length; menu.draw(matches, activeIdx); }
        break;
      case 'Enter':
      case 'Tab':
        if (matches[activeIdx]) {
          e.preventDefault(); e.stopImmediatePropagation();
          commit(matches[activeIdx].s);
        }
        break;
      case 'Escape':
        e.preventDefault(); e.stopImmediatePropagation();
        hideMenu();
        break;
    }
  }, true);

  function reevaluate() {
    const info = parseTrigger();
    if (info) scheduleShowMenu(info);
    else if (open) hideMenu();
  }

  // Hide on blur / outside click / scroll (menu is caret-anchored, not tracked).
  document.addEventListener('focusout', () => setTimeout(() => { if (open) hideMenu(); }, 0), true);
  document.addEventListener('scroll', () => { if (open) hideMenu(); }, { capture: true, passive: true });
  document.addEventListener('pointerdown', (e) => {
    const t = e.composedPath ? e.composedPath()[0] : e.target;
    if (t !== menu.host && !menu.shadow.contains(t instanceof Node ? t : null)) { if (open) hideMenu(); }
  }, true);
}
