# Phase 5 and 6 Design Notes

_project: atlas · created 2026-10-18_

_Spec 003: NSFW shield video previews and overload behaviour. Agreed in discussion. Design only: nothing here is built yet. No detector or threshold changes are included._

## Baseline (what exists today)

- Guard content script runs at `document_start` in all frames, pre-hides unclassified media, classifies still images through the bridge and offscreen detector, then applies the strictness threshold map.
- Video path today: `sampleVideo` captures one canvas frame, classifies it, and reveals on the first clean verdict. A 10 s `timeupdate` interval plus `loadeddata`/`seeked`/`play` re-samples. `captureFrame` produces a JPEG data URL, so the image cache keyed on blob content cannot be reused; a video needs a `src`-keyed cache.
- Detector: one instance per profile in a hidden iframe, one classification in flight (batch fixed at 1), lease 20 s, heartbeat 5 s.
- Veil: unclassified media is revealed after roughly 3 s regardless of detector state.
- Page enforcement exists: `nsfwCountLimit` flags (default 3) trigger block or redirect.

## Phase 5: hover and preview video blocking

Goal: a preview video must never play visibly with explicit content, even when its poster or thumbnail was classified clean.

### Scope: which videos

Classify only preview-style videos. All conditions must hold:

- `muted` is true, or `loop` is true;
- no `controls`;
- intrinsic size at least 80x80 and card area below roughly 480x480;
- duration either unknown yet or at most 60 s;
- the element is not the page's main player: not the largest visible video, not inside a container covering more than 50% of the viewport.

Anything else (YouTube embeds, main players, full-page video) is left untouched: same as today.

### State machine

Per video element, keyed by `src`: `hidden` -> `sampling` -> `clean | blocked`.

- Sampling starts on `mouseenter` or `focusin` on the containing card, or on `play`, whichever is first. Frames are read from the paused or playing element.
- A cached verdict for the same `src` resolves immediately, with no sampling.
- A flagged verdict inherited from the surrounding card (thumbnail or other media in the same container) resolves to `blocked` without sampling. A clean card verdict does not: the video is a different asset.

### Sampling and decision

- Sample 3 to 4 frames in the window 0-1.8 s after sampling starts: at roughly 0, +400, +900, +1500 ms.
- Skip unusable frames: mean luma below 16 (fade or black), variance of Laplacian below roughly 100 (blur), or dHash distance at most 2 from the previous accepted frame (duplicate).
- Every accepted frame goes through the existing classify pipeline and the existing strictness-to-threshold map.
- Decision: if any accepted frame is flagged, the video is `blocked` immediately and sampling stops. The video is `clean` only when at least 3 accepted frames were classified clean, or when a cached clean verdict exists.
- Worst frame wins by construction: a single flagged frame blocks.

### Cache

- Key: digest of the video `src` (the same two-lane hash used for images).
- Same store and caps as images: 5000 entries, 7 day TTL, 1 MiB flush at 2 s. A video entry costs the same 40-70 bytes as an image entry.
- Only final verdicts are cached, never intermediate frames.
- Cache writes should record the verdict from the worst frame, not the last.

### Capture path and the taint problem

- Direct `drawImage(video)` into a canvas taints the canvas for cross-origin media without CORS. Reading pixels then throws or returns blank.
- Fallback order when a frame cannot be read: (1) classify the `poster` URL if present, through the normal image path; (2) if no poster, keep the video hidden and treat the outcome as unknown; the Phase 6 veil rules decide eventual visibility.
- Open item to verify on the probe first: whether Google Images preview videos are CORS-readable. If they are not, fail-closed for preview videos is the intended behaviour, not a bug.
- If injection is needed, set `crossOrigin = "anonymous"` when the element is inserted, before `src` is assigned; never retrofit after load.

### Integration and file limits

- The guard component is at its 400-line limit. Video logic therefore goes into a new component, `components/atlas/atlas-nsfw-video.js`, registered in `DESIRED_CS` (03-bridge-content-scripts.js) and shipped by the installer.
- No new bridge message types for classification: `CLASSIFY` is reused, with `cacheKey` set to the video `src`.
- One sampling job at a time per tab. Video sampling yields to image classification, and is skipped entirely while Phase 6 saturation is active.
- Replace the 10 s `timeupdate` re-sample with the state machine; after a final verdict the element is not re-sampled except after cache expiry.

### Acceptance criteria

- A hover preview whose frames are explicit never displays an explicit frame: sampling starts before playback, and the veil stays until `clean` or `blocked`.
- A benign preview reveals within about 2 s of the last required sample, or immediately from cache on return visits.
- The same `src` is never classified twice within one TTL window.
- No main player and no controls-bearing video is ever touched.
- Tainted-canvas case: preview stays hidden, no console errors, no infinite retry loop.

### Open questions

- Are Google preview videos CORS-readable? Measure before implementation.
- Should a `blocked` video hide only the video or the whole card? Current prejudice: video only; the poster may be clean.
- Exact blur, darkness, and dHash thresholds need probe fixtures with real previews.
- Whether poster classification is a sufficient proxy in practice; if not, fail-closed is the default.

## Phase 6: overload handling

Goal: under bursts the system must stay honest (no unclassified content revealed), bounded (no unbounded queues or timers), and usable (pages resolve in a predictable time).

### Signals

All counters are owned by the detector host (offscreen iframe), the only place that sees every job. Guards read a compact status object; no counter lives in a content script.

| Signal | Definition (initial) | Action |
|---|---|---|
| Saturation | pending job count above 8, or p95 verdict latency above 3 s over a rolling window of 20 | Admission control: finish in-flight jobs, do not take new ones until below half the threshold; new images stay hidden and marked pending |
| Tab burst | one tab owes more than 60% of the pending queue, or more than 3 cache-miss requests per second for 2 s | Per-tab throttle: at most 2 jobs in flight for that tab, 5 s cool-down; other tabs unaffected |
| Verdict density | at least 8 flagged items in a page, or flagged/classified at least 0.6 after at least 10 classified | Condemn the page: stop classifying, run the existing page enforcement (`triggerPageEnforcement`) |

Thresholds above are starting values and are tuned on the probe. p95 uses a bounded ring buffer, not an unbounded array.

### Veil rule: heartbeat-gated reveal

Replace the fixed 3 s reveal with:

1. Verdict arrives: reveal or keep hidden per the verdict.
2. Detector absent: when no heartbeat has been seen for 6 s, the guard fails open and reveals unclassified media. This is the only timed fail-open path.
3. Per-item deadline: if a specific item waits 10 s while the detector is alive but saturated, it is revealed, and the reveal is counted as a saturation casualty for instrumentation. Rationale: a permanently hidden page is worse than a rare unclassified frame on a page the user chose to load.

No fixed timer may reveal content while a heartbeat is present.

### Failure matrix

| Situation | Veil | Retry | Counters |
|---|---|---|---|
| Clean verdict | Reveal | No | classified, clean |
| Flagged verdict | Hidden, enforcement per settings | No | classified, flagged |
| CLASSIFY timeout (20 x 250 ms) | Keep hidden | Yes, bounded by admission rules | timeout; feeds latency p95 |
| Detector iframe crashed | Hidden until 6 s heartbeat loss, then reveal | Recreate on next job | absent; reset ownership |
| Lease lost to another tab | Hidden; job re-sent after lease re-acquire | Yes | ownership event |
| Saturated, item deadline hit | Reveal at 10 s | No | saturation casualty |

### Memory and state bounds

- Pending queue capped at 8; excess stays in content scripts as hidden elements, with no bridge traffic.
- p95 ring buffer 20; per-tab counters in a Map keyed by tab id, entries removed on tab close or top-level navigation.
- Condemned pages keep a page-level flag in the guard; no further jobs or timers are created.
- No new persistent storage. Video verdicts share the existing cache budget.

### Acceptance criteria

- Storm test (300 thumbnails while fast-scrolling): queue never exceeds 8 plus in-flight, memory flat, no frame reveals unclassified media, page remains scrollable.
- Kill test (terminate detector iframe): unclassified media reveals only after the 6 s heartbeat timeout, then recovers on the next job.
- Leaky-page test (fixture with flagged items): page enforcement fires at the configured flag count, classification stops afterwards.
- Normal page (10-30 images): behaviour indistinguishable from today, latency unchanged within noise.

### Open questions

- The 0.6 density ratio probably never fires on mixed search pages; the absolute count may be the only signal that matters in practice. Verify with probe data.
- Whether the 10 s per-item deadline should shrink during saturation (for example, 5 s) or stay fixed.
- Whether the tab throttle should also apply to video sampling before Phase 5 ships (it does not today; Phase 5 adds the queue).

## Sequencing and dependencies

- Phase 6 first. The heartbeat-gated veil is a prerequisite for Phase 5's fail-closed handling; the tab throttle is needed once video sampling exists.
- Both phases are independent of the model decision; they touch scheduling and visibility, not scores.
- Rough shape: Phase 6 changes the offscreen helper plus a small status protocol and guard-side admission logic, with unit tests around thresholds and fake timers. Phase 5 is one new 400-line-capped component plus probe fixtures.

## Explicitly out of scope

- Model evaluation and any detector swap: tracked in spec 004. This spec is scheduling and visibility only.
- First-seen blob or auth URL capture (stays fail-open; the heartbeat rule bounds the exposure).
- Calendar and account work from other specs.
- Click-to-reveal (forbidden by standing design), batch size above 1, extra workers, viewport weighting as the foundation, focus heuristics, ML intent detection, per-page rule zooms.

## Decision log

- Block on worst frame; reveal only when all sampled frames are clean. Agreed.
- 3-4 frames inside roughly 0-1.8 s. Agreed.
- Preview-style videos only; main players untouched. Agreed.
- Three overload signals: saturation, tab burst, verdict density. Agreed.
- Counters at the detector host; guards read a status object. Agreed.
- Veil lifts only on a verdict or proven detector absence. Agreed.
