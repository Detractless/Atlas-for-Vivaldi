/* ── offscreen.js: MobileNetV2 first-pass detection and shield snapshot preparation. ── */
(function () {
  'use strict';

  var _threshold = 0.889871;
  var _model = null;
  var _initPromise = null;
  var _snapshots = new Map();
  var _preparedImages = new Map();
  var SNAPSHOT_MAX = 8;
  var SNAPSHOT_TTL = 3 * 60 * 1000;
  var PREPARED_MAX = 8;
  var PREPARED_TTL = 60 * 1000;
  var PREVIEW_EDGE = 448;
  var PREVIEW_MAX_CHARS = 1500000;
  var SNAPSHOT_MAX_BYTES = 1024 * 1024;
  setInterval(function () {
    var before = _snapshots.size;
    pruneSnapshots();
    prunePreparedImages();
    window.__atlasNsfwDetectorWork.wake();
    if (_snapshots.size !== before) console.info('[NSFW-Offscreen] Expired pending image snapshots.');
  }, 60000);

  // Labels order for MobileNetV2 NSFW model:
  // 0: Drawing, 1: Hentai, 2: Neutral, 3: Porn, 4: Sexy
  async function initDetector() {
    if (_initPromise) return _initPromise;
    _initPromise = (async () => {
      if (typeof tf === 'undefined') {
        throw new Error('TensorFlow.js not loaded');
      }
      // Ensure WebGL GPU backend is active (pure GLSL shaders, zero WASM/eval)
      await tf.setBackend('webgl');
      await tf.ready();

      // The top-level graph is the active NSFWJS MobileNetV2 model; Marqo's graph is separate under models/marqo/.
      var modelUrl = chrome.runtime.getURL('components/atlas/nsfw/models/model.json');
      _model = await tf.loadGraphModel(modelUrl);

      // Pre-warm WebGL shader pipeline with a dummy tensor
      tf.tidy(() => {
        var dummy = tf.zeros([1, 224, 224, 3]);
        _model.predict(dummy);
      });
      console.log('[NSFW-Offscreen] TFJS WebGL detector initialized and warmed up.');
    })();
    return _initPromise;
  }

  async function classifyImageBitmap(bitmap) {
    await initDetector();

    var canvas = document.createElement('canvas');
    canvas.width = 224;
    canvas.height = 224;
    var ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, 224, 224);

    var probabilities = tf.tidy(() => {
      // MobileNetV2 graph expects normalized [0, 1] input range
      var imgTensor = tf.browser.fromPixels(canvas).toFloat().div(255.0);
      var expanded = imgTensor.expandDims(0);
      var output = _model.predict(expanded);
      return Array.from(output.dataSync());
    });

    // Indexes: 0=Drawing, 1=Hentai, 2=Neutral, 3=Porn, 4=Sexy
    var hentai = probabilities[1] || 0;
    var porn = probabilities[3] || 0;
    var sexy = probabilities[4] || 0;
    var nsfwScore = porn + hentai + (sexy * 0.5);

    var isBlocked = nsfwScore >= _threshold;

    return {
      result: isBlocked,
      score: Math.round(nsfwScore * 10000) / 10000,
      details: {
        porn: Math.round(porn * 10000) / 10000,
        hentai: Math.round(hentai * 10000) / 10000,
        sexy: Math.round(sexy * 10000) / 10000
      }
    };
  }

  async function fetchBlob(url, page, forceFresh) {
    var resp = null;
    try { resp = await fetch(url, { credentials: 'omit', cache: forceFresh ? 'reload' : 'default' }); } catch (e) { resp = null; }
    if (!resp || !resp.ok) {
      // Hotlink-protected CDNs check Referer and page cookies: retry once with both.
      resp = await fetch(url, { credentials: 'include', referrer: page || undefined, cache: forceFresh ? 'reload' : 'default' });
    }
    if (!resp.ok) {
      var err = new Error('HTTP ' + resp.status);
      err.status = resp.status;
      throw err;
    }
    return resp.blob();
  }

  function snapshotId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
  }

  function pruneSnapshots() {
    var now = Date.now();
    _snapshots.forEach(function (entry, id) {
      if (now - entry.ts > SNAPSHOT_TTL) _snapshots.delete(id);
    });
  }

  function prunePreparedImages() {
    var now = Date.now();
    _preparedImages.forEach(function (entry, id) {
      if (now - entry.ts > PREPARED_TTL) _preparedImages.delete(id);
    });
  }

  function makeBlurredPreview(bitmap) {
    var scale = Math.min(1, PREVIEW_EDGE / Math.max(bitmap.width, bitmap.height));
    var width = Math.max(1, Math.round(bitmap.width * scale));
    var height = Math.max(1, Math.round(bitmap.height * scale));
    var canvas = document.createElement('canvas');
    var ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('preview-canvas-unavailable');

    for (var attempt = 0; attempt < 3; attempt++) {
      canvas.width = width;
      canvas.height = height;
      ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.filter = 'blur(' + Math.max(20, Math.round(width / 18)) + 'px) grayscale(50%)';
      ctx.drawImage(bitmap, 0, 0, width, height);
      ctx.filter = 'none';
      var dataUrl = canvas.toDataURL('image/webp', 0.68);
      if (!dataUrl || dataUrl.length > PREVIEW_MAX_CHARS) {
        dataUrl = canvas.toDataURL('image/jpeg', 0.68);
      }
      if (dataUrl && dataUrl.length <= PREVIEW_MAX_CHARS) {
        return { dataUrl: dataUrl, width: bitmap.width, height: bitmap.height };
      }
      width = Math.max(96, Math.floor(width * 0.72));
      height = Math.max(96, Math.floor(height * 0.72));
    }
    throw new Error('preview-size-limit');
  }

  function makeStrongSnapshot(bitmap) {
    return new Promise(function (resolve, reject) {
      var canvas = document.createElement('canvas');
      canvas.width = 448;
      canvas.height = 448;
      var ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('snapshot-canvas-unavailable')); return; }
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(bitmap, 0, 0, 448, 448);
      canvas.toBlob(function (blob) {
        if (blob && blob.size <= SNAPSHOT_MAX_BYTES) { resolve(blob); return; }
        canvas.toBlob(function (compressed) {
          if (!compressed || compressed.size > SNAPSHOT_MAX_BYTES) { reject(new Error('snapshot-size-limit')); return; }
          resolve(compressed);
        }, 'image/webp', 0.82);
      }, 'image/png');
    });
  }

  async function prepareShieldImage(url, page, forceFresh) {
    var blob = await fetchBlob(url, page, forceFresh);
    var bitmap = await createImageBitmap(blob);
    var preview;
    try { preview = makeBlurredPreview(bitmap); }
    finally { if (bitmap.close) bitmap.close(); }
    prunePreparedImages();
    while (_preparedImages.size >= PREPARED_MAX) {
      _preparedImages.delete(_preparedImages.keys().next().value);
    }
    var id = snapshotId();
    _preparedImages.set(id, { url: url, blob: blob, preview: preview, ts: Date.now() });
    return { preparedId: id, shieldPreview: preview.dataUrl, shieldWidth: preview.width, shieldHeight: preview.height };
  }

  async function classifyUrl(url, page, keepSnapshot, preparedId, forceFresh) {
    prunePreparedImages();
    var prepared = preparedId ? _preparedImages.get(String(preparedId)) : null;
    if (prepared) _preparedImages.delete(String(preparedId));
    if (prepared && prepared.url !== url) prepared = null;
    var blob = prepared ? prepared.blob : await fetchBlob(url, page, forceFresh);
    var bitmap = await createImageBitmap(blob);
    try {
      var result = await classifyImageBitmap(bitmap);
      if (keepSnapshot && result.result) {
        try {
          var preview = prepared ? prepared.preview : makeBlurredPreview(bitmap);
          result.shieldPreview = preview.dataUrl;
          result.shieldWidth = preview.width;
          result.shieldHeight = preview.height;
          pruneSnapshots();
          if (_snapshots.size >= SNAPSHOT_MAX) {
            result.previewError = 'snapshot-capacity';
            return result;
          }
          var snapshot = await makeStrongSnapshot(bitmap);
          var id = snapshotId();
          _snapshots.set(id, { blob: snapshot, url: url, ts: Date.now(), size: snapshot.size });
          result.snapshotId = id;
        } catch (previewError) {
          result.previewError = previewError && previewError.message ? previewError.message : 'preview-failed';
        }
      }
      return result;
    } finally {
      if (bitmap.close) bitmap.close();
    }
  }

  var strongRetry = window.__atlasNsfwStrongRetry.create(_snapshots, pruneSnapshots);
  chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    if (msg?.target !== 'offscreen') return;

    if (msg.type === 'SET_SETTINGS') {
      if (typeof msg.filterThreshold === 'number' && Number.isFinite(msg.filterThreshold) &&
          msg.filterThreshold >= 0 && msg.filterThreshold <= 1) _threshold = msg.filterThreshold;
      initDetector().catch(function (e) {
        console.warn('[NSFW-Offscreen] Lazy init warning:', e);
      });
      sendResponse({ ok: true });
      return;
    }

    if (msg.type === 'CANCEL_WORK') {
      window.__atlasNsfwDetectorWork.cancel(msg.requestId); sendResponse({ ok: true }); return;
    }
    if (msg.type === 'CLASSIFY' || msg.type === 'PREPARE_SHIELD') {
      window.__atlasNsfwDetectorWork.run(msg, sendResponse, function () {
        return msg.type === 'CLASSIFY' ? classifyUrl(msg.url, msg.page, msg.shield === true, msg.preparedId, msg.forceFresh === true)
          : prepareShieldImage(msg.url, msg.page, msg.forceFresh === true);
      }, function () { return msg.type === 'CLASSIFY' || _preparedImages.size < PREPARED_MAX - 2; }, function (result) {
        if (result && result.preparedId) _preparedImages.delete(result.preparedId);
        if (result && result.snapshotId) _snapshots.delete(result.snapshotId);
      });
      return true;
    }

    if (msg.type === 'RELEASE_PREPARED') {
      _preparedImages.delete(String(msg.preparedId || ''));
      window.__atlasNsfwDetectorWork.wake();
      sendResponse({ ok: true });
    }

    if (msg.type === 'RETRY_STRONG') {
      strongRetry.retryStrong(String(msg.snapshotId || ''))
        .then(function (res) { sendResponse(res); })
        .catch(function (err) {
          var code = err && err.atlasErrorCode || 'retry-failed';
          sendResponse({ stage: 'strong', model: 'freepik-448-fp16', error: code,
            errorCode: code, errorDetail: err && err.atlasErrorDetail || String(err && err.message || code).slice(0, 180) });
        });
      return true;
    }

    if (msg.type === 'RELEASE_SNAPSHOT') {
      _snapshots.delete(String(msg.snapshotId || ''));
      sendResponse({ ok: true });
    }
  });
})();
