// src/components/CaretRect.js — caret pixel positioning.
// Mirror-div technique for input/textarea (hand-written, no library):
// an off-screen <div> copies the field's computed styles, the text before the
// caret is inserted, a marker <span> is placed at the caret offset, and its
// rect (mapped back onto the field, minus scroll) gives the caret position.
// Contenteditable uses Range.getBoundingClientRect() directly.

const MIRROR_PROPS = [
  'boxSizing','width','height','paddingTop','paddingRight','paddingBottom','paddingLeft',
  'borderTopWidth','borderRightWidth','borderBottomWidth','borderLeftWidth',
  'fontStyle','fontVariant','fontWeight','fontStretch','fontSize','fontFamily','lineHeight',
  'textAlign','textTransform','textIndent','letterSpacing','wordSpacing','whiteSpace',
  'tabSize','direction',
];

export function caretRectForInput(el, caretIndex) {
  const doc = el.ownerDocument;
  const cs = getComputedStyle(el);
  const divEl = doc.createElement('div');
  const st = divEl.style;
  st.position = 'absolute';
  st.visibility = 'hidden';
  st.whiteSpace = el.tagName === 'INPUT' ? 'pre' : 'pre-wrap';
  st.wordWrap = 'break-word';
  st.overflow = 'hidden';
  for (const prop of MIRROR_PROPS) st[prop] = cs[prop];
  if (el.tagName === 'INPUT') st.whiteSpace = 'pre';
  // Position the mirror off-screen.
  const rect = el.getBoundingClientRect();
  st.top = '0'; st.left = '-9999px';
  doc.body.appendChild(divEl);

  const value = el.value;
  divEl.textContent = value.slice(0, caretIndex);
  const markerEl = doc.createElement('span');
  markerEl.textContent = value.slice(caretIndex) || '.';
  divEl.appendChild(markerEl);

  const mRect = markerEl.getBoundingClientRect();
  const divRect = divEl.getBoundingClientRect();
  // Marker position relative to the mirror div's top-left, then map onto the field.
  const relTop = mRect.top - divRect.top;
  const relLeft = mRect.left - divRect.left;
  doc.body.removeChild(divEl);

  const lineHeight = parseFloat(cs.lineHeight) || (parseFloat(cs.fontSize) * 1.2);
  return {
    left: rect.left + relLeft - el.scrollLeft,
    top: rect.top + relTop - el.scrollTop,
    bottom: rect.top + relTop - el.scrollTop + lineHeight,
  };
}

export function caretRectForCE(node, offset) {
  try {
    const range = document.createRange();
    range.setStart(node, offset);
    range.collapse(true);
    let rect = range.getBoundingClientRect();
    if ((!rect || (rect.top === 0 && rect.left === 0)) && node.parentElement) {
      rect = node.parentElement.getBoundingClientRect();
    }
    return { left: rect.left, top: rect.top, bottom: rect.bottom };
  } catch (_) { return null; }
}
