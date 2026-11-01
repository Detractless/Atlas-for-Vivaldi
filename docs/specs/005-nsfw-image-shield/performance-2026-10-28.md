# Image shield performance changes

Approved scope: all seven changes requested after the performance review. Keep the
strong full-image blur, centered baked-in statuses, invisible accessible retry
control, stronger-model confirmation, and SFW fade before restoration.

## Behavior

- Geometry follows scroll, resize, intersection, page layout changes, and relevant
  image/ancestor animations. Settled pages have no recurring animation-frame loop.
- Repeated geometry, status, and preview values do not repaint or re-decode.
  The existing clean blurred base is reused across statuses.
- One temporary canvas is shared per document and its backing store is cleared
  after encoding. Raster resolution follows displayed size and device pixel ratio,
  bounded to 2048 pixels on an edge and approximately two million pixels total.
- The backing is always a feathered white circle with dark text. No brightness
  sampling or color-dependent appearance remains.
- Two full image lifecycles per document can prepare/classify at once. Visible
  images have priority; background documents receive lower priority. A second,
  shared detector queue limits fetch/decode/inference tasks across tabs to two.
  Classification completion has priority over new preparation. These are work
  limits, not image-count limits: waiting images stay protected and are processed.
- Disappearing or changed images cancel queued work. Running detector work keeps
  its slot until it finishes; stale prepared images and snapshots are discarded.
  Prepared-image capacity pauses new preparation instead of generating an
  unbounded backlog of decoded images. Expiry wakes waiting work.
- DOM notifications are batched, overlapping added/removed subtrees are scanned
  once, background targets are registered once and unobserved on removal, and
  repeated style/intersection notifications share one background inspection.
  Image/background/video coverage is preserved, including open shadow roots.
- Ordinary logging reports each distinct error once with a bounded in-memory
  history. Detailed console/disk logging requires explicitly setting
  `chrome.storage.local.set({nsfwDebugLog:'verbose'})` in an Atlas console.
  False, unset, and the previous legacy true value are quiet. Existing historical
  disk logs are preserved; ordinary browsing does not append new detail logs.

## Verification

Measured actual source in an isolated Chromium page on the same computer, DPR 2,
40 benign 220 x 150 image tiles. Classifier responses were controlled for UI
measurements; this is not a whole-browser benchmark or a model accuracy change.

| Measurement | Before | After |
| --- | ---: | ---: |
| Startup status image encodes | 80 | 40 |
| Encoding time | 1584 ms | 259 ms |
| Largest test drawing surface | 896 x 600 | 448 x 300 |
| Idle frames over approximately 1.2 seconds | 72 | 0 |
| Idle rectangle reads, retry controls present | 5760 | 0 |
| Idle computed-style reads, retry controls present | 11520 | 0 |
| Pixel sampling | enabled | none |

Additional checks:

- Real browser fixture: one initial classification, one source-upgrade
  classification, zero redundant restarts; cached safe and stronger safe
  confirmations avoid reruns; blur remains until the confirmation fade completes.
- Retry control followed a transform/layout change and scrolling without another
  raster encode. Actual white-backed status raster was visually inspected.
- Real MobileNetV2 inference passed through queued PREPARE_SHIELD and CLASSIFY
  messages using a benign generated image and the retained preparation token.
- Regression tests exercise priority, two-job limits, cancellation before and
  during work, stale result disposal, duplicate render avoidance, freed canvas
  buffers, and batched background monitoring.
- Browser verification caught a load-before-batched-src ordering regression. The
  source snapshot now captures the new actual src, preventing a redundant restart
  and preserving correct restoration after a safe result.

No model weights, strictness thresholds, or stronger-model routing changed.
Full Vivaldi restart activates the updated app bundle and content registration.
Older content registrations keep unknown images hidden until restart.
