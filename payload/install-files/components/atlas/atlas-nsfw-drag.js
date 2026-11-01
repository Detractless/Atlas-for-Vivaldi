/* ── atlas-nsfw-drag.js: stops a drag that would expose unverified or flagged media's
   original (drag preview, link drag, drag into another window). ── */

(function () {
  'use strict';
  if (window.__atlasNsfwDrag) return;
  window.__atlasNsfwDrag = true;

  var STYLE_ID = 'atlas-nsfw-drag-style';
  var BLOCKED = 'img[data-nsfw-flagged="1"],video[data-nsfw-flagged="1"],' +
    'img[data-nsfw-filter-status="processing"],video[data-nsfw-filter-status="processing"]';

  function insideBlocked(node) {
    if (!node || node.nodeType !== 1) return false;
    if (node.closest && node.closest(BLOCKED)) return true;
    var link = node.closest ? node.closest('a') : null;
    if (link && link.querySelector(BLOCKED)) return true;
    return !!(node.querySelector && node.querySelector(BLOCKED));
  }

  document.addEventListener('dragstart', function (e) {
    var path = e.composedPath ? e.composedPath() : null;
    if (!insideBlocked(path && path.length ? path[0] : e.target)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
  }, true);

  function inject() {
    if (document.getElementById(STYLE_ID) || !document.head) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = BLOCKED + '{-webkit-user-drag:none;user-select:none}';
    document.head.appendChild(style);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', inject);
  else inject();
})();
