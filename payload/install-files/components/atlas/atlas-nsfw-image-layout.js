/* Event-driven geometry for baked-in status pixels and invisible retry controls. */
(function () {
  'use strict';
  var items = new Set(), motions = new Set(), frame = null, observing = false;
  function schedule() { if (items.size && frame === null) frame = requestAnimationFrame(positionAll); }
  var resize = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null;
  var intersection = typeof IntersectionObserver === 'function' ? new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      items.forEach(function (ui) { if (ui.img === entry.target) ui.visible = entry.isIntersecting; });
    });
    schedule();
  }) : null;
  var changes = new MutationObserver(function (records) {
    if (records.some(function (record) {
      var target = record.target;
      return !(target.closest && target.closest('[data-atlas-nsfw-overlay]'));
    })) schedule();
  });
  var shifts = typeof PerformanceObserver === 'function' ? new PerformanceObserver(schedule) : null;
  function start() {
    if (observing) return;
    observing = true;
    changes.observe(document.documentElement || document, { childList: true, subtree: true,
      attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
    if (resize && document.documentElement) resize.observe(document.documentElement);
    if (resize && document.body) resize.observe(document.body);
    if (shifts) { try { shifts.observe({ type: 'layout-shift', buffered: false }); } catch (e) { /* optional */ } }
  }
  function position(ui) {
    if (!ui.img.isConnected || ui.visible === false) { ui.host.style.visibility = 'hidden'; return; }
    ui.host.style.visibility = 'visible';
    var rect = ui.img.getBoundingClientRect();
    if (ui.button) {
      var values = { left: rect.left + 'px', top: rect.top + 'px', width: rect.width + 'px', height: rect.height + 'px' };
      Object.keys(values).forEach(function (name) { if (ui.host.style[name] !== values[name]) ui.host.style[name] = values[name]; });
    }
    if (ui.host.__atlasRefresh) ui.host.__atlasRefresh(rect);
  }
  function positionAll() {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    items.forEach(position);
    if (motions.size) schedule();
  }
  function track(ui) {
    items.add(ui); start();
    if (resize) resize.observe(ui.img);
    if (intersection) intersection.observe(ui.img);
    schedule();
  }
  function untrack(ui) {
    items.delete(ui);
    if (resize) resize.unobserve(ui.img);
    if (intersection) intersection.unobserve(ui.img);
    if (!items.size) {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null; motions.clear(); changes.disconnect(); if (resize) resize.disconnect(); if (shifts) shifts.disconnect(); observing = false;
    }
  }
  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function positionFraction(value) {
    if (value === 'left' || value === 'top') return 0;
    if (value === 'right' || value === 'bottom') return 1;
    if (value === 'center') return 0.5;
    return /%$/.test(value) ? parseFloat(value) / 100 : 0.5;
  }

  // Map the visible image area back to the clean blurred raster. This keeps
  // the text centered when the site crops with object-fit/object-position.
  function imageGeometry(img, base, rect) {
    var style = getComputedStyle(img);
    var width = img.clientWidth || rect.width;
    var height = img.clientHeight || rect.height;
    var paddingX = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
    var paddingY = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
    width = Math.max(1, width - paddingX);
    height = Math.max(1, height - paddingY);
    var sx = width / base.naturalWidth;
    var sy = height / base.naturalHeight;
    var fit = style.objectFit || 'fill';
    if (fit === 'cover' || fit === 'contain' || fit === 'scale-down' || fit === 'none') {
      var scale = fit === 'cover' ? Math.max(sx, sy) : Math.min(sx, sy);
      if (fit === 'none') scale = 1;
      if (fit === 'scale-down') scale = Math.min(1, scale);
      sx = sy = scale;
    }
    sx = Math.max(sx, 0.0001);
    sy = Math.max(sy, 0.0001);
    var parts = (style.objectPosition || '50% 50%').split(/\s+/);
    var ox = (width - base.naturalWidth * sx) * positionFraction(parts[0]);
    var oy = (height - base.naturalHeight * sy) * positionFraction(parts[1] || '50%');
    var left = Math.max(0, ox), top = Math.max(0, oy);
    var right = Math.min(width, ox + base.naturalWidth * sx);
    var bottom = Math.min(height, oy + base.naturalHeight * sy);
    var cx = (left + Math.max(left, right)) / 2;
    var cy = (top + Math.max(top, bottom)) / 2;
    return {
      sx: sx, sy: sy, x: (cx - ox) / sx, y: (cy - oy) / sy,
      visibleWidth: Math.max(1, right - left), visibleHeight: Math.max(1, bottom - top),
      screenX: ((img.clientLeft || 0) + (parseFloat(style.paddingLeft) || 0) + cx) * (rect.width / (img.offsetWidth || rect.width || 1)),
      screenY: ((img.clientTop || 0) + (parseFloat(style.paddingTop) || 0) + cy) * (rect.height / (img.offsetHeight || rect.height || 1)),
      screenScaleX: rect.width / (img.offsetWidth || rect.width || 1),
      screenScaleY: rect.height / (img.offsetHeight || rect.height || 1),
      width: width, height: height, fit: fit, objectPosition: style.objectPosition
    };
  }

  function clipBounds(img, rect) {
    var bounds = { left: Math.max(0, rect.left), top: Math.max(0, rect.top),
      right: Math.min(window.innerWidth, rect.left + rect.width),
      bottom: Math.min(window.innerHeight, rect.top + rect.height) };
    var node = img;
    while (node) {
      node = node.parentElement || (node.getRootNode && node.getRootNode().host);
      if (!node || node === document.documentElement) break;
      var style = getComputedStyle(node);
      var clipX = /^(auto|scroll|hidden|clip)$/.test(style.overflowX);
      var clipY = /^(auto|scroll|hidden|clip)$/.test(style.overflowY);
      if (clipX || clipY) {
        var parent = node.getBoundingClientRect();
        if (clipX) { bounds.left = Math.max(bounds.left, parent.left); bounds.right = Math.min(bounds.right, parent.right); }
        if (clipY) { bounds.top = Math.max(bounds.top, parent.top); bounds.bottom = Math.min(bounds.bottom, parent.bottom); }
      }
    }
    return bounds;
  }


  function renderScale(base, geo) {
    var density = Math.max(geo.sx * geo.screenScaleX, geo.sy * geo.screenScaleY) * (window.devicePixelRatio || 1);
    return Math.min(clamp(density, 0.125, 4), 2048 / Math.max(base.naturalWidth, base.naturalHeight),
      Math.sqrt(2097152 / (base.naturalWidth * base.naturalHeight)));
  }
  window.__atlasNsfwImageLayout = { geometry: imageGeometry, clipBounds: clipBounds, scale: renderScale,
    track: track, untrack: untrack, position: position, positionAll: positionAll, schedule: schedule };
  ['transitionrun', 'animationstart', 'transitionend', 'transitioncancel', 'animationend', 'animationcancel'].forEach(function (event) {
    window.addEventListener(event, function (e) {
      if (!Array.from(items).some(function (ui) { return e.target === ui.img || (e.target.contains && e.target.contains(ui.img)); })) return;
      var key = e.target;
      if (event === 'transitionrun' || event === 'animationstart') motions.add(key); else motions.delete(key);
      schedule();
    }, true);
  });
  ['scroll', 'resize', 'load', 'transitionend', 'animationend'].forEach(function (event) {
    window.addEventListener(event, schedule, true);
  });
})();
