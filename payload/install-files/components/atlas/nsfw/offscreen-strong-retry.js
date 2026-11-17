/* The on-demand Freepik retry model and its bounded single-run queue. */
(function () {
  'use strict';

  var STRONG_THRESHOLD = 0.729;
  var STRONG_RETRY_CAP = 4;

  function retryFailure(code, cause) {
    var detail = String(cause && cause.message ? cause.message : (cause || code));
    detail = detail.replace(/(?:https?|chrome-extension|blob|data):[^\s"'<>]+/gi, '[resource]')
      .replace(/[\u0000-\u001f]+/g, ' ').slice(0, 180);
    var err = new Error(detail || code);
    err.atlasErrorCode = code;
    err.atlasErrorDetail = detail || code;
    return err;
  }

  async function initDetector(state) {
    if (state._strongModel) return state._strongModel;
    if (state._strongInitPromise) return state._strongInitPromise;
    state._strongInitPromise = (async function () {
      if (typeof ort === 'undefined' || !ort.InferenceSession) {
        throw retryFailure('runtime-unavailable', 'ONNX Runtime Web is unavailable');
      }
      try {
        ort.env.wasm.wasmPaths = chrome.runtime.getURL('components/atlas/nsfw/');
        ort.env.wasm.numThreads = 1;
        state._strongModel = await ort.InferenceSession.create(
          chrome.runtime.getURL('components/atlas/nsfw/models/freepik-eva02-448-fp16.onnx'),
          { executionProviders: ['wasm'], graphOptimizationLevel: 'all' }
        );
      } catch (e) {
        if (e && e.atlasErrorCode) throw e;
        throw retryFailure('model-load-failed', e);
      }
      console.info('[NSFW-Offscreen] Freepik EVA02 retry model initialized.');
      return state._strongModel;
    })();
    try { return await state._strongInitPromise; }
    catch (e) { state._strongModel = null; throw e; }
    finally { state._strongInitPromise = null; }
  }

  function softmax(values) {
    var max = -Infinity, sum = 0, out = new Array(values.length);
    for (var i = 0; i < values.length; i++) if (values[i] > max) max = values[i];
    for (var j = 0; j < values.length; j++) { out[j] = Math.exp(values[j] - max); sum += out[j]; }
    for (var k = 0; k < out.length; k++) out[k] /= sum;
    return out;
  }

  async function classifyBlob(state, blob) {
    var session = await initDetector(state);
    var bitmap;
    try { bitmap = await createImageBitmap(blob); }
    catch (e) { throw retryFailure('snapshot-decode-failed', e); }
    try {
      var side = 448;
      var canvas = document.createElement('canvas');
      canvas.width = side;
      canvas.height = side;
      var ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw new Error('strong-model-canvas-unavailable');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(bitmap, 0, 0, side, side);
      var rgba = ctx.getImageData(0, 0, side, side).data;
      var plane = side * side;
      var values = new Float32Array(3 * plane);
      var mean = [0.48145466, 0.4578275, 0.40821073];
      var std = [0.26862954, 0.26130258, 0.27577711];
      for (var p = 0; p < plane; p++) {
        values[p] = (rgba[p * 4] / 255 - mean[0]) / std[0];
        values[plane + p] = (rgba[p * 4 + 1] / 255 - mean[1]) / std[1];
        values[2 * plane + p] = (rgba[p * 4 + 2] / 255 - mean[2]) / std[2];
      }
      var input = new ort.Tensor('float32', values, [1, 3, side, side]);
      var output;
      try { output = await session.run({ [session.inputNames[0]]: input }); }
      catch (e) { throw retryFailure('inference-failed', e); }
      var logits = output[session.outputNames[0]].data;
      var probabilities = softmax(logits);
      var score = (probabilities[2] || 0) + (probabilities[3] || 0);
      return {
        stage: 'strong', model: 'freepik-448-fp16', modelVersion: 'freepik-eva02-448-fp16-clip-v1', score: Math.round(score * 10000) / 10000,
        threshold: STRONG_THRESHOLD, isNsfw: score >= STRONG_THRESHOLD
      };
    } catch (e) {
      if (e && e.atlasErrorCode) throw e;
      throw retryFailure('inference-failed', e);
    } finally {
      if (bitmap.close) bitmap.close();
    }
  }

  function retryStrong(id, state, snapshots, pruneSnapshots) {
    pruneSnapshots();
    var snapshot = snapshots.get(id);
    if (!snapshot) throw retryFailure('snapshot-expired', 'Saved image snapshot expired');
    if (state._strongQueued >= STRONG_RETRY_CAP) throw retryFailure('retry-capacity', 'Stronger model retry queue is full');
    state._strongQueued++;
    var run = state._strongRetryTail.then(function () {
      pruneSnapshots();
      if (snapshots.get(id) !== snapshot) throw retryFailure('snapshot-expired', 'Saved image snapshot expired before retry');
      clearTimeout(state._strongIdleTimer);
      return classifyBlob(state, snapshot.blob).then(function (result) {
        result.sourceUrl = snapshot.url;
        snapshots.delete(id);
        return result;
      }).finally(function () {
        state._strongIdleTimer = setTimeout(function () {
          if (state._strongModel && state._strongModel.release) state._strongModel.release();
          state._strongModel = null;
        }, 5 * 60 * 1000);
      });
    });
    state._strongRetryTail = run.catch(function () { return undefined; });
    return run.finally(function () { state._strongQueued--; });
  }

  function create(snapshots, pruneSnapshots) {
    var state = { _strongModel: null, _strongInitPromise: null, _strongIdleTimer: 0, _strongRetryTail: Promise.resolve(), _strongQueued: 0 };
    return { retryStrong: function (id) { return retryStrong(id, state, snapshots, pruneSnapshots); } };
  }

  window.__atlasNsfwStrongRetry = { create: create };
})();
