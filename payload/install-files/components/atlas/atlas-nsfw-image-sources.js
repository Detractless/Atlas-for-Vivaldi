/* Original source metadata and ownership of Atlas's attribute mutations. */
(function () {
  'use strict';
  if (window.__atlasNsfwImageSources) return;
  var attrs = ['src', 'srcset', 'sizes', 'data-src', 'data-srcset', 'data-original', 'data-thumb'];
  var sourceAttrs = ['srcset', 'data-srcset', 'sizes', 'media', 'type'];
  var writes = new WeakMap();
  function write(node, name, saved) {
    var value = saved.present ? String(saved.value == null ? '' : saved.value) : null;
    if (node.getAttribute(name) === value) return;
    var own = writes.get(node) || {}, prior = own[name];
    own[name] = { value: value, count: prior ? prior.count + 1 : 1 };
    writes.set(node, own);
    if (saved.present) node.setAttribute(name, value); else node.removeAttribute(name);
  }
  function consumeOwnChange(node, name) {
    var own = writes.get(node), expected = own && own[name];
    if (!expected) return false;
    var matches = node.getAttribute(name) === expected.value;
    if (!matches || --expected.count <= 0) delete own[name];
    return matches;
  }
  function capture(img) {
    var saved = {}, picture = img.parentElement && img.parentElement.tagName === 'PICTURE' ? img.parentElement : null;
    attrs.forEach(function (name) { saved[name] = { present: img.hasAttribute(name), value: img.getAttribute(name) }; });
    var nodes = picture ? Array.prototype.slice.call(picture.querySelectorAll('source')) : [];
    return { attrs: saved, sources: nodes.map(function (node) {
      var values = {};
      sourceAttrs.forEach(function (name) { values[name] = { present: node.hasAttribute(name), value: node.getAttribute(name) }; });
      return { node: node, attrs: values };
    }), visibility: img.style.getPropertyValue('visibility'), visibilityPriority: img.style.getPropertyPriority('visibility'),
    hadWidth: img.hasAttribute('width'), hadHeight: img.hasAttribute('height'), width: img.naturalWidth || 0, height: img.naturalHeight || 0 };
  }
  function restore(state) {
    state.original.sources.forEach(function (entry) {
      if (entry.node.isConnected) sourceAttrs.forEach(function (name) { write(entry.node, name, entry.attrs[name]); });
    });
    attrs.forEach(function (name) { write(state.img, name, state.original.attrs[name]); });
  }
  function mask(state) {
    state.original.sources.forEach(function (entry) {
      ['srcset', 'data-srcset'].forEach(function (name) { write(entry.node, name, { present: false }); });
    });
    ['srcset', 'data-srcset', 'data-src', 'data-original', 'data-thumb'].forEach(function (name) {
      write(state.img, name, { present: false });
    });
  }
  window.__atlasNsfwImageSources = { capture: capture, restore: restore, mask: mask,
    consumeOwnChange: consumeOwnChange, attributes: attrs, sourceAttributes: sourceAttrs };
})();
