/* ── atlas-nsfw-image-shield.js: replaces flagged <img> pixels and owns the
   centered, user-initiated stronger-model confirmation flow. ── */
(function () {
  'use strict';
  if (window.__atlasNsfwImageShield) return;
  var states = new WeakMap();
  var sources = window.__atlasNsfwImageSources;
  if (!sources || !window.__atlasNsfwImageObserver) return; // An older live registration uses the basic guard until restart.
  var attributeNames = sources.attributes, sourceAttributeNames = sources.sourceAttributes;
  var capture = sources.capture, restoreSources = sources.restore, maskOriginalCandidates = sources.mask;
  var log = window.__atlasNsfwLog || function () {};

  function send(message, cb) {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) return cb(null);
    try {
      chrome.runtime.sendMessage({ atlas: message }, function (response) {
        if (chrome.runtime.lastError) return cb(null);
        cb(response || null);
      });
    } catch (e) { cb(null); }
  }

  function render(img, state, text, mode, buttonText, action) {
    if (!state.ui && window.__atlasNsfwImageShieldUi) {
      var ui = window.__atlasNsfwImageShieldUi.create(img, function (preview) {
        if (state.ui !== ui || !img.isConnected || !state.previewData ||
            img.getAttribute('src') !== state.previewData) return false;
        if (preview !== state.previewData) {
          state.previewData = preview;
          img.setAttribute('src', preview);
        }
        return true;
      });
      state.ui = ui;
    }
    if (state.ui) state.ui.render(text, mode, buttonText, action);
  }

  function clearOverlay(state) {
    if (state.ui) state.ui.destroy(); state.ui = null;
  }

  function releaseSnapshot(state) {
    if (state.cancelWork) {
      state.cancelWork(); state.cancelWork = null;
      send({ act: 'nsfw-cancel-work', requestId: state.requestId }, function () {});
    }
    if (state.snapshotId) { send({ act: 'nsfw-release-snapshot', snapshotId: state.snapshotId }, function () {}); state.snapshotId = ''; }
    if (state.preparedId) { send({ act: 'nsfw-release-prepared', preparedId: state.preparedId }, function () {}); state.preparedId = ''; }
  }

  function showError(img, state, message) {
    state.phase = 'error';
    render(img, state, message || 'Couldn’t verify', 'error', 'Try again', function () {
      begin(img, state.source, true, null, true);
    });
    log('ui.error', { kind: 'img', stage: state.stage || 'first', requestId: state.requestId, url: state.source });
  }

  function restore(img, state) {
    state.generation++;
    releaseSnapshot(state);
    if (state.needsRestore || (state.previewData && img.getAttribute('src') === state.previewData)) restoreSources(state);
    if (state.addedDimensions) {
      if (!state.original.hadWidth) img.removeAttribute('width');
      if (!state.original.hadHeight) img.removeAttribute('height');
      state.addedDimensions = false;
    }
    img.dataset.nsfwFilterStatus = 'sfw';
    delete img.dataset.nsfwFlagged;
    img.style.filter = ''; img.style.backgroundColor = '';
    if (state.original.visibility) img.style.setProperty('visibility', state.original.visibility, state.original.visibilityPriority);
    else img.style.removeProperty('visibility');
    img.style.setProperty('visibility', 'visible', 'important');
    clearOverlay(state);
    state.phase = 'sfw';
    state.previewData = '';
    state.needsRestore = false;
    log('ui.restore', { kind: 'img', stage: state.stage || 'first', requestId: state.requestId, url: state.source });
  }

  function installPreview(img, state, response) {
    if (!response.shieldPreview) return false;
    state.preparedId = '';
    state.snapshotId = response.snapshotId || '';
    state.previewData = response.shieldPreview;
    state.phase = response.confirmed ? 'confirmed' : 'flagged';
    state.stage = response.stage || 'first';
    img.dataset.nsfwFilterStatus = 'nsfw';
    img.dataset.nsfwFlagged = '1';
    img.style.setProperty('visibility', 'hidden', 'important');
    if (!state.original.hadWidth && !state.original.hadHeight && response.shieldWidth && response.shieldHeight) {
      img.setAttribute('width', String(response.shieldWidth));
      img.setAttribute('height', String(response.shieldHeight));
      state.addedDimensions = true;
    }
    maskOriginalCandidates(state);
    img.setAttribute('src', state.previewData);
    img.style.setProperty('filter', 'none', 'important');
    img.style.setProperty('visibility', 'visible', 'important');
    render(img, state, response.confirmed ? 'NSFW confirmed' : 'NSFW detected', state.phase,
      response.confirmed ? null : (state.snapshotId ? 'Retry with stronger model' : 'Try again'), function () {
      if (state.snapshotId) retry(img, state);
      else begin(img, state.source, true, null, true);
    });
    if (state.ui && state.ui.setPreview) state.ui.setPreview(response.shieldPreview); log('image.replaced', { kind: 'img', model: 'first', width: response.shieldWidth, height: response.shieldHeight, requestId: state.requestId, url: state.source });
    return true;
  }

  function requestActive(img, state, generation, requestId, source, stage) {
    var reason = state.generation !== generation ? 'superseded' :
      (!img.isConnected ? 'detached' : (state.phase !== 'checking' ? 'phase-changed' : ''));
    if (!reason) return true;
    log('ui.stale', { kind: 'img', stage: stage, reason: reason, requestId: requestId, url: source });
    return false;
  }

  function releaseResult(response) {
    if (response && response.preparedId) send({ act: 'nsfw-release-prepared', preparedId: response.preparedId }, function () {});
    if (response && response.snapshotId) send({ act: 'nsfw-release-snapshot', snapshotId: response.snapshotId }, function () {});
  }

  function finishVerdict(img, state, response) {
    var meta = response || { error: 'detector-timeout' };
    meta.requestId = state.requestId;
    var isNsfw = meta.error || typeof meta.isNsfw !== 'boolean' ? null : meta.isNsfw;
    if (window.__atlasNsfwTrace) window.__atlasNsfwTrace.verdict('img', state.source, isNsfw, meta);
    state.stage = meta.stage || 'first';
    if (isNsfw === null) { showError(img, state, 'Couldn’t verify'); return; }
    if (!isNsfw) { restore(img, state); return; }
    if (!installPreview(img, state, meta)) {
      state.phase = 'error';
      render(img, state, 'NSFW detected', 'error', 'Try again', function () { begin(img, state.source, true, null, true); });
      log('image.preview-failed', { kind: 'img', reason: meta.previewError || 'missing-preview' });
    }
  }

  function showPrepared(img, state, prepared) {
    state.preparedId = prepared.preparedId || '';
    if (!prepared.shieldPreview) return;
    state.previewData = prepared.shieldPreview;
    state.needsRestore = true;
    if (!state.original.hadWidth && !state.original.hadHeight && prepared.shieldWidth && prepared.shieldHeight) {
      img.setAttribute('width', String(prepared.shieldWidth));
      img.setAttribute('height', String(prepared.shieldHeight));
      state.addedDimensions = true;
    }
    maskOriginalCandidates(state);
    img.setAttribute('src', state.previewData);
    img.style.setProperty('filter', 'none', 'important');
    img.style.setProperty('visibility', 'visible', 'important');
    if (state.ui && state.ui.setPreview) state.ui.setPreview(prepared.shieldPreview);
    render(img, state, 'Checking image…', 'checking');
  }

  function requestPrepared(img, state, generation, source, requestId, forceFresh, done, priority) {
    send({ act: 'nsfw-prepare-shield', url: source, page: location.origin + location.pathname,
      requestId: requestId, priority: priority || 0, forceFresh: forceFresh }, function (prepared) {
      if (!requestActive(img, state, generation, requestId, source, 'prepare')) { releaseResult(prepared); done(); return; }
      if (prepared && prepared.verdict) {
        releaseResult(prepared);
        done();
        finishVerdict(img, state, Object.assign({}, prepared, prepared.verdict));
        return;
      }
      showPrepared(img, state, prepared || {});
      send({ act: 'nsfw-classify', url: source, page: location.origin + location.pathname,
        shield: true, requestId: requestId, preparedId: state.preparedId, forceFresh: forceFresh }, function (response) {
        if (!requestActive(img, state, generation, requestId, source, 'first')) { releaseResult(response); done(); return; }
        state.preparedId = ''; done();
        finishVerdict(img, state, response);
      });
    });
  }

  function begin(img, src, force, originalOverride, forceFresh) {
    var state = states.get(img);
    var alreadyReplaced = !!(state && state.previewData && img.getAttribute('src') === state.previewData);
    if (alreadyReplaced && !force) return;
    if (state && state.phase === 'checking' && state.source === src && !force) return;
    if (state) {
      if (state.phase === 'checking') log('ui.cancelled', { kind: 'img', reason: 'restarted', requestId: state.requestId, url: state.source });
      state.generation++; releaseSnapshot(state); clearOverlay(state);
    } else {
      state = { img: img, generation: 0, stage: 'first', phase: 'new', ui: null, previewData: '', snapshotId: '', preparedId: '' };
      states.set(img, state);
    }
    state.original = originalOverride || (alreadyReplaced ? state.original : capture(img));
    state.needsRestore = state.needsRestore || alreadyReplaced;
    state.source = src || img.currentSrc || img.src;
    // A site-selected original must not inherit ownership of the previous source's preview.
    if (!alreadyReplaced) state.previewData = '';
    state.phase = 'checking'; state.stage = 'first';
    var generation = ++state.generation, requestId = state.requestId = Date.now().toString(36) + Math.random().toString(36).slice(2);
    var source = state.source;
    img.dataset.nsfwFilterStatus = 'processing';
    img.style.setProperty('filter', alreadyReplaced ? 'none' : 'blur(30px) grayscale(50%)', 'important');
    img.style.setProperty('visibility', 'visible', 'important');
    log('request.start', { kind: 'img', requestId: requestId, url: source, forceFresh: forceFresh === true });
  
  function proceed(verdict) {
      if (verdict && !verdict.isNsfw) { finishVerdict(img, state, verdict); return; }
      if (!verdict) {
        render(img, state, 'Checking image…', 'checking');
        log('ui.checking', { kind: 'img', model: 'first', requestId: requestId, url: source });
      }
      var run = function (done, priority) {
        requestPrepared(img, state, generation, source, requestId, forceFresh === true, function () {
          done(); if (state.requestId === requestId) state.cancelWork = null;
        }, priority);
      };
      if (window.__atlasNsfwImageWork) state.cancelWork = window.__atlasNsfwImageWork.enqueue(img, run);
      else run(function () {});
    }
    if (forceFresh) { proceed(null); return; }
    send({ act: 'nsfw-cached-verdict', url: source }, function (cached) {
      if (requestActive(img, state, generation, requestId, source, 'cache')) proceed(cached && cached.verdict);
    });
  }

  function retry(img, state) {
    if ((state.phase !== 'flagged' && state.phase !== 'error') || !state.snapshotId) return;
    state.phase = 'retrying';
    state.stage = 'strong';
    var generation = ++state.generation;
    render(img, state, 'Rechecking with stronger model…', 'retrying');
    log('ui.retry', { kind: 'img', model: 'freepik-448-fp16', requestId: state.requestId, url: state.source });
    send({ act: 'nsfw-retry', snapshotId: state.snapshotId }, function (response) {
      if (state.generation !== generation || !img.isConnected || state.phase !== 'retrying') return;
      if (!response || response.error || typeof response.isNsfw !== 'boolean') {
        var rawError = response && (response.errorCode || response.error) || (response ? 'retry-failed' : 'bridge-no-response');
        var errorAliases = { 'wasm-unavailable': 'runtime-unavailable', 'wasm-init-failed': 'model-load-failed' };
        var errorCode = errorAliases[String(rawError)] || String(rawError);
        var messages = {
          'bridge-no-response': 'Checker didn’t respond',
          'detector-unavailable': 'Checker unavailable',
          'detector-timeout': 'Checker timed out',
          'runtime-unavailable': 'Stronger model unavailable',
          'model-load-failed': 'Stronger model couldn’t load',
          'snapshot-decode-failed': 'Image couldn’t be prepared',
          'inference-failed': 'Stronger check failed',
          'snapshot-expired': 'Image check expired',
          'invalid-snapshot': 'Image check expired',
          'retry-capacity': 'Checker is busy',
          'invalid-response': 'Stronger check returned no result',
          'retry-failed': 'Stronger check failed'
        };
        var freshCheck = errorCode === 'snapshot-expired' || errorCode === 'invalid-snapshot';
        var message = messages[errorCode] || 'Stronger check failed';
        state.phase = 'error';
        render(img, state, message, 'error', freshCheck ? 'Check again' : 'Try again', function () {
          if (freshCheck) begin(img, state.source, true, null, true);
          else retry(img, state);
        });
        log('retry.error', { kind: 'img', stage: 'strong', model: 'freepik-448-fp16',
          errorCode: errorCode, errorDetail: response && response.errorDetail ? String(response.errorDetail).slice(0, 180) : '' });
        return;
      }
      state.snapshotId = '';
      log('model.verdict', { kind: 'img', stage: response.stage, model: response.model, isNsfw: response.isNsfw, score: response.score, threshold: response.threshold, requestId: state.requestId, url: state.source });
      if (response.isNsfw) {
        state.phase = 'confirmed';
        render(img, state, 'NSFW confirmed', 'confirmed');
        return;
      }
      state.phase = 'sfw-confirmed';
      render(img, state, 'SFW confirmed', 'sfw-confirmed');
      if (state.ui) state.ui.fade();
      setTimeout(function () {
        if (state.generation === generation && state.phase === 'sfw-confirmed' && img.isConnected) restore(img, state);
      }, 320);
    });
  }

  function analyze(img, src, options) {
    if (!img || !img.isConnected) return;
    if (options && options.forceFresh) { begin(img, src, true, null, true); return; }
    var state = states.get(img);
    if (state && state.phase === 'sfw' && state.source === src) return;
    if (state && state.previewData && img.getAttribute('src') === state.previewData) return;
    begin(img, src, false);
  }

  function isReplacement(img) {
    var state = states.get(img); return !!(state && state.previewData && img.getAttribute('src') === state.previewData);
  }

  function mutationSnapshot(img, state, changedNode, attributeName) {
    var fresh = capture(img), old = state.original;
    if (!old) return fresh;
    attributeNames.forEach(function (name) {
      if (changedNode === img && name === attributeName) return;
      if (!changedNode && name === 'src' && fresh.attrs.src.value !== state.previewData) return;
      if (old.attrs[name]) fresh.attrs[name] = old.attrs[name];
    });
    fresh.sources = fresh.sources.map(function (entry) {
      var prior = old.sources.find(function (candidate) { return candidate.node === entry.node; });
      if (!prior) return entry;
      sourceAttributeNames.forEach(function (name) {
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

  function sourceChanged(img, changedNode, attributeName) {
    if (changedNode && attributeName && sources.consumeOwnChange(changedNode, attributeName)) return true;
    if (!img || !img.isConnected) return false;
    var state = states.get(img);
    if (!state) return false;
    if (state.phase === 'sfw' && !changedNode) return true;
    var previousAttribute = changedNode && attributeName ? savedAttribute(state, changedNode, attributeName) : null;
    var currentAttribute = changedNode && attributeName && changedNode.hasAttribute(attributeName) ? changedNode.getAttribute(attributeName) : null;
    var mutationValueChanged = !!(previousAttribute && (previousAttribute.present !== changedNode.hasAttribute(attributeName) || previousAttribute.value !== currentAttribute));
    if (state.phase === 'sfw' && changedNode && attributeName) {
      if (previousAttribute && !mutationValueChanged) return true;
    }
    if (isReplacement(img)) {
      var sourceStillCleared = state && !img.getAttribute('srcset') && !img.getAttribute('data-srcset') && !img.getAttribute('data-src') && !img.getAttribute('data-original') && !img.getAttribute('data-thumb') && state.original.sources.every(function (entry) {
        return !entry.node.isConnected || (!entry.node.getAttribute('srcset') && !entry.node.getAttribute('data-srcset'));
      });
      if (!changedNode && sourceStillCleared) return true;
      if (changedNode === img && attributeName === 'src' && img.getAttribute('src') === state.previewData) return true;
      if (changedNode && sourceStillCleared && (attributeName === 'srcset' || attributeName === 'data-srcset' || attributeName === 'data-src' || attributeName === 'data-original' || attributeName === 'data-thumb')) return true;
    }
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
    var activeReplacementChanged = !!(state.previewData && isReplacement(img) && !sourceStillCleared);
    if (src === state.source && !activeReplacementChanged && !(state.previewData && !isReplacement(img)) && !mutationValueChanged) return true;
    log('ui.source-change', { kind: 'img', attribute: attributeName || 'currentSrc', requestId: state.requestId, url: state.source });
    img.style.setProperty('visibility', 'hidden', 'important');
    state.needsRestore = !!state.previewData;
    begin(img, src, true, originalOverride);
    return true;
  }

  var walkImages = window.__atlasNsfwImageObserver.walk;

  function restoreAll() {
    walkImages(document, function (img) {
      if (!img.hasAttribute('data-nsfw-filter-status')) return;
      var state = states.get(img);
      if (state) restore(img, state);
    });
  }
  var api = { analyze: analyze, isReplacement: isReplacement, sourceChanged: sourceChanged, restoreAll: restoreAll };
  window.__atlasNsfwImageShield = api;
  window.addEventListener('pagehide', function () {
    walkImages(document, function (img) {
      var state = states.get(img);
      if (!state) return;
      state.generation++; releaseSnapshot(state); clearOverlay(state);
    });
  });
  window.__atlasNsfwImageObserver.connect(sourceChanged, function (img) {
          var state = states.get(img);
          if (state) {
            if (state.phase === 'checking') log('ui.cancelled', { kind: 'img', stage: state.stage || 'first', reason: 'detached', requestId: state.requestId, url: state.source });
            state.generation++; releaseSnapshot(state);
            if (state.needsRestore || (state.previewData && img.getAttribute('src') === state.previewData)) restoreSources(state);
            if (state.addedDimensions) {
              if (!state.original.hadWidth) img.removeAttribute('width');
              if (!state.original.hadHeight) img.removeAttribute('height');
            }
            clearOverlay(state);
            delete img.dataset.nsfwFilterStatus; delete img.dataset.nsfwFlagged;
            img.style.removeProperty('visibility');
            states.delete(img);
          }
  });
})();
