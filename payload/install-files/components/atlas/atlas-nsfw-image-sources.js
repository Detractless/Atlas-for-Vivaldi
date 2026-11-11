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
  function isReplacement(states, img) {
    var state = states.get(img); return !!(state && state.previewData && img.getAttribute('src') === state.previewData);
  }

  function mutationSnapshot(img, state, changedNode, attributeName) {
    var fresh = capture(img), old = state.original;
    if (!old) return fresh;
    attrs.forEach(function (name) {
      if (changedNode === img && name === attributeName) return;
      if (!changedNode && name === 'src' && fresh.attrs.src.value !== state.previewData) return;
      if (old.attrs[name]) fresh.attrs[name] = old.attrs[name];
    });
    fresh.sources = fresh.sources.map(function (entry) {
      var prior = old.sources.find(function (candidate) { return candidate.node === entry.node; });
      if (!prior) return entry;
      sourceAttrs.forEach(function (name) {
        if (changedNode === entry.node && name === attributeName) return;
        entry.attrs[name] = prior.attrs[name];
      });
      return entry;
    });
    return fresh;
  }

  function savedAttribute(state, node, name) {
    if (node === state.img) return state.original && state.original.attrs[name];
    var entry = state.original && state.original.sources.find(function (candidate) { return candidate.node === node; });
    return entry && entry.attrs[name];
  }

  function srcsetCandidate(value) {
    if (!value) return '';
    var first = String(value).split(',')[0].trim(); return first ? first.split(/\s+/)[0] : '';
  }

  function sourceChanged(states, log, begin, img, changedNode, attributeName) {
    if (changedNode && attributeName && consumeOwnChange(changedNode, attributeName)) return true;
    if (!img || !img.isConnected) return false;
    var state = states.get(img);
    if (!state) return false;
    if (state.phase === 'sfw' && !changedNode) return true;
    var previousAttribute = changedNode && attributeName ? savedAttribute(state, changedNode, attributeName) : null;
    var currentAttribute = changedNode && attributeName && changedNode.hasAttribute(attributeName) ? changedNode.getAttribute(attributeName) : null;
    var mutationValueChanged = !!(previousAttribute && (previousAttribute.present !== changedNode.hasAttribute(attributeName) || previousAttribute.value !== currentAttribute));
    if (state.phase === 'sfw' && changedNode && attributeName && previousAttribute && !mutationValueChanged) return true;
    var sourceStillCleared = isReplacement(states, img) && !img.getAttribute('srcset') && !img.getAttribute('data-srcset') && !img.getAttribute('data-src') && !img.getAttribute('data-original') && !img.getAttribute('data-thumb') && state.original.sources.every(function (entry) {
      return !entry.node.isConnected || (!entry.node.getAttribute('srcset') && !entry.node.getAttribute('data-srcset'));
    });
    if (sourceStillCleared && (!changedNode || (changedNode === img && attributeName === 'src' && img.getAttribute('src') === state.previewData) || (changedNode && (attributeName === 'srcset' || attributeName === 'data-srcset' || attributeName === 'data-src' || attributeName === 'data-original' || attributeName === 'data-thumb')))) return true;
    if (state.phase === 'new') return false;
    if (attributeName === 'sizes') return true;
    var originalOverride = mutationSnapshot(img, state, changedNode, attributeName);
    var src = img.currentSrc || img.getAttribute('src') || img.getAttribute('data-src') || img.getAttribute('data-original') || '';
    if (changedNode === img && attributeName === 'src') src = img.getAttribute('src') || src;
    if (changedNode && attributeName === 'srcset') {
      var changedSet = changedNode.getAttribute('srcset');
      if (changedNode === img) src = srcsetCandidate(changedSet) || src;
      else if (changedNode.tagName === 'SOURCE') src = img.currentSrc && img.currentSrc !== state.previewData ? img.currentSrc : (srcsetCandidate(changedSet) || src);
    }
    var replacementChanged = !!(state.previewData && isReplacement(states, img) && !sourceStillCleared);
    if (src === state.source && !replacementChanged && !(state.previewData && !isReplacement(states, img)) && !mutationValueChanged) return true;
    log('ui.source-change', { kind: 'img', attribute: attributeName || 'currentSrc', requestId: state.requestId, url: state.source });
    img.style.setProperty('visibility', 'hidden', 'important');
    state.needsRestore = !!state.previewData;
    begin(img, src, true, originalOverride);
    return true;
  }

  function createMonitor(states, log, begin) {
    return {
      isReplacement: function (img) { return isReplacement(states, img); },
      sourceChanged: function (img, changedNode, attributeName) { return sourceChanged(states, log, begin, img, changedNode, attributeName); }
    };
  }
  window.__atlasNsfwImageSources = { capture: capture, restore: restore, mask: mask,
    consumeOwnChange: consumeOwnChange, attributes: attrs, sourceAttributes: sourceAttrs,
    createMonitor: createMonitor };
})();
