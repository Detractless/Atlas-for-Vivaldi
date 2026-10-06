// src/components/InsertText.js — universal text/HTML insertion (§C3).
// Rich HTML is sanitized with a tiny hand-rolled allow-list sanitizer
// (sanitizeHtml) before any contenteditable insert — no DOMPurify.

// ---------------------------------------------------------------------------
// Minimal HTML sanitizer. Allow-list of tags + attributes; strips scripts,
// event handlers, and javascript: URLs. Used only for contentHtml insertion
// into contenteditable.
// ---------------------------------------------------------------------------
const ALLOWED_TAGS = new Set([
  'B','STRONG','I','EM','U','S','STRIKE','P','BR','SPAN','DIV','A','UL','OL','LI',
  'BLOCKQUOTE','CODE','PRE','H1','H2','H3','H4','H5','H6','HR','TABLE','THEAD',
  'TBODY','TR','TD','TH','SUB','SUP','SMALL','MARK',
]);
const ALLOWED_ATTR = new Set(['href','title','colspan','rowspan']);
const BAD_HREF = /^\s*(javascript|data|vbscript):/i;

export function sanitizeHtml(html, doc) {
  doc = doc || document;
  // DOMParser builds a fully detached document — nothing reaches the live DOM unsanitized.
  const win = doc.defaultView || window;
  const parsed = new win.DOMParser().parseFromString(String(html == null ? '' : html), 'text/html');
  sanitizeNode(parsed.body);
  return parsed.body.innerHTML;
}

function sanitizeNode(node) {
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === 8) { node.removeChild(child); continue; } // comment
    if (child.nodeType !== 1) continue; // keep text as-is
    if (!ALLOWED_TAGS.has(child.tagName)) {
      // Unwrap: keep sanitized children, drop the element itself.
      sanitizeNode(child);
      while (child.firstChild) node.insertBefore(child.firstChild, child);
      node.removeChild(child);
      continue;
    }
    scrubAttributes(child);
    sanitizeNode(child);
  }
}

function scrubAttributes(el) {
  for (const attr of Array.from(el.attributes)) {
    const name = attr.name.toLowerCase();
    if (!ALLOWED_ATTR.has(name)) { el.removeAttribute(attr.name); continue; }
    if (name === 'href' && BAD_HREF.test(attr.value || '')) el.removeAttribute(attr.name);
  }
}

// ---------------------------------------------------------------------------
// insertText — universal insertion (§C3)
// ---------------------------------------------------------------------------
export function insertText(element, text, html) {
  if (!element) return false;
  element.focus();
  text = text == null ? '' : String(text);
  const tag = element.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA')
    return insertIntoTextField(element, text);
  if (element.isContentEditable || isEditableHost(element))
    return insertIntoEditable(element, text, html);
  return false;
}

function insertIntoTextField(element, text) {
  const win = element.ownerDocument.defaultView || window;
  const doc = element.ownerDocument;
  const payload = element.tagName === 'INPUT' ? text.replace(/[\r\n]+/g, ' ') : text;
  if (doc.activeElement === element) {
    try { if (doc.execCommand('insertText', false, payload)) return true; }
    catch (_) { /* execCommand unsupported — fall through to manual value splice */ }
  }
  const start = element.selectionStart != null ? element.selectionStart : element.value.length;
  const end   = element.selectionEnd   != null ? element.selectionEnd   : element.value.length;
  const next  = element.value.slice(0, start) + payload + element.value.slice(end);
  setNativeValue(win, element, next);
  const caret = start + payload.length;
  try { element.setSelectionRange(caret, caret); }
  catch (_) { /* setSelectionRange unsupported for this input type (e.g. number) */ }
  dispatch(win, element, 'input',  { inputType: 'insertText', data: payload });
  dispatch(win, element, 'change');
  return true;
}

function insertIntoEditable(element, text, html) {
  const win = element.ownerDocument.defaultView || window;
  const doc = element.ownerDocument;
  const sel = doc.getSelection();
  if (html && insertHtmlAtSelection(win, doc, sel, element, html)) return true;
  if (doc.activeElement === element || element.contains(doc.activeElement)) {
    try {
      if (doc.execCommand('insertText', false, text)) {
        dispatch(win, element, 'input', { inputType: 'insertText', data: text });
        return true;
      }
    } catch (_) { /* execCommand unsupported — fall through to Range-based insert */ }
  }
  return insertPlainAtSelection(win, doc, sel, element, text);
}

function insertHtmlAtSelection(win, doc, sel, element, html) {
  const clean = sanitizeHtml(html, doc);
  try {
    if (doc.queryCommandSupported && doc.queryCommandSupported('insertHTML') &&
        doc.execCommand('insertHTML', false, clean)) {
      dispatch(win, element, 'input', { inputType: 'insertFromPaste' });
      return true;
    }
  } catch (_) { /* insertHTML unsupported — fall through to Range-based insert */ }
  if (!sel || !sel.rangeCount) return false;
  try {
    const range = sel.getRangeAt(0);
    range.deleteContents();
    const frag = range.createContextualFragment(clean);
    insertFragment(sel, range, frag);
    dispatch(win, element, 'input', { inputType: 'insertFromPaste' });
    return true;
  } catch (_) { return false; }
}

function insertPlainAtSelection(win, doc, sel, element, text) {
  if (!sel || !sel.rangeCount) return false;
  const range = sel.getRangeAt(0);
  range.deleteContents();
  const frag = doc.createDocumentFragment();
  text.split(/\r\n?|\n/).forEach((line, i) => {
    if (i) frag.appendChild(doc.createElement('br'));
    frag.appendChild(doc.createTextNode(line));
  });
  insertFragment(sel, range, frag);
  dispatch(win, element, 'input', { inputType: 'insertText', data: text });
  return true;
}

// Insert the fragment and collapse the selection after its last node.
function insertFragment(sel, range, frag) {
  const last = frag.lastChild;
  range.insertNode(frag);
  if (last) {
    range.setStartAfter(last); range.collapse(true);
    sel.removeAllRanges(); sel.addRange(range);
  }
}

// React/Vue-safe value assignment: native prototype setter + _valueTracker reset.
export function setNativeValue(win, element, value) {
  const proto = element.tagName === 'TEXTAREA'
    ? win.HTMLTextAreaElement.prototype
    : win.HTMLInputElement.prototype;
  const desc = Object.getOwnPropertyDescriptor(proto, 'value');
  const ownDesc = Object.getOwnPropertyDescriptor(element, 'value');
  const tracker = element._valueTracker;
  if (tracker) tracker.setValue(ownDesc ? ownDesc.value : '');
  if (desc && desc.set) desc.set.call(element, value);
  else element.value = value;
}

function dispatch(win, element, type, opts) {
  let evt;
  try {
    if (type === 'input' && opts && ('inputType' in opts || 'data' in opts)) {
      evt = new win.InputEvent('input', {
        bubbles: true, cancelable: false, composed: true,
        inputType: opts.inputType || 'insertText',
        data: 'data' in opts ? opts.data : null,
      });
    } else {
      evt = new win.Event(type, { bubbles: true, cancelable: false, composed: true });
    }
  } catch (_) { evt = new win.Event(type, { bubbles: true }); }
  element.dispatchEvent(evt);
}

function isEditableHost(el) {
  const ce = el.getAttribute && el.getAttribute('contenteditable');
  return ce === '' || ce === 'true' || (el.ownerDocument && el.ownerDocument.designMode === 'on');
}
