/* Source changes and lifecycle cleanup, separate from the image state machine. */
(function () {
  'use strict';
  function walkImages(root, callback) {
    if (!root) return;
    if (root.tagName === 'IMG') callback(root);
    if (!root.querySelectorAll) return;
    root.querySelectorAll('img').forEach(callback);
    root.querySelectorAll('*').forEach(function (node) {
      if (node.shadowRoot) walkImages(node.shadowRoot, callback);
    });
  }

  window.__atlasNsfwImageObserver = { walk: walkImages, connect: function (sourceChanged, cleanup) {
    new MutationObserver(function (mutations) {
      var removed = new Set();
      mutations.forEach(function (mutation) {
        if (mutation.type === 'attributes') {
          var target = mutation.target;
          if (target.tagName === 'IMG') sourceChanged(target, target, mutation.attributeName);
          else if (target.tagName === 'SOURCE' && target.parentElement && target.parentElement.tagName === 'PICTURE') {
            var image = target.parentElement.querySelector('img');
            if (image) sourceChanged(image, target, mutation.attributeName);
          }
        } else Array.prototype.forEach.call(mutation.removedNodes || [], function (node) {
          if (node.nodeType === 1) removed.add(node);
        });
      });
      removed.forEach(function (node) {
        if (!Array.from(removed).some(function (other) { return other !== node && other.contains(node); })) {
          walkImages(node, function (img) { if (!img.isConnected) cleanup(img); });
        }
      });
    }).observe(document.documentElement || document, { childList: true, subtree: true, attributes: true,
      attributeFilter: ['srcset', 'sizes', 'media', 'type', 'data-src', 'data-srcset', 'data-original', 'data-thumb'] });
  } };
})();
