/* ── atlas-nsfw-guard.js: hides unverified media on sight, then blurs or blacks it out in place once
   the offscreen MobileNetV2 detector answers. Watches <img>, CSS background images and <video>. ── */

(function () {
  'use strict';
  if (window.__atlasNsfwGuard) return;
  window.__atlasNsfwGuard = true;

  var HIDE_STYLE_ID = 'atlas-nsfw-pending-hide';
  var MIN_SIZE = 41;
  var FRAME_SIZE = 224;
  var VIDEO_INTERVAL = 10;
  var SKIP_TAGS = { SCRIPT: 1, STYLE: 1, LINK: 1, META: 1, TITLE: 1, HEAD: 1, TEMPLATE: 1, NOSCRIPT: 1, BR: 1 };
  var _config = { enabled: false, action: 'off' };

  var _observer = null;
  var _bgObserver = null;
  var _bgVerdicts = Object.create(null);
  var _bgKeys = new WeakMap();
  var _bgInline = new WeakMap();
  var _videoBusy = new WeakSet();
  var _videoDead = new WeakSet();
  var _videoClock = new WeakMap();
  var _shadowSeen = new WeakSet();
  /* Debug feed: atlas-nsfw-log.js ships __atlasNsfwTrace; without it these are no-ops. */
  var _t = window.__atlasNsfwTrace || {};
  function logEvent(event, data) { _t.log(event, data); }
  function srcKind(url) { return _t.kind ? _t.kind(url) : ''; }
  function verdictLog(kind, url, isNsfw, meta) { if (_t.verdict) _t.verdict(kind, url, isNsfw, meta); }

  function injectPreHideStyle() {
    if (document.getElementById(HIDE_STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = HIDE_STYLE_ID;
    style.textContent = 'img:not([data-nsfw-filter-status]),img[data-nsfw-filter-status="processing"],video:not([data-nsfw-filter-status]),video[data-nsfw-filter-status="processing"]{visibility:hidden !important}';
    if (document.documentElement) document.documentElement.appendChild(style);
  }

  function removePreHideStyle() {
    var el = document.getElementById(HIDE_STYLE_ID);
    if (el) el.remove();
  }

  function classify(url, cb) {
    if (!url || typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) return cb(null, { error: 'bridge-missing' });
    chrome.runtime.sendMessage({ atlas: { act: 'nsfw-classify', url: url, page: location.origin + location.pathname } }, function (resp) {
      cb(resp && resp.error ? null : !!(resp && resp.isNsfw), resp || null);
    });
  }

  function applyEffect(el) {
    if (!_config.enabled) { revealElement(el, true); return; }
    if (el.dataset.nsfwFilterStatus === 'nsfw') return;
    el.dataset.nsfwFilterStatus = 'nsfw'; el.dataset.nsfwFlagged = '1';
    logEvent('effect', { kind: el.tagName === 'VIDEO' ? 'video' : 'img', srcKind: srcKind(el.currentSrc || el.src), action: _config.action });

    if (_config.action === 'blackout') {
      el.style.filter = 'brightness(0)';
      el.style.backgroundColor = '#000000';
      el.style.setProperty('visibility', 'visible', 'important');
    } else {   /* blur (also what retired actions normalize to) */
      el.style.filter = 'blur(28px) grayscale(50%)';
      el.style.setProperty('visibility', 'visible', 'important');
      el.title = 'Blocked by Atlas Shield';
    }
  }

  function revealElement(el, force) {
    if (!force && el.dataset.nsfwFilterStatus === 'nsfw') return;
    el.dataset.nsfwFilterStatus = 'sfw'; delete el.dataset.nsfwFlagged;
    el.style.setProperty('visibility', 'visible', 'important');
    if (force) { el.style.filter = ''; el.style.backgroundColor = ''; if (el.title === 'Blocked by Atlas Shield') el.title = ''; }
    else if (el.style.filter && el.style.filter.indexOf('blur(28px)') >= 0) {
      el.style.filter = '';
    }
  }

  function analyzeImage(img) {
    var src = img && (img.currentSrc || img.src || img.getAttribute('data-src') || img.getAttribute('data-thumb') || img.getAttribute('data-original'));
    var imageShield = window.__atlasNsfwImageShield;
    if (imageShield && imageShield.isReplacement(img)) return;
    if (!src) return;
    if (src.startsWith('data:image/svg')) { revealElement(img); return; }
    if (src.startsWith('data:') && img.naturalWidth <= 1) return;

    var w = img.width, h = img.height, sw = img.naturalWidth, sh = img.naturalHeight;
    if (sw > 0 && sh > 0 && (sw <= MIN_SIZE || sh <= MIN_SIZE)) {
      logEvent('seen', { kind: 'img', srcKind: srcKind(src), skipped: 'size', naturalWidth: sw, naturalHeight: sh });
      revealElement(img);
      return;
    }
    if (_config.action === 'blur' && imageShield) {
      logEvent('seen', { kind: 'img', srcKind: srcKind(src), w: img.width || undefined, h: img.height || undefined, url: src }); imageShield.analyze(img, src); return;
    }
    if (img.dataset.nsfwFilterStatus) return;
    img.dataset.nsfwFilterStatus = 'processing';
    logEvent('seen', { kind: 'img', srcKind: srcKind(src), w: w || undefined, h: h || undefined, url: src });
    classify(src, function (isNsfw, meta) {
      verdictLog('img', src, isNsfw, meta);
      if (isNsfw === null) { applyEffect(img); return; }
      if (isNsfw) applyEffect(img);
      else revealElement(img);
    });
  }

  function bgUrls(el) {
    var value = '';
    try { value = getComputedStyle(el).backgroundImage; } catch (e) { return []; }
    if (!value || value === 'none') return [];
    var urls = [];
    var re = /url\((['"]?)(.*?)\1\)/g;
    var m;
    while ((m = re.exec(value)) !== null) {
      if (m[2] && m[2].charAt(0) !== '#') urls.push(m[2]);
    }
    return urls;
  }

  function hideBackground(el) {
    if (!_bgInline.has(el)) {
      _bgInline.set(el, { value: el.style.getPropertyValue('background-image'), priority: el.style.getPropertyPriority('background-image') });
    }
    el.style.setProperty('background-image', 'none', 'important');
  }

  function restoreBackground(el) {
    var saved = _bgInline.get(el);
    if (!saved) return;
    _bgInline.delete(el);
    el.style.removeProperty('background-image');
    if (saved.value) el.style.setProperty('background-image', saved.value, saved.priority);
  }

  function settleBackground(el, isNsfw, key) {
    if (!_config.enabled || !el.isConnected || _bgKeys.get(el) !== key) return;
    if (!isNsfw) {
      el.dataset.nsfwFilterBackgroundStatus = 'sfw';
      return;
    }
    el.dataset.nsfwFilterBackgroundStatus = 'nsfw';
    logEvent('effect', { kind: 'background', srcKind: 'http', action: 'hidden' });
    hideBackground(el);
  }

  function classifyBackgrounds(el, urls, key) {
    var i = 0;
    function next() {
      if (i >= urls.length) { settleBackground(el, false, key); return; }
      var url = urls[i++];
      var cached = _bgVerdicts[url];
      if (cached === 'nsfw') { settleBackground(el, true, key); return; }
      if (cached === 'sfw') { next(); return; }
      classify(url, function (isNsfw, meta) {
        verdictLog('background', url, isNsfw, meta);
        if (isNsfw === null) { settleBackground(el, true, key); return; }
        _bgVerdicts[url] = isNsfw ? 'nsfw' : 'sfw';
        if (isNsfw) settleBackground(el, true, key);
        else next();
      });
    }
    next();
  }

  function checkBackground(el) {
    if (!el || !el.isConnected) return;
    if (el.dataset.nsfwFilterBackgroundStatus === 'nsfw') return;
    var rect = el.getBoundingClientRect();
    var canvas = el === document.body || el === document.documentElement;
    if (!canvas && (rect.width <= MIN_SIZE || rect.height <= MIN_SIZE)) return;

    var urls = bgUrls(el);
    var key = urls.join(' ');
    var status = el.dataset.nsfwFilterBackgroundStatus;
    if (_bgKeys.get(el) === key && status !== undefined && status !== 'processing') return;

    if (urls.length === 0) {
      if (_bgKeys.has(el)) {
        _bgKeys.delete(el);
        restoreBackground(el);
        delete el.dataset.nsfwFilterBackgroundStatus;
      }
      return;
    }

    _bgKeys.set(el, key);
    el.dataset.nsfwFilterBackgroundStatus = 'processing';
    logEvent('seen', { kind: 'background', srcKind: srcKind(urls[0]), url: urls[0] });
    classifyBackgrounds(el, urls, key);
  }

  function registerBackgrounds(root) {
    if (!_bgObserver || !root) return;
    if (root.nodeType === 1 && !SKIP_TAGS[root.nodeName]) _bgObserver.observe(root);
    if (!root.querySelectorAll) return;
    var all = root.querySelectorAll('*');
    for (var i = 0; i < all.length; i++) {
      if (!SKIP_TAGS[all[i].nodeName]) _bgObserver.observe(all[i]);
    }
  }

  function captureFrame(video) {
    if (video.readyState < 2) return null;
    var canvas = document.createElement('canvas');
    canvas.width = FRAME_SIZE;
    canvas.height = FRAME_SIZE;
    try {
      var ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(video, 0, 0, FRAME_SIZE, FRAME_SIZE);
      return canvas.toDataURL('image/jpeg', 0.8);
    } catch (e) {
      if (e && e.name === 'SecurityError') logEvent('fail', { kind: 'video', reason: 'canvasTaint' });
      _videoDead.add(video);
      return null;
    }
  }

  function sampleVideo(video) {
    if (!video || !video.isConnected) return;
    if (video.dataset.nsfwFilterStatus === 'nsfw') return;
    if (_videoDead.has(video) || _videoBusy.has(video)) return;

    var frame = captureFrame(video);
    if (frame === null) {
      // Fail safe: shield tainted frames, and keep an unsampled video hidden until a frame is readable.
      if (_videoDead.has(video)) applyEffect(video);
      else if (video.dataset.nsfwFilterStatus !== 'sfw') video.dataset.nsfwFilterStatus = 'processing';
      logEvent('fail', { kind: 'video', srcKind: srcKind(video.currentSrc || video.poster), reason: _videoDead.has(video) ? 'canvasTaint' : 'frameCapture', readyState: video.readyState });
      return;
    }

    _videoBusy.add(video);
    _videoClock.set(video, video.currentTime);
    classify(frame, function (isNsfw, meta) {
      verdictLog('video', frame, isNsfw, meta);
      _videoBusy.delete(video);
      if (video.dataset.nsfwFilterStatus === 'nsfw') return;
      if (isNsfw) {
        applyEffect(video);
        if (video.pause) video.pause();
      } else {
        revealElement(video);
      }
    });
  }

  function wireVideo(video) {
    if (video.dataset.nsfwVideoWired === '1') return;
    video.dataset.nsfwVideoWired = '1';
    var resample = function () { if (video.dataset.nsfwFilterStatus !== 'nsfw') sampleVideo(video); };
    video.addEventListener('loadeddata', resample);
    video.addEventListener('seeked', resample);
    video.addEventListener('play', resample);
    video.addEventListener('timeupdate', function () {
      if (video.dataset.nsfwFilterStatus !== 'sfw') return;
      var last = _videoClock.get(video);
      if (last === undefined || video.currentTime - last >= VIDEO_INTERVAL) sampleVideo(video);
    });
  }

  function analyzeVideo(video) {
    if (!video || video.dataset.nsfwFilterStatus) return;
    var w = video.clientWidth, h = video.clientHeight;
    if (w > 0 && h > 0 && (w <= MIN_SIZE || h <= MIN_SIZE)) {
      logEvent('seen', { kind: 'video', srcKind: srcKind(video.currentSrc || video.poster), skipped: 'size' });
      video.dataset.nsfwFilterStatus = 'sfw';
      return;
    }

    video.dataset.nsfwFilterStatus = 'processing';
    video.style.visibility = 'hidden';
    wireVideo(video);
    logEvent('seen', { kind: 'video', srcKind: srcKind(video.currentSrc || video.poster), w: w || undefined, h: h || undefined, url: video.currentSrc || video.poster });

    if (video.poster) {
      classify(video.poster, function (isNsfw, meta) {
        verdictLog('video-poster', video.poster, isNsfw, meta);
        if (video.dataset.nsfwFilterStatus === 'nsfw') return;
        if (isNsfw) applyEffect(video);
        else sampleVideo(video);
      });
    } else {
      sampleVideo(video);
    }
  }

  /* Coverage check: open shadow roots were never scanned (the dark corners that let media through). */
  function scanShadow(owner) {
    var root = owner && owner.shadowRoot;
    if (!root || !root.querySelectorAll || _shadowSeen.has(root)) return;
    _shadowSeen.add(root);
    logEvent('shadowroot', { host: String(owner.nodeName), media: root.querySelectorAll('img,video').length });
    scanAll(root);
    var hosts = root.querySelectorAll('*');
    for (var i = 0; i < hosts.length; i++) scanShadow(hosts[i]);
  }

  function scanAll(root) {
    if (!root || !root.querySelectorAll) return;
    var imgs = root.querySelectorAll('img');
    for (var i = 0; i < imgs.length; i++) analyzeImage(imgs[i]);
    var vids = root.querySelectorAll('video');
    for (var j = 0; j < vids.length; j++) analyzeVideo(vids[j]);
    registerBackgrounds(root);
    if (root.querySelectorAll) {
      var hosts = root.querySelectorAll('*');
      for (var k = 0; k < hosts.length; k++) scanShadow(hosts[k]);
    }
  }

  function startObserver() {
    if (!window.__atlasNsfwGuardWatch) return; // Keep the pre-hide protection until old registrations restart.
    if (_observer) return;
    _observer = window.__atlasNsfwGuardWatch.create({
      added: function (node) {
        if (node.tagName === 'IMG') analyzeImage(node);
        else if (node.tagName === 'VIDEO') analyzeVideo(node);
        else scanAll(node);
      },
      attribute: function (target, name) {
        if (target.tagName === 'IMG' && name === 'src') {
          if (_config.action === 'blur' && window.__atlasNsfwImageShield && window.__atlasNsfwImageShield.sourceChanged(target, target, name)) return;
          delete target.dataset.nsfwFilterStatus; analyzeImage(target);
        } else if (target.tagName === 'VIDEO' && (name === 'src' || name === 'poster')) {
          delete target.dataset.nsfwFilterStatus; analyzeVideo(target);
        }
      },
      background: checkBackground,
      load: function (event) {
        var target = event.target, shield = window.__atlasNsfwImageShield;
        if (target && target.tagName === 'IMG' && !(_config.action === 'blur' && shield && (shield.isReplacement(target) || shield.sourceChanged(target)))) {
          delete target.dataset.nsfwFilterStatus; analyzeImage(target);
        }
      }
    });
    _bgObserver = _observer.backgrounds;
    scanAll(document);
  }

  function revealAll() {
    if (window.__atlasNsfwImageShield) window.__atlasNsfwImageShield.restoreAll();
    removePreHideStyle();
    if (_observer) { _observer.disconnect(); _observer = null; }
    if (_bgObserver) { _bgObserver.disconnect(); _bgObserver = null; }
    document.querySelectorAll('img[data-nsfw-filter-status], video[data-nsfw-filter-status]').forEach(function (el) { revealElement(el, true); });
    document.querySelectorAll('[data-nsfw-filter-background-status]').forEach(function (el) {
      restoreBackground(el);
      delete el.dataset.nsfwFilterBackgroundStatus;
    });
  }

  function fetchConfig() {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
      chrome.storage.sync.get(['nsfwAction'], function (items) {
        if (!items) return;
        _config.action = items.nsfwAction || 'off';
        if (_config.action !== 'off' && _config.action !== 'blur' && _config.action !== 'blackout') {
          _config.action = 'blur';   /* retired actions fall back to a blur */
        }
        _config.enabled = _config.action !== 'off';

        if (_config.enabled) {
          injectPreHideStyle();
          startObserver();
          // Keep pre-hide style so unclassified media never flashes before verdict
        } else {
          revealAll();
        }
      });
    }
  }

  fetchConfig();
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area === 'sync' && changes.nsfwAction) {
        fetchConfig();
      }
    });
  }
})();
