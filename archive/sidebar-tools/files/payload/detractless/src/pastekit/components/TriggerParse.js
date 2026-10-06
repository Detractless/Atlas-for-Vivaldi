// src/components/TriggerParse.js — look-back parse for the @ engine.
// For input/textarea: read value + selectionStart.
// For contenteditable: read the text of the current text node up to the caret.

const TRIGGER = '@';
const REQUIRE_LEADING_SPACE = true;
const MAX_QUERY_LENGTH = 40;

export function parseTrigger() {
  const el = document.activeElement;
  if (!el) return null;

  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    const caret = el.selectionStart;
    if (caret == null || caret !== el.selectionEnd) return null; // no selection ranges
    const info = lookBack(el.value.slice(0, caret));
    if (!info) return null;
    return { el, kind: 'input', start: info.start, query: info.query, caret };
  }

  if (el instanceof HTMLElement && el.isContentEditable) {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || !sel.isCollapsed) return null;
    const range = sel.getRangeAt(0);
    const node = range.startContainer;
    if (node.nodeType !== 3) return null; // only within a text node
    const offset = range.startOffset;
    const info = lookBack((node.textContent || '').slice(0, offset));
    if (!info) return null;
    return { el, kind: 'ce', node, start: info.start, offset, query: info.query };
  }
  return null;
}

// Core look-back: find a trailing @word before caret. Returns {start, query} or null.
function lookBack(textBeforeCaret) {
  const at = textBeforeCaret.lastIndexOf(TRIGGER);
  if (at === -1) return null;
  // The candidate token is everything after the '@'.
  const query = textBeforeCaret.slice(at + 1);
  // Token must be a single word (no whitespace) — space cancels.
  if (/\s/.test(query)) return null;
  // requireLeadingSpace: the char before '@' must be start-of-text or whitespace,
  // so user@domain.com does NOT trigger.
  if (REQUIRE_LEADING_SPACE && at > 0) {
    const prev = textBeforeCaret[at - 1];
    if (!/\s/.test(prev)) return null;
  }
  // Limit runaway queries.
  if (query.length > MAX_QUERY_LENGTH) return null;
  return { start: at, query };
}
