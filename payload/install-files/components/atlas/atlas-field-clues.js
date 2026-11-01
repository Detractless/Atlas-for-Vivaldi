/* Field clues for Autofill: the fields a page has, and one short line of clues per field for the autofill model to read.
   The same file runs in the Autofill content script and in the training script (over saved pages in jsdom), so the model
   learns from exactly the lines it will read on real pages. Only what a person sees, or the page's own names for the
   field, goes in: its kind, label, placeholder, the text beside it or just before it, its name and id as words, a
   select's first options, the section heading above it and a short maxlength. Never the field's value, never data-*
   attributes, and never its autocomplete attribute: Autofill reads that one itself, and the model must work without it.
   Works on the page and inside open shadow roots. No layout is used (jsdom has none), only the order of the page. */
(function (root) {
  'use strict';
  var SKIP_TYPES = { hidden: 1, submit: 1, button: 1, image: 1, reset: 1, file: 1, checkbox: 1, radio: 1, range: 1, color: 1 };
  var NO_TEXT = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEMPLATE: 1, SELECT: 1, OPTION: 1, TEXTAREA: 1, BUTTON: 1 };
  var HEADING = { H1: 1, H2: 1, H3: 1, H4: 1, H5: 1, H6: 1, LEGEND: 1 };
  var FIELD_SEL = 'input, select, textarea';
  var MAX_LINE = 300, MAX_CLIMB = 6, MAX_STEPS = 300;
  /* Most useful first: when a line is too long, parts drop from the end. */
  var ORDER = ['kind', 'label', 'placeholder', 'near', 'before', 'name', 'id', 'options', 'section', 'max'];

  function squash(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }
  function words(s, max) { return squash(s).split(' ').filter(Boolean).slice(0, max).join(' '); }

  /* billing_firstName -> "billing first name". Machine ids keep only their letter runs, so most of them fade away. */
  function idWords(s) {
    var out = [];
    String(s || '').replace(/([a-z])([A-Z])/g, '$1 $2').split(/[^A-Za-z\u00C0-\uFFFF]+/).forEach(function (w) {
      w = w.toLowerCase();
      if (w.length > 1 && out.indexOf(w) < 0) out.push(w);
    });
    return out.slice(0, 6).join(' ');
  }

  function kindOf(el) {
    var tag = el.tagName.toLowerCase();
    return tag === 'input' ? (el.getAttribute('type') || 'text').toLowerCase() : tag;
  }
  function isField(el) { return !SKIP_TYPES[kindOf(el)]; }

  /* Every fillable field in `root` (a document, element or shadow root), open shadow roots included, in page order.
     Hidden ones too, unless `visible` says no: saved pages hide whole checkout steps, and a styled drop-down keeps its real
     <select> hidden behind it, so what is hidden is the content script's call on the live page, not this file's. */
  function fieldsIn(rootNode, visible) {
    var out = [];
    (function walk(node) {
      Array.prototype.forEach.call(node.querySelectorAll('*'), function (el) {
        if (el.matches(FIELD_SEL) && isField(el) && !el.disabled && (!visible || visible(el))) out.push(el);
        if (el.shadowRoot) walk(el.shadowRoot);
      });
    })(rootNode);
    return out;
  }

  /* The text a person reads inside `node`, without scripts, styles, option lists or buttons. */
  function textOf(node) {
    if (node.nodeType === 3) return node.nodeValue;
    if ((node.nodeType !== 1 && node.nodeType !== 11) || NO_TEXT[node.tagName]) return '';
    var s = '';
    for (var c = node.firstChild; c; c = c.nextSibling) s += ' ' + textOf(c);
    return s;
  }

  function labelOf(el) {
    var doc = el.getRootNode ? el.getRootNode() : el.ownerDocument, parts = [];
    (el.getAttribute('aria-labelledby') || '').split(/\s+/).forEach(function (id) {
      var n = id && doc.getElementById ? doc.getElementById(id) : null;
      if (n) parts.push(textOf(n));
    });
    if (el.labels) Array.prototype.forEach.call(el.labels, function (l) { parts.push(textOf(l)); });
    if (!squash(parts.join(' '))) parts = [el.getAttribute('aria-label') || el.getAttribute('title') || ''];
    return words(parts.join(' '), 12);
  }

  /* The largest box around the field that holds no other field: its own row, cell or wrapper. */
  function ownBox(el) {
    var box = el;
    for (var i = 0; i < MAX_CLIMB; i++) {
      var up = box.parentElement;
      if (!up || up.tagName === 'FORM' || up.tagName === 'BODY') break;
      var n = Array.prototype.filter.call(up.querySelectorAll(FIELD_SEL), isField).length;
      if (n > 1) break;
      box = up;
    }
    return box;
  }

  /* Text between the previous field and `box`, walking back through the page from it. */
  function textBefore(box, maxWords) {
    var doc = box.ownerDocument, walker = doc.createTreeWalker(doc.body || doc.documentElement, 1 | 4 /* elements, text */);
    walker.currentNode = box;
    var got = [], steps = 0;
    while (got.length < maxWords && steps++ < MAX_STEPS && walker.previousNode()) {
      var node = walker.currentNode;
      if (node.nodeType === 1) { if (node.matches(FIELD_SEL) && isField(node)) break; continue; }   // the field before: its words are its own
      var p = node.parentElement;
      if (p && p.closest('script, style, noscript, template, option, select, textarea, button')) continue;
      got = squash(node.nodeValue).split(' ').filter(Boolean).concat(got);
    }
    return got.slice(-maxWords).join(' ');
  }

  /* The closest heading (h1-h6, legend, role=heading) above the field. */
  function sectionOf(box) {
    var doc = box.ownerDocument, walker = doc.createTreeWalker(doc.body || doc.documentElement, 1 /* elements */);
    walker.currentNode = box;
    for (var steps = 0; steps < MAX_STEPS && walker.previousNode(); steps++) {
      var n = walker.currentNode;
      if (HEADING[n.tagName] || n.getAttribute('role') === 'heading') { var t = words(textOf(n), 6); if (t) return t; }
    }
    return '';
  }

  function optionsOf(el) {
    if (el.tagName !== 'SELECT') return '';
    var out = [];
    Array.prototype.some.call(el.options, function (o) {
      var t = words(o.textContent, 3);
      if (t) out.push(t);
      return out.length >= 4;
    });
    return out.join(', ');
  }

  function without(text, gone) {
    var t = squash(text);
    return gone ? squash(t.split(gone).join(' ')) : t;
  }

  /* The clues for one field, as an object. `autocomplete` rides along for Autofill's own rules; it never goes in the line. */
  function cluesFor(el) {
    var box = ownBox(el), label = labelOf(el);
    var placeholder = words(el.getAttribute('placeholder'), 8);
    var near = box === el ? '' : words(without(without(textOf(box), label), placeholder), 10);
    var name = idWords(el.getAttribute('name')), id = idWords(el.id);
    var max = parseInt(el.getAttribute('maxlength'), 10);
    return {
      kind: kindOf(el), label: label, placeholder: placeholder, near: near,
      before: label || near ? '' : textBefore(box, 6),
      name: name === label.toLowerCase() ? '' : name,
      id: id === name ? '' : id,
      options: optionsOf(el), section: sectionOf(box),
      max: max > 0 && max <= 10 ? String(max) : '',
      autocomplete: squash(el.getAttribute('autocomplete')).toLowerCase()
    };
  }

  /* One line: "kind text · label First Name · name first name · section Shipping". At most MAX_LINE characters. */
  function clueLine(elOrClues) {
    var c = elOrClues && elOrClues.nodeType ? cluesFor(elOrClues) : elOrClues;
    var parts = ORDER.filter(function (k) { return c[k]; }).map(function (k) { return k + ' ' + c[k]; });
    while (parts.length > 2 && parts.join(' · ').length > MAX_LINE) parts.pop();
    return parts.join(' · ').slice(0, MAX_LINE);
  }

  var api = { fieldsIn: fieldsIn, cluesFor: cluesFor, clueLine: clueLine, idWords: idWords };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.__atlasFieldClues = api;
})(typeof window !== 'undefined' ? window : this);
