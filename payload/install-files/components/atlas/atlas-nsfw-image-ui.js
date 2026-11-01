/* Image-centered status drawn into the blurred replacement, with an accessible
   invisible retry control. The original image is never used for this UI. */
(function () {
  'use strict';
  if (window.__atlasNsfwImageShieldUi) return;

  var layout = window.__atlasNsfwImageLayout;
  if (!layout) return;
  var paintCanvas = null;
  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

  function wrapText(ctx, text, maxWidth) {
    var lines = [], line = '';
    String(text || '').trim().split(/\s+/).forEach(function (word) {
      var parts = [], part = '';
      for (var char of word) {
        if (part && ctx.measureText(part + char).width > maxWidth) { parts.push(part); part = ''; }
        part += char;
      }
      if (part) parts.push(part);
      parts.forEach(function (value) {
        var next = line ? line + ' ' + value : value;
        if (line && ctx.measureText(next).width > maxWidth) { lines.push(line); line = value; }
        else line = next;
      });
    });
    if (line) lines.push(line);
    return lines;
  }

  function statusLayout(ctx, top, bottom, width, height) {
    var size = clamp(Math.min(width / 9, height / 4), 9, 18), layout;
    do {
      var secondary = Math.max(8, size * 0.8);
      ctx.font = '600 ' + size + 'px system-ui, sans-serif';
      var first = wrapText(ctx, top, width);
      ctx.font = '500 ' + secondary + 'px system-ui, sans-serif';
      var second = bottom ? wrapText(ctx, bottom, width) : [];
      var firstStep = size * 1.2, secondStep = secondary * 1.2;
      var total = first.length * firstStep + (second.length ? 4 + second.length * secondStep : 0);
      layout = { size: size, secondary: secondary, first: first, second: second,
        firstStep: firstStep, secondStep: secondStep, height: total };
      size = Math.max(9, size - 1);
    } while (layout.height > height && size >= 9 && layout.size > 9);
    return layout;
  }

  function buildUi(img, updatePreview) {
    var host = document.createElement('div');
    host.setAttribute('data-atlas-nsfw-overlay', '1');
    host.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;z-index:2147483646;pointer-events:none;margin:0;padding:0;border:0;';
    host.__atlasTarget = img;
    var root = host.attachShadow({ mode: 'closed' });
    var style = document.createElement('style');
    style.textContent = ':host{all:initial}.frame{position:absolute;inset:0;display:grid;place-items:center;pointer-events:none;font:13px/1.35 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}' +
      '.fallback{display:none}.fallback.fade{opacity:0}.fallback.burned{visibility:hidden}' +
      '.fallback-label{font-weight:600}.fallback-action{font-weight:500;margin-top:6px}' +
      '.hit{position:absolute;transform:translate(-50%,-50%);min-width:44px;min-height:44px;border:0;padding:0;background:transparent;color:transparent;cursor:pointer;pointer-events:auto}' +
      '.hit:focus-visible{outline:2px solid #f0cc48;outline-offset:2px;border-radius:4px}.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}';
    var frame = document.createElement('div');
    frame.className = 'frame';
    var fallback = document.createElement('div');
    fallback.className = 'fallback';
    fallback.setAttribute('aria-hidden', 'true');
    var label = document.createElement('div');
    label.className = 'fallback-label';
    var fallbackAction = document.createElement('div');
    fallbackAction.className = 'fallback-action';
    fallback.appendChild(label);
    fallback.appendChild(fallbackAction);
    var live = document.createElement('span');
    live.className = 'sr';
    live.setAttribute('role', 'status');
    live.setAttribute('aria-live', 'polite');
    frame.appendChild(fallback);
    frame.appendChild(live);
    root.appendChild(style);
    root.appendChild(frame);
    (document.documentElement || document).appendChild(host);
    return { img: img, updatePreview: updatePreview, host: host, frame: frame,
      fallback: fallback, label: label, fallbackAction: fallbackAction, live: live,
      base: null, canvas: null, button: null, action: null, current: null,
      destroyed: false, previewGeneration: 0, fadeTimers: [], opacity: 1, lastGeometry: '' };
  }

  function cancelFade(ui) {
    ui.fadeTimers.forEach(clearTimeout);
    ui.fadeTimers = [];
  }

  function layoutButton(ui, geo, rect) {
    if (!ui.button) return;
    var x = geo.screenX;
    var y = geo.screenY + Math.min(17, geo.visibleHeight * 0.12) * geo.screenScaleY;
    var width = Math.max(44, Math.min(geo.visibleWidth * geo.screenScaleX, 170));
    var height = Math.max(44, Math.min(geo.visibleHeight * geo.screenScaleY, 44));
    ui.button.style.left = x + 'px';
    ui.button.style.top = y + 'px';
    ui.button.style.width = width + 'px';
    ui.button.style.height = height + 'px';
    var bounds = layout.clipBounds(ui.img, rect);
    var left = rect.left + x - width / 2, top = rect.top + y - height / 2;
    var clippedLeft = Math.max(0, bounds.left - left);
    var clippedTop = Math.max(0, bounds.top - top);
    var clippedRight = Math.max(0, left + width - bounds.right);
    var clippedBottom = Math.max(0, top + height - bounds.bottom);
    var hidden = clippedLeft + clippedRight >= width || clippedTop + clippedBottom >= height;
    ui.button.style.visibility = hidden ? 'hidden' : 'visible';
    ui.button.style.clipPath = 'inset(' + clippedTop + 'px ' + clippedRight + 'px ' + clippedBottom + 'px ' + clippedLeft + 'px)';
  }

  function drawStatus(ctx, canvas, geo, current, opacity, scale) {
    var maxWidth = Math.max(1, geo.visibleWidth - 16), maxHeight = Math.max(1, geo.visibleHeight - 12);
    var layout = statusLayout(ctx, current.text, current.actionText ? '↻  ' + current.actionText : '', maxWidth, maxHeight);
    ctx.font = '600 ' + layout.size + 'px system-ui, sans-serif'; var widest = 0;
    layout.first.concat(layout.second).forEach(function (line) { widest = Math.max(widest, ctx.measureText(line).width); });
    var textWidth = Math.min(maxWidth, widest + 16), textHeight = layout.height + 12;
    var ink = { color: '#141412', rgb: '255,255,255' };
    ctx.save();
    try {
      ctx.translate(geo.x * scale, geo.y * scale);
      ctx.scale(scale / geo.sx, scale / geo.sy);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.globalAlpha = opacity;
      var radius = Math.max(textWidth * 0.75, textHeight * 0.75);
      var gradient = ctx.createRadialGradient(0, 0, radius * 0.40, 0, 0, radius);
      gradient.addColorStop(0, 'rgba(' + ink.rgb + ',0.88)');
      gradient.addColorStop(1, 'rgba(' + ink.rgb + ',0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(-radius, -radius, radius * 2, radius * 2);
      ctx.fillStyle = ink.color;
      ctx.shadowColor = ink.rgb === '255,255,255' ? 'rgba(0,0,0,.8)' : 'rgba(255,255,255,.8)';
      ctx.shadowBlur = 4;
      var y = -layout.height / 2;
      ctx.font = '600 ' + layout.size + 'px system-ui, sans-serif';
      layout.first.forEach(function (line) { y += layout.firstStep / 2; ctx.fillText(line, 0, y); y += layout.firstStep / 2; });
      if (layout.second.length) { y += 4; ctx.font = '500 ' + layout.secondary + 'px system-ui, sans-serif';
        layout.second.forEach(function (line) { y += layout.secondStep / 2; ctx.fillText(line, 0, y); y += layout.secondStep / 2; }); }
    } finally {
      ctx.restore();
    }
  }

  function paintUi(ui, rect) {
    if (!ui.base || !ui.current || !ui.updatePreview || ui.destroyed || ui.visible === false) return false;
    var geo = layout.geometry(ui.img, ui.base, rect), scale = layout.scale(ui.base, geo);
    var key = [geo.width, geo.height, geo.fit, geo.objectPosition, scale,
      ui.opacity, ui.current.text, ui.current.actionText, ui.previewGeneration].join('/');
    layoutButton(ui, geo, rect);
    if (key === ui.lastGeometry) return true;
    try {
      if (!paintCanvas) paintCanvas = document.createElement('canvas');
      var canvas = paintCanvas;
      canvas.width = Math.max(1, Math.ceil(ui.base.naturalWidth * scale));
      canvas.height = Math.max(1, Math.ceil(ui.base.naturalHeight * scale));
      var ctx = canvas.getContext('2d');
      if (!ctx) return false;
      ctx.drawImage(ui.base, 0, 0, canvas.width, canvas.height);
      drawStatus(ctx, canvas, geo, ui.current, ui.opacity, scale);
      var data = canvas.toDataURL('image/webp', 0.9);
      if (!data || data === 'data:,' || ui.updatePreview(data) === false) return false;
      ui.lastGeometry = key;
      ui.fallback.classList.add('burned');
      return true;
    } catch (e) {
      ui.fallback.classList.remove('burned'); return false;
    } finally {
      if (paintCanvas) { paintCanvas.width = 0; paintCanvas.height = 0; }
    }
  }

  function refreshUi(ui, rect) { paintUi(ui, rect); }

  function renderUi(ui, text, mode, buttonText, onAction) {
    cancelFade(ui);
    ui.opacity = 1;
    ui.action = onAction;
    var actionText = buttonText === 'Retry with stronger model' ? 'Click to retry' : buttonText;
    ui.current = { text: text, actionText: actionText || '' };
    ui.label.textContent = text;
    ui.fallbackAction.textContent = actionText ? '↻  ' + actionText : '';
    ui.live.textContent = text;
    ui.fallback.classList.remove('fade', 'burned');
    if (ui.button) { ui.button.remove(); ui.button = null; }
    if (buttonText) {
      ui.button = document.createElement('button');
      ui.button.className = 'hit';
      ui.button.type = 'button';
      ui.button.textContent = actionText;
      ui.button.setAttribute('aria-label', buttonText);
      ui.button.addEventListener('click', function (event) {
        event.preventDefault(); event.stopPropagation();
        if (ui.action) ui.action();
      });
      ui.frame.appendChild(ui.button);
    }
    var rect = ui.img.getBoundingClientRect();
    layout.position(ui);
    if (!paintUi(ui, rect) && ui.button) {
      ui.button.style.left = '50%'; ui.button.style.top = '55%';
      ui.button.style.width = '170px'; ui.button.style.height = '44px';
    }
  }

  function setPreviewUi(ui, data) {
    if (ui.previewSource === data) return;
    ui.previewSource = data;
    var generation = ++ui.previewGeneration;
    var decoded = new Image();
    decoded.onload = function () {
      if (ui.destroyed || generation !== ui.previewGeneration || !ui.img.isConnected) return;
      ui.base = decoded;
      ui.lastGeometry = '';
      paintUi(ui, ui.img.getBoundingClientRect());
    };
    decoded.onerror = function () {
      if (generation === ui.previewGeneration) { ui.previewSource = ''; ui.fallback.classList.remove('burned'); }
    };
    decoded.src = data;
  }

  function fadeUi(ui) {
    ui.fallback.classList.add('fade');
    if (!ui.base) return;
    [0.75, 0.5, 0.25, 0].forEach(function (level, index) {
      ui.fadeTimers.push(setTimeout(function () {
        if (ui.destroyed) return;
        ui.opacity = level;
        paintUi(ui, ui.img.getBoundingClientRect());
      }, (index + 1) * 65));
    });
  }

  function destroyUi(ui) {
    ui.destroyed = true; ui.previewGeneration++; cancelFade(ui);
    ui.base = null; ui.canvas = null;
    layout.untrack(ui);
    if (ui.host.parentNode) ui.host.parentNode.removeChild(ui.host);
  }

  function create(img, updatePreview) {
    var ui = buildUi(img, updatePreview);
    ui.host.__atlasRefresh = function (rect) { refreshUi(ui, rect); };
    layout.track(ui);
    return {
      host: ui.host,
      render: function (text, mode, buttonText, action) { renderUi(ui, text, mode, buttonText, action); },
      setPreview: function (data) { setPreviewUi(ui, data); },
      fade: function () { fadeUi(ui); },
      destroy: function () { destroyUi(ui); }
    };
  }

  window.__atlasNsfwImageShieldUi = { create: create, positionAll: layout.positionAll };
})();
