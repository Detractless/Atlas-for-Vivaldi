# NSFW image shield: blurred replacement and stronger-model retry

_Project: Atlas · 2026-10-26_

_Status: image replacement and retry implementation are complete; cascade calibration and live Vivaldi validation remain open._

## Goal

Keep a flagged image visually blurred by replacing its displayed pixels with a blurred raster made from the original image. Offer a user-initiated second check with a stronger model, and show the agreed status messages centered over the image. If the second model confirms the image is safe, keep the blur and `SFW confirmed` status visible through the status fade, then restore the original image. If it confirms NSFW, leave the blur in place and keep `NSFW confirmed` centered.

This is a second-stage confirmation flow. The existing first-stage classifier remains the default classifier; the stronger model runs only after the user selects **Retry with stronger model**.

## Context priming

Read these files before implementation:

- `payload/install-files/components/atlas/atlas-nsfw-guard.js` — current image, background and video state handling; pre-hide behavior; CSS blur.
- `payload/install-files/components/atlas/atlas-nsfw-drag.js` — current protection against dragging a flagged original image.
- `payload/install-files/components/atlas/nsfw/offscreen.js` — current fetch, decode, model invocation and image-score path.
- `src/modules/04-bridge-messages.js` — detector routing, URL cache, request coalescing and response handling.
- `src/modules/27-nsfw-verdicts.js` — persistent first-model score cache and threshold mapping.
- `src/modules/03-bridge-content-scripts.js` — document-start script registration and ordering.
- `tests/unit/nsfw_guard.test.js`, `tests/unit/nsfw_detector.test.js`, and `tests/unit/nsfw_debug.test.js` — existing test conventions and guard invariants.
- `docs/specs/004-nsfw-model-eval/implementation-plan.md` — model measurements and the measured Freepik/Marqo tradeoff.

The workspace already contains unrelated modifications. Implementation must preserve them and touch only files needed for this feature.

## Baseline and constraints

- The guard currently pre-hides unclassified `<img>` elements, then uses `filter: blur(28px) grayscale(50%)` on the original image after an NSFW or unknown verdict. The original URL remains on the element.
- The page sends the image URL to the Atlas bridge. The bridge returns the cached first-model score before it can ask a detector, so a stronger retry must use a distinct model route and must not reuse or overwrite the first-model cache entry.
- The offscreen detector fetches and decodes the image, then closes the bitmap. A retry must therefore retain an immutable copy of the exact image that received the first verdict, or otherwise prove it is checking the same pixels.
- `offscreen.js` loads the top-level TFJS graph at `models/model.json`, whose graph nodes identify it as NSFWJS MobileNetV2. A separate Marqo graph exists at `models/marqo/model.json`, but production does not load it. Freepik EVA02 FP16 weights are also present; prior evaluation measured 1,480 ms browser p95 and higher recall than Marqo, but did not compare Freepik with the active MobileNetV2 first stage.
- Freepik FP16 is the stronger-model retry candidate based on the available evaluation, and it remains retry-only. The 0.729 threshold is the measured Freepik matched-false-block operating point from Spec 004; it is provisional for the current MobileNetV2 → Freepik cascade until an evaluation set confirms the combined behavior. Do not silently switch the default model.
- The initial scope is raster `<img>` elements, including `<picture>` sources and responsive `srcset`. CSS backgrounds and videos keep their current behavior; they do not get the retry UI in this plan.
- The centered UI follows the approved Atlas mockup: no show/reveal button. A user can request one stronger-model retry from `NSFW detected`.

## Requirements

**REQ-1 — Keep the original out of the displayed element while flagged.** After the first NSFW verdict, replace the image's rendered source with a blurred raster generated from the fetched image. Preserve its measured layout, aspect ratio, `object-fit`, `object-position`, border radius and surrounding flow. Clear or neutralize active `src`, `srcset` and parent `<picture><source srcset>` candidates while the replacement is displayed. Keep original source metadata only in extension-owned, in-memory state; never put it in a page-readable data attribute.

**REQ-2 — Check the same pixels on retry.** Retry must classify the exact original image snapshot used for the first-stage verdict, not a newly fetched resource at a mutable URL. Keep the source bytes/decoded image in bounded, short-lived memory until the retry resolves or expires. Revoke generated object URLs and release bitmaps/bytes on restore, page teardown, source change, timeout, or policy disable.

**REQ-3 — Retry is a distinct model request.** The Retry button explicitly requests the stronger model once. The request bypasses the first-model score cache and has its own in-flight key and response type. The stronger model uses its own score interpretation and calibrated threshold; its score must not be written into the first-model score cache.

**REQ-4 — Centered, explicit state.** Keep the status centered over the visible image bounds, with an Atlas-styled spinner during checks and clear icon/text after a verdict. States and transitions:

1. `checking` → centered `Checking image…` while the current pre-hide is active.
2. First model says SFW → remove the checking UI and show the original image.
3. First model says NSFW → replace displayed pixels with the blurred raster; show centered `NSFW detected` and **Retry with stronger model**.
4. User selects Retry → show centered `Rechecking with stronger model…`; disable duplicate retry input.
5. Stronger model says NSFW → keep the blurred raster and centered `NSFW confirmed` status.
6. Stronger model says SFW → keep the blurred raster and centered `SFW confirmed`; fade the status out, then restore the original pixels and remove the replacement.

There is no manual reveal control. The status fade completes before the original becomes visible.

**REQ-5 — Fail closed and handle page changes.** If fetching, rasterizing, model loading, inference or message transport fails, do not reveal an image that has an NSFW/unknown verdict. Show a centered `Couldn’t verify` state while it remains hidden/blurred. A bounded user retry may repeat the failed operation; it must not loop automatically. Ignore stale results if the element's source changed, it was removed, the shield was disabled, or a newer analysis superseded the request.

**REQ-6 — Match normal page behavior when safe.** A first-stage SFW result restores the original source and page behavior without leaving a wrapper or overlay. The flagged replacement must not change the image's layout or trigger the site's image-load handlers repeatedly. Keep drag blocking for flagged media and ensure source restoration works when disabling the shield.

**REQ-7 — Bound resource use.** Strong-model loading is on demand. Limit pending source snapshots, preview raster dimensions/bytes, queued retries and retained model memory. Do not store original image bytes or URLs persistently. Emit model identity and stage in debug events without logging image bytes or adding URL-bearing persistent storage.

## Implementation phases

### T1 — Confirm model and image-snapshot transport

1. Record the exact model and preprocessing currently loaded by `models/model.json`; reconcile the code comment, installed model files and Spec 004 notes.
2. Run a focused feasibility probe for Freepik EVA02 FP16 in the current Atlas detector host: verify model load, input preprocessing, output labels, class-to-NSFW mapping, cold/warm latency, peak memory and packaged size. Use a small fixed image set that includes clear safe and explicit examples.
3. Prototype one image request through the actual extension message boundary: fetch once, produce a blurred preview raster, preserve the original snapshot for one retry, and return the preview without exceeding message/payload limits.
4. Choose a bounded preview representation and transport. Prefer a downsampled, blurred raster with a strict encoded-byte cap; create an object URL in the page's isolated content-script world and revoke it during cleanup. If the chosen browser messaging path cannot carry it safely, keep the original element hidden and revise the transport before proceeding.
5. Record the chosen strong-model threshold/calibration and latency gate here before UI implementation. Do not use Freepik's published/eval score as if it shared the first model's score scale.

**Gate:** proceed only when the stronger model runs in Atlas, returns a calibrated SFW/NSFW result, and the blurred preview can travel to the content script within a documented memory/size bound. Otherwise update this plan with a viable stronger model/transport.

### T2 — Build the image replacement lifecycle

1. Add an image-shield controller, preferably in `payload/install-files/components/atlas/atlas-nsfw-image-shield.js` to keep the existing guard below the project's 400-line component guideline. Register it adjacent to the guard in `src/modules/03-bridge-content-scripts.js` and preserve document-start ordering.
2. Track each image in a `WeakMap` record containing original `src`, `srcset`, `sizes`, active `<picture>` source candidates, layout measurements, source generation, generated preview URL, and request identifier. Do not serialize this record into DOM attributes.
3. On first-stage NSFW, have the detector host return a blurred raster generated from the same decoded source used by the classifier. The replacement should retain aspect ratio and enough dimensions for a natural-looking blur while staying under the payload cap.
4. Replace active image candidates with the blurred raster and preserve dimensions/layout. Handle source mutation, lazy loading, responsive candidates and React-style attribute rewrites without mistakenly classifying the replacement as a new source or restoring a stale image.
5. Restore original candidates exactly once on first-stage SFW, stronger-stage SFW after the status fade, policy disable, or element cleanup. Always revoke object URLs and release retained source bytes.
6. Keep unknown/failure behavior fail-closed. If no blurred raster can be built, do not restore or expose the original; retain the existing pre-hide/veil until recovery or the existing detector-unavailable policy resolves it.

**Acceptance:** while flagged, the visible image pixels come from the generated blurred raster; the active `<img>`/`<picture>` candidates do not point to the original; dimensions and styling remain stable; restore returns the exact original candidates; no stale image flashes when the page changes the source.

### T3 — Add stronger-model retry protocol

1. Add a typed retry action from the guard through `src/modules/04-bridge-messages.js` to the offscreen detector. Include an opaque request token and stage/model identifier; do not send a page-provided model name directly to the detector.
2. Add a stronger-model initialization path in `offscreen.js`, loaded only after Retry. Reuse the retained original snapshot from T1; do not refetch a potentially changed URL.
3. Bypass `nsfwCacheGet` for the retry. Coalesce duplicate requests by `requestToken + model`, cap simultaneous retries, and reject expired or unknown tokens.
4. Normalize the stronger model's output using its own calibrated decision threshold. Return `{stage, model, isNsfw, score?, error?}`; persist only first-model scores in the existing URL cache unless a separate, explicitly reviewed model-versioned cache is added later.
5. Add a short TTL and maximum-entry cap for retained image snapshots. Release a snapshot after the retry completes, expires, or the image is removed/changed. Handle detector restarts as an unknown verdict, leaving the replacement blurred.

**Acceptance:** a Retry click invokes the stronger model once on the same source snapshot, never returns the first-stage cached score, and never overwrites that score. Duplicate clicks cannot queue duplicate runs; failures leave the image covered.

### T4 — Add centered Atlas status UI and transitions

1. Render status UI in a shadow root or similarly isolated style boundary so site CSS cannot alter it. Anchor it to the image's rendered rectangle without adding layout shifts or wrapping/reparenting the site's image.
2. Match the approved Atlas mockup's palette, typography, spacing and compact controls. Keep controls centered in the image; ensure the overlay follows resize, scroll, zoom and image movement.
3. Implement the REQ-4 state machine, including a centered spinner, `NSFW detected` with **Retry with stronger model**, `Rechecking with stronger model…`, persistent `NSFW confirmed`, and the `SFW confirmed` fade before source restoration.
4. Prevent overlay pointer events from reaching the page, except the Retry button. Support keyboard activation and visible focus for Retry. Do not add a show/reveal control.
5. Add a centered error status for failed checks while preserving the blurred/hidden image. Keep retries user-initiated and bounded.

**Acceptance:** statuses remain centered over the image while it moves/resizes; no status overlaps or shifts surrounding content; after stronger SFW, the original remains blurred until the status fade ends; stronger NSFW remains blurred with its status visible.

### T5 — Tests, package and live browser validation

1. Add unit coverage for image-state transitions, source capture/restore, `<picture>`/`srcset`, stale callbacks, object URL cleanup, message cache bypass, separate model score handling, retry coalescing, timeouts and bounds.
2. Add detector tests for the stronger model's preprocessing/output mapping and for a single fetched snapshot being used by both stages.
3. Check each changed JS file with `node --check`; rebuild the Atlas bundle after `src/modules` changes and verify installer asset sync and package-size limits.
4. Run `npm test`, then `python3 install.py --dry-run --no-launch`. Do not launch Vivaldi or overwrite the installed profile from an automated script.
5. Live-check in Vivaldi on a fixture page with ordinary `<img>`, `srcset`, `<picture>`, lazy-loaded images, same-URL source changes and a responsive layout. Verify all state transitions, source masking, drag behavior, shutdown/disable restoration, console output, cold/warm model latency and memory after repeated retries.

**Live acceptance:** safe images resolve normally; an initial NSFW verdict only displays the blurred replacement; one explicit Retry runs the stronger model; stronger NSFW stays covered; stronger SFW fades its centered status and then restores the original; page mutation, detector error and disabling the shield never cause an unblurred flagged flash.

## Out of scope

- Changing model weights or stronger-model routing.
- Automatic stronger-model retry, multi-model voting, click-to-reveal, or a manual show-image button.
- Replacing CSS background images or implementing the same status UI for video.
- Network-level blocking, a proxy/CDP pipeline, or changes to unrelated Atlas UI.
- Persistent storage of originals, original URLs, blurred previews or retry state.

## Decisions to record during implementation

- Confirm the active first-stage model and the selected stronger-model build, including its calibration and model version.
- Set the exact preview max-edge/encoded-byte cap from measured payload and image-quality results.
- Match the approved mockup's fade duration; the original is restored only after that transition ends.
- Record cold-load and warm-retry p50/p95 plus peak memory. The existing Freepik evaluation measured roughly 1,480 ms browser p95 and 173 MB FP16 weights; because this runs only after an explicit Retry, report the wait clearly in the centered status and keep the image covered throughout.

## Progress log — 2026-10-26

- Confirmed the deployed first-stage graph is NSFWJS MobileNetV2 at `models/model.json`; the separate Marqo graph is not loaded by production.
- Added the retry-only Freepik EVA02 FP16 path using the existing ONNX Runtime Web assets. The 0.729 threshold is the prior Freepik matched-false-block operating point and remains provisional for the MobileNetV2 → Freepik cascade.
- The first-stage detector now creates a blurred preview and a bounded 448×448 snapshot from one decode. Retry snapshots are capped at 1 MiB each and eight entries, expire after three minutes, and are removed after a completed retry or content-script cleanup.
- Implemented an isolated centered status UI, image-source masking for `<img>`/`<picture>` candidates, user-triggered stronger retry, status fade before restoring a stronger-stage SFW image, cache bypass for the second model, and tests for the state and cleanup paths.
- Serialized stronger-model inference through a single queue capped at four active or waiting requests; expired snapshots are rejected when dequeued, and the model unloads after five idle minutes.
- The local Freepik harness smoke run loaded and scored 10 benign samples; CPU p95 was 2,724 ms. The existing browser probe measured 1,480 ms p95. Neither run compares Freepik against the active MobileNetV2 cascade; browser-level extension verification remains outstanding.
- Focused shield tests pass (26/26); all 437 JavaScript tests pass. The Python portion of `npm test` has one unrelated installer regression failure: `test_step6_writes_what_the_original_installer_wrote` (9/10 pass). The CRLF check, size-limit check and `python3 scripts/bundle.py --check` pass.
- `python3 install.py --dry-run --no-launch` passes and reports no changes made.
- The existing outside-repository eval set compares Marqo with Freepik, not the deployed MobileNetV2 → Freepik cascade. The 0.729 stronger-model threshold remains provisional until that cascade is calibrated on labeled safe and explicit samples.
- Live Vivaldi checks remain pending because BrowserOS Neo is not connected in this session. The dry run detected that Vivaldi is already running; no browser launch, relaunch or install was performed.

## Fixed first-stage threshold calibration — 2026-10-30

- Evaluated the deployed MobileNetV2 graph against the 481-image local set (237 benign, 244 explicit). The score is `porn + hentai + 0.5 × sexy`, matching the production class mapping. The sample pool is generic and does not contain all of the user's real browsing misses.
- The previous threshold (`0.443434`, corresponding to the prior default sensitivity 65) blocked 30/237 benign images (12.66%) and caught 81/244 explicit samples (33.20%).
- Using the existing evaluation target of no more than 2% benign false blocks, the best recall point was `0.889871`: 4/237 benign blocks (1.69%) and 41/244 explicit samples caught (16.80%). This is the fixed threshold selected for the first-stage model.
- Zero false blocks on this set required a threshold of `0.999998` and caught only 2/244 explicit samples (0.82%); it is too conservative to use as the standard setting. The selected cutoff is therefore the recall-maximizing point under the existing 2% false-block target, not a zero-false-positive guarantee.
- Calibration used local CPU inference with the deployed graph and a Sharp 224×224 resize. Browser canvas interpolation can differ slightly, and the public-image set is not representative of every site or the user's known missed images; real-world rates may differ.
- Sensitivity is now fixed in detector code and omitted from the Settings UI, backups and per-profile settings. The Focus lock is beside the Off / Blur image / Make image black selector and prevents a locked mode from moving to a less protective action.
