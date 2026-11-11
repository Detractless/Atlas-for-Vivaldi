/* Batch overlapping DOM work once per task; stop observing removed elements. */
(function () {
  'use strict';

  function outermost(nodes, callback) {
    nodes.forEach(function (node) {
      if (!Array.from(nodes).some(function (other) { return other !== node && other.contains(node); })) callback(node);
    });
  }

  /* One flush per task: take the queued work, reset the queues, report it. */
  function makeFlush(state, callbacks) {
    return function flush() {
      state.timer = null;
      var added = state.roots, changed = state.attributes, bg = state.backgrounds, gone = state.removed;
      state.roots = new Set(); state.attributes = new Map(); state.backgrounds = new Set(); state.removed = new Set();
      var intersection = state.intersection, registered = state.registered;
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
    };
  }

  /* Mutations arrive in bursts; one timer per task keeps the work bounded. */
  function makeScheduler(state, flush) {
    return function schedule() { if (state.timer === null) state.timer = setTimeout(flush, 0); };
  }

  function makeIntersection(state, schedule) {
    if (typeof IntersectionObserver !== 'function') return null;
    return new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) { if (entry.isIntersecting) state.backgrounds.add(entry.target); });
      schedule();
    }, { rootMargin: '300px' });
  }

  function makeObserver(state, schedule) {
    return new MutationObserver(function (records) {
      records.forEach(function (record) {
        if (record.target.closest && record.target.closest('[data-atlas-nsfw-overlay]')) return;
        if (record.type === 'attributes') {
          var names = state.attributes.get(record.target) || new Set();
          names.add(record.attributeName);
          state.attributes.set(record.target, names);
        } else {
          Array.prototype.forEach.call(record.addedNodes, function (node) { if (node.nodeType === 1) state.roots.add(node); });
          Array.prototype.forEach.call(record.removedNodes, function (node) { if (node.nodeType === 1) state.removed.add(node); });
        }
      });
      schedule();
    });
  }

  /* Observe an image's background only once, and never one of our own overlays. */
  function makeBackgroundsApi(state) {
    var intersection = state.intersection;
    if (!intersection) return null;
    return {
      observe: function (node) {
        if (!state.registered.has(node) && !node.hasAttribute('data-atlas-nsfw-overlay')) {
          state.registered.add(node);
          intersection.observe(node);
        }
      },
      disconnect: function () { intersection.disconnect(); }
    };
  }

  function makeHandle(state, observer, callbacks) {
    return {
      backgrounds: makeBackgroundsApi(state),
      disconnect: function () {
        observer.disconnect();
        if (state.intersection) state.intersection.disconnect();
        document.removeEventListener('load', callbacks.load, true);
        if (state.timer !== null) clearTimeout(state.timer);
        state.roots.clear(); state.attributes.clear(); state.backgrounds.clear(); state.removed.clear();
      }
    };
  }

  window.__atlasNsfwGuardWatch = {
    create: function (callbacks) {
      var state = {
        roots: new Set(), attributes: new Map(), backgrounds: new Set(), removed: new Set(),
        registered: new WeakSet(), timer: null, intersection: null
      };
      var flush = makeFlush(state, callbacks);
      var schedule = makeScheduler(state, flush);
      state.intersection = makeIntersection(state, schedule);
      var observer = makeObserver(state, schedule);
      observer.observe(document.documentElement || document, { childList: true, subtree: true, attributes: true,
        attributeFilter: ['src', 'poster', 'style', 'data-src', 'data-thumb', 'data-original'] });
      document.addEventListener('load', callbacks.load, true);
      return makeHandle(state, observer, callbacks);
    }
  };
})();
