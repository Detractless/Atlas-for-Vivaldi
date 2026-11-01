/* Batch overlapping DOM work once per task; stop observing removed elements. */
(function () {
  'use strict';
  window.__atlasNsfwGuardWatch = {
    create: function (callbacks) {
      var roots = new Set(), attributes = new Map(), backgrounds = new Set(), removed = new Set();
      var registered = new WeakSet(), timer = null;
      function schedule() { if (timer === null) timer = setTimeout(flush, 0); }
      function outermost(nodes, callback) {
        nodes.forEach(function (node) {
          if (!Array.from(nodes).some(function (other) { return other !== node && other.contains(node); })) callback(node);
        });
      }
      function flush() {
        timer = null;
        var added = roots, changed = attributes, bg = backgrounds, gone = removed;
        roots = new Set(); attributes = new Map(); backgrounds = new Set(); removed = new Set();
        outermost(gone, function (node) {
          if (node.isConnected || !intersection) return;
          intersection.unobserve(node); registered.delete(node);
          node.querySelectorAll('*').forEach(function (child) { intersection.unobserve(child); registered.delete(child); });
        });
        outermost(added, function (node) { if (node.isConnected) callbacks.added(node); });
        changed.forEach(function (names, node) {
          if (!node.isConnected) return;
          names.forEach(function (name) { if (name === 'style') bg.add(node); else callbacks.attribute(node, name); });
        });
        bg.forEach(function (node) { if (node.isConnected) callbacks.background(node); });
      }
      var intersection = typeof IntersectionObserver === 'function' ? new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) { if (entry.isIntersecting) backgrounds.add(entry.target); }); schedule();
      }, { rootMargin: '300px' }) : null;
      var observer = new MutationObserver(function (records) {
        records.forEach(function (record) {
          if (record.target.closest && record.target.closest('[data-atlas-nsfw-overlay]')) return;
          if (record.type === 'attributes') {
            var names = attributes.get(record.target) || new Set(); names.add(record.attributeName); attributes.set(record.target, names);
          } else {
            Array.prototype.forEach.call(record.addedNodes, function (node) { if (node.nodeType === 1) roots.add(node); });
            Array.prototype.forEach.call(record.removedNodes, function (node) { if (node.nodeType === 1) removed.add(node); });
          }
        });
        schedule();
      });
      observer.observe(document.documentElement || document, { childList: true, subtree: true, attributes: true,
        attributeFilter: ['src', 'poster', 'style', 'data-src', 'data-thumb', 'data-original'] });
      document.addEventListener('load', callbacks.load, true);
      return {
        backgrounds: intersection ? { observe: function (node) {
          if (!registered.has(node) && !node.hasAttribute('data-atlas-nsfw-overlay')) { registered.add(node); intersection.observe(node); }
        }, disconnect: function () { intersection.disconnect(); } } : null,
        disconnect: function () {
          observer.disconnect(); if (intersection) intersection.disconnect();
          document.removeEventListener('load', callbacks.load, true);
          if (timer !== null) clearTimeout(timer);
          roots.clear(); attributes.clear(); backgrounds.clear(); removed.clear();
        }
      };
    }
  };
})();
