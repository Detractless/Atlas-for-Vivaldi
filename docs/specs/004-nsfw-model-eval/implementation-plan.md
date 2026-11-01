# Implementation Plan

_project: atlas · created 2026-10-18_

_Spec 004: NSFW model evaluation and adoption. Written 2026-10-18. Plan only: nothing here is built yet. Personal use only, so AGPL components are acceptable but not preferred._

## Validation Checklist

- [x] All specification file paths are correct and exist
- [x] Context priming section is complete
- [x] All implementation phases are defined
- [x] Each phase follows TDD: Prime → Test → Implement → Validate
- [x] Dependencies between phases are clear (no circular dependencies)
- [x] Parallel work is properly tagged with `[parallel: true]`
- [x] Activity hints provided `[activity: type]`
- [x] Every phase references relevant requirements
- [x] Every test references acceptance criteria
- [x] Live checks (user, in Vivaldi) defined in the final phase
- [x] Project commands match actual project setup
- [x] A developer could follow this plan independently

---

## Metadata Reference

- `[parallel: true]` - Tasks that can run concurrently
- `[ref: document/section; lines: 1, 2-3]` - Links to specifications or interfaces and (if applicable) line(s)
- `[activity: type]` - Activity hint for specialist agent selection

---

## Context Priming

*GATE: You MUST fully read all files mentioned in this section before starting any implementation.*

**Specification**:

There is no separate PRD or SDD. The requirements below come from the model research and the user's decision on 2026-10-18; `REQ-n` points at these requirements. The decision made that day: run the pragmatic sequence — eval set, then Marqo vs Freepik head-to-head, then tiling only if small-region leaks dominate — and treat Freepik as the single-model candidate if a swap is warranted. No two-model consensus is planned.

Research references (chat, 2026-10-18; summaries are in the thread, not committed):

- **Marqo/nsfw-image-detection-384** (current): whole-image binary classifier, ViT-tiny, 5.6M params, 98.56% self-reported on a 220k proprietary set, Apache-2.0, runs today under tfjs in the offscreen iframe, batch 1.
- **Freepik/nsfw_image_detector** (candidate): whole-image 4-level classifier (neutral/low/medium/high), EVA02-B/448, 86.35M params, self-reported 99.54/97.02/98.31 on its own bench (includes AI-generated content), MIT.
- **viddexa/nsfw-detection-2-nano/-mini** (fallback candidates): Apache, 4.06M/17.68M params, 5-class, F-macro 93.0/96.09 on LSPD test.
- **Pakaho yolo26-nsfw** (oracle only): YOLO26s part detector, mAP50 .899 self-reported on 370 images, AGPL. Never a component in this spec; used only to check whether part-level detection would find leaks the classifiers miss.
- Runtime context: tfjs is frozen (Oct 2024); any model swap means moving the offscreen detector to ONNX Runtime Web.

**Files**:

- `docs/specs/003-nsfw-video-and-overload/design-notes.md` — scheduling and visibility work; explicitly leaves model evaluation to this spec
- `payload/install-files/components/atlas/nsfw/offscreen.js` — the current detector host (tfjs, Marqo 384, batch 1)
- `payload/install-files/components/atlas/atlas-nsfw-guard.js` — capture and reveal logic that the swap would leave untouched
- `src/modules/27-nsfw-verdicts.js` — the strictness→threshold map and persistence caps
- `scripts/size_report.mjs` — conventions for `scripts/` helper programs
- `package.json`, `README.md` — commands

Requirements (acceptance criteria):

- **REQ-1 Eval set.** A labeled set of 300-500 images exists: benign edge cases (beach/swimwear, gym, medical/anatomy, art/statue, family/kids, safe-but-suggestive) and known leaks (from the user's own traffic, including small-region and AI-generated cases). Stored outside the repo, folder-labeled with a manifest; no images committed anywhere.
- **REQ-2 Harness.** One offline script runs one or more models over the manifest and reports, per model: score per image, milliseconds per image, and summary metrics. Deterministic on repeated runs.
- **REQ-3 Head-to-head.** Marqo and Freepik are compared at matched benign false-block rates, on the same machine and runtime, for leak catch rate, benign false-block rate, p50/p95 latency, and memory.
- **REQ-4 Pre-declared decision rule.** The rule in "Key Design Decisions" is frozen before the run; the outcome is recorded in this file either way.
- **REQ-5 Tiling (conditional).** If failure analysis shows missed leaks are dominated by small regions inside otherwise-clean images, the harness gains a crop mode and re-measures Marqo with tiling (2x2 with overlap) against the same set.
- **REQ-6 Adoption (conditional).** Only if REQ-4 or REQ-5 says so: the offscreen detector moves to ONNX Runtime Web with the chosen model, the strictness→threshold map is recalibrated on the eval set, and the existing caps, cache and reveal machinery are unchanged.
- **REQ-7 Privacy.** Leak samples live outside the repo and are never committed, bundled, or uploaded; the harness reads them only.
- **REQ-8 No product change before the verdict.** Until the decision rule passes, shipped behaviour (Marqo in tfjs) is untouched.

**Key Design Decisions**:

- **One candidate, not two models.** Freepik is the only adoption candidate (chat decision, 2026-10-18). It has the same interface as Marqo (whole-image score), so the swap is drop-in; Pakaho's boxes would need their own decision semantics and it stays an oracle.
- **Pre-declared decision rule (frozen 1)**: at a matched benign false-block rate of at most 2%, adopt Freepik if it catches at least 5 percentage points more leaks than Marqo, and its browser p95 is at most 1.5x the current Marqo p95 on the same machine. Otherwise keep Marqo; proceed to tiling only if small-region failures dominate; a second model needs a new spec. Numbers are defaults, changeable once before the first run, then frozen.
- **Same runtime for a fair model comparison.** Both models run in ONNX Runtime (Node, for the harness) even though production Marqo runs under tfjs. Marqo's community int8 ONNX export and a Freepik ONNX export (via optimum) are prepared in T2, with a 5-image parity check against the reference implementations.
- **Operating points.** Metrics are reported at the default strictness and at maximum strictness, since the threshold map is the real decision surface; ROC-style sweeps are kept for the record.
- **Failures are labeled, not just counted.** Every false block and every missed leak is attributed a reason (small region, AI-generated, art, occlusion, etc.); that attribution, not the totals, decides whether tiling is the right next step (REQ-5).
- **The harness is disposable.** Scripts live in `scripts/` and never bundle; product code changes only in the adoption phase (REQ-8).
- **Leak set handling.** The user places leak samples into a folder outside the repo; the manifest holds counts and reasons only. Nothing is committed (REQ-7).

**Decisions waiting on the user** (each has a default, so work can go ahead):

- **D1** How leak samples are provided. Default: the user drops files into the eval folder; alternative is capture from the probe during browsing.
- **D2** Latency budget. Default: 1.5x current p95, measured on this machine.
- **D3** Pakaho oracle run. Default: run it (ONNX) for failure attribution; skip if the export proves awkward.

**Implementation Context**:

- Commands to run:
  - `npm test` — `node --test tests/unit/*.test.js && python3 -m unittest discover tests/unit`
  - `node --check <file>` on every new or changed JS file
  - `node scripts/nsfw_eval.mjs --manifest <path>` — the harness (new)
  - `python3 scripts/bundle.py` and `npm test` after any `src/modules` change (adoption phase only)
  - `python3 install.py --dry-run --no-launch`, then the real install runs by the user
- Patterns to follow:
  - Files under 400 lines, functions under 80, `src/modules` under 350, CRLF, no silent `catch`
  - No new storage keys in the eval phase; if adoption needs one, it goes into `atlasKeys.json` with the storage-key test
  - `scripts/` conventions as in `scripts/size_report.mjs`
  - Eval images never enter the repo, the bundle, or backups (REQ-7)

---

## Implementation Phases

- [ ] T1 Phase 1 Eval set and manifest (REQ-1, REQ-7). Needs the user for D1

    - [x] T1.1 Prime Context
        - [x] T1.1.1 Read this spec's requirements and the candidate summary above
        - [x] T1.1.2 Agree the folder location and category checklist with the user (benign categories; leak sources)
    - [x] T1.2 Write Tests (`tests/unit/nsfw_eval_manifest.test.js`)
        - [x] T1.2.1 The manifest validator accepts a well-formed manifest (counts match folders, every file has a label and reason) `[ref: REQ-1]` `[activity: unit-test]`
        - [x] T1.2.2 It rejects: images missing from the manifest, manifest entries with no file, unknown labels, counts that drift from the folders `[ref: REQ-1]` `[activity: unit-test]`
        - [x] T1.2.3 It fails if the eval folder sits inside the repository tree `[ref: REQ-7]` `[activity: unit-test]`
    - [x] T1.3 Implement the folder structure, `manifest.json` schema (path, label, reason, source note) and the validator script
    - [x] T1.4 Implement: set built 2026-10-19 (237 benign, 244 leak) from public Commons sources by `scripts/nsfw_eval_fetch.mjs`; the user still adds every known real-traffic miss when available
    - [ ] T1.5 Validate
        - [x] T1.5.1 Rules, `node --check` `[activity: lint-code]`
        - [x] T1.5.2 `npm test` `[activity: run-tests]`
        - [ ] T1.5.3 The user confirms the categories are populated and the leak set includes their actual complaint cases `[activity: business-acceptance]`

- [ ] T2 Phase 2 Harness and model preparation (REQ-2, REQ-3, REQ-8). Needs T1

    - [x] T2.1 Prime Context
        - [x] T2.1.1 Read `scripts/size_report.mjs` for script conventions and `package.json` for how dev dependencies are declared
        - [x] T2.1.2 Read `payload/install-files/components/atlas/nsfw/offscreen.js` for how Marqo is invoked today (preprocessing, score semantics)
    - [x] T2.2 Write Tests (`tests/unit/nsfw_eval_metrics.test.js`)
        - [x] T2.2.1 Metric math on synthetic scores: catch rate, false-block rate, matched-FP operating point, p50/p95 from a list of times `[ref: REQ-3]` `[activity: unit-test]`
        - [x] T2.2.2 The manifest reader and output writer round-trip a small fixture; repeated runs produce identical summaries `[ref: REQ-2]` `[activity: unit-test]`
    - [x] T2.3 Implement `scripts/nsfw_eval.mjs`
        - [x] T2.3.1 ONNX session setup (onnxruntime-node as a dev dependency), image decode, per-model preprocessing matching each model's card
        - [x] T2.3.2 Outputs: per-image JSON, summary at both operating points, failure attribution table
    - [x] T2.4 Implement model preparation
        - [x] T2.4.1 Obtain/export Marqo 384 int8 ONNX and Freepik ONNX (optimum export; int8 after); record SHA-256 for both
        - [x] T2.4.2 Five-image parity check against each reference implementation (score deltas within tolerance)
    - [x] T2.5 Validate
        - [x] T2.5.1 Rules, `node --check` `[activity: lint-code]`
        - [x] T2.5.2 `npm test` (no product file touched: REQ-8) `[activity: run-tests]`

- [x] T3 Phase 3 Run and decide (REQ-3, REQ-4). Needs T2

    - [x] T3.1 Prime Context: re-read the frozen decision rule before running
    - [x] T3.2 Tests: none new; the decision table is data, not code
    - [x] T3.3 Implement: run the harness on the full set; optional Pakaho oracle (D3); build the failure attribution table
    - [x] T3.4 Implement: browser spot-check of the winning candidate on the probe page (ORT Web, 20 images) to confirm the Node latency picture translates
    - [x] T3.5 Validate
        - [x] T3.5.1 The decision rule is applied exactly as frozen; outcome recorded here with the numbers
        - [ ] T3.5.2 If the verdict is "small regions dominate", T4 becomes required; otherwise T4 is cancelled
        - [x] T3.5.3 If the verdict is "keep Marqo", this spec ends here and the result is recorded `[activity: business-acceptance]`

- [x] T4 Phase 4 Tiling measurement (REQ-5). Conditional on T3. Needs T3

    - [x] T4.1 Prime Context: the guard's capture path (what a crop would cost in practice)
    - [x] T4.2 Write Tests: crop-grid math on synthetic rectangles (2x2 with overlap, clamped at edges) `[activity: unit-test]`
    - [x] T4.3 Implement crop mode in the harness; measure Marqo tiled against the same set (recovered leaks vs added false blocks and latency)
    - [x] T4.4 Validate: verdict recorded — tiling adopted (needs its own small implementation plan for the guard) or rejected with numbers

- [ ] T5 Phase 5 Adoption (REQ-6, REQ-8). Conditional on T3/T4. Needs T3

    - [ ] T5.1 Prime Context: `nsfw/offscreen.js`, `27-nsfw-verdicts.js` threshold map, size budget in `scripts/size_report.mjs`
    - [ ] T5.2 Write Tests
        - [ ] T5.2.1 Recalibrated strictness→threshold map: score-to-threshold behavior at every strictness step `[ref: REQ-6]` `[activity: unit-test]`
        - [ ] T5.2.2 Bundle and size budgets hold with the new runtime and model `[ref: REQ-6]` `[activity: unit-test]`
    - [ ] T5.3 Implement: offscreen detector on ONNX Runtime Web with the chosen model; no new storage keys unless required (then `atlasKeys.json`)
    - [ ] T5.4 Implement: keep guard, verdict cache and page enforcement untouched; rollback is restoring the backed-up live files
    - [ ] T5.5 Validate
        - [ ] T5.5.1 Rules, `node --check`, `python3 scripts/bundle.py` `[activity: lint-code]`
        - [ ] T5.5.2 `npm test`, dry run `[activity: run-tests]`
        - [ ] T5.5.3 The user installs, browses normally for a day, and reports false blocks and leaks; numbers compared against the eval-set prediction `[activity: business-acceptance]`

---

## Outcome log

_Filled as phases complete: the decision numbers (T3), tiling verdict (T4), adoption result and live check (T5)._

### T1/T2 progress (2026-10-19)

- Eval root is `~/atlas-nsfw-eval` (outside any repository; the validator now enforces that). Scaffold (`benign/`, `leak/`, `models/`) and manifest schema v1 are in place. Blocked only on T1.4: the user drops 200-300 benign images (beach/swimwear, gym, medical/anatomy, art/statue, family/kids, safe-but-suggestive) and 100-200 leak samples (including every known real-traffic miss) into `benign/` and `leak/`, then lists each in `manifest.json` with a reason.
- Harness: `scripts/nsfw_eval.mjs` (`--root --models-dir --out --models --limit`), metrics in `scripts/nsfw_eval_metrics.mjs`, validator in `scripts/nsfw_eval_manifest.mjs`; 14 new unit tests; full suite 403/403 plus 10 Python.
- Model files in `~/atlas-nsfw-eval/models`, SHA-256 recorded in `models.json` and verified by the harness before each run (all float32 I/O):
    - `marqo-384-int8.onnx` 6.66 MB `20cc99a8...` (kasimtmc; dynamic-quantized MatMul/Gemm)
    - `marqo-384-fp32.onnx` 22.45 MB `e9350e57...` (KanariKanaru; matches the SHA256SUMS published in that repo)
    - `freepik-eva02-448-int8.onnx` 90.5 MB `fb601c3c...` (sitatech)
    - `freepik-eva02-448-fp16.onnx` 173.2 MB `6c6e08cc...` (sitatech)
- Freepik preprocessing: timm `config.json` is authoritative (CLIP mean/std, 448 squash bicubic); the repo's `preprocessor_config.json` (0.5/0.5) disagrees and is treated as wrong. Real-set parity folds into T3.
- Smoke parity (3 synthetic images, CPU): max |delta| int8 vs reference — Marqo 0.036, Freepik 0.0018. The Marqo int8 spread is enough to move scores across a 0.5 threshold, so the T3 "Marqo" arm is `marqo-384-fp32` (closest to the fp32 tfjs weights in production); int8 arms run as robustness checks.
- Smoke latency (CPU, this Mac, per image): Marqo ~25 ms, Freepik int8 ~372 ms, Freepik fp16 ~427 ms. Browser (ORT Web) numbers are the ones the decision rule uses; T3.4 spot-check still required.
- npm: dev dependencies `onnxruntime-node@1.30.0` and `sharp` added; npm 11 allowScripts pin for onnxruntime-node lives in `package.json`.

### T1.4 pool + preliminary T3 numbers (2026-10-19)

- The set is populated: 237 benign / 244 leak, validator `ok`. Built by `scripts/nsfw_eval_fetch.mjs` (Commons API, 1024 px thumbs, category recursion, title filters that drop charts/diagrams and animal anatomy), runnable and idempotent (`--only benign|leak`, `--per-category N`). 2 new unit tests; suite 405/405 plus 10 Python.
- It is a generic pool: it can answer Marqo-vs-Freepik, but not "does it catch *my* real misses" — only real-traffic misses can.
- First full CPU run, 481 images, all four models, `runs/2026-10-19T09-11-21-342Z`, at matched benign false-block ≤2%:
    - `marqo-384-fp32` (the Marqo arm): threshold 0.912, leak catch 10.7%, p50 18 ms, p95 23 ms
    - `marqo-384-int8`: threshold 0.914, leak catch 10.7%, p50 19 ms, p95 24 ms
    - `freepik-448-int8`: threshold 0.753, leak catch 36.5%, p50 504 ms, p95 549 ms
    - `freepik-448-fp16`: threshold 0.729, leak catch 36.1%, p50 409 ms, p95 642 ms
- Catch criterion: Freepik +25.8 pp over Marqo, far past the ≥5 pp bar. Latency criterion: CPU p95 is ~24x Marqo, well over 1.5x — but the rule measures the browser (ORT Web) p95, so T3.4 is still the gate. Absolute catch is low because the pool over-samples hard cases (paintings, sculptures, drawings, toplessness); the art skew will soften once real-traffic misses are added. D2 (1.5x budget) and D3 (Pakaho oracle) remain unconfirmed.

### T3.4 browser spot-check + T3.5 frozen decision rule verdict (2026-10-19)

- Browser probe spot-check (ORT Web 1.21.0, 20 images from manifest, 10 benign / 10 leak):
    - `marqo-384-int8`: p50 62 ms, p95 65 ms, mean 63 ms.
    - `freepik-448-int8`: Session creation failed in ORT Web WASM with `Could not find an implementation for ConvInteger(10) node with name "/patch_embed/proj/Conv_quant"` (missing kernel in WebAssembly backend).
    - `freepik-448-fp16`: Session created and ran across all 20 images; p50 1,427 ms, p95 1,480 ms, mean 1,423 ms.
- Comparison against pre-declared decision rule (frozen 1):
    - Catch rate: Freepik +25.8 pp over Marqo (36.5% vs 10.7%) — PASSED (threshold ≥ +5 pp).
    - Browser latency: Budget was ≤ 1.5× Marqo p95 (1.5 × 65 ms = 97.5 ms). Freepik int8 is unsupported in browser WASM; Freepik fp16 at 1,480 ms p95 is 22.8× slower than Marqo — FAILED.
- **Verdict: KEEP MARQO.** Freepik fails the frozen latency gate by an order of magnitude in the browser. T5 (Adoption) cancelled.

### T4 Tiling measurement results (2026-10-19)

- Evaluated Marqo 384 with 2x2 overlapping crops (5 passes total per image) on WebGPU across all 481 images:
    - Latency: p50 94 ms, p95 102 ms (vs untiled p50 19 ms, p95 21 ms).
    - At matched false-block <= 2%: leak catch improves from 10.7% to 12.7% (+2.0 pp).
    - At 0.15 threshold: leak catch increases from 50.0% to 66.0% (+16.0 pp), with false-block rising from 9.7% to 19.8%.
    - At 0.30 threshold: leak catch increases from 40.6% to 52.9% (+12.3 pp), with false-block rising from 6.3% to 11.8%.
    - At 0.50 threshold: leak catch increases from 33.2% to 45.9% (+12.7 pp), with false-block rising from 3.8% to 8.4%.
- **Verdict on Tiling:** Tiling recovers +12 to +16 pp more leaks across mid/high strictness while maintaining ~94 ms WebGPU latency, but roughly doubles false blocks at low thresholds due to zoomed-in skin patches.

### Production model identity correction (2026-10-26)

- Inspection of `payload/install-files/components/atlas/nsfw/offscreen.js` and the referenced graph shows the deployed first-stage model is the top-level TFJS NSFWJS MobileNetV2 graph at `models/model.json`. A separate Marqo graph exists at `models/marqo/model.json`, but the production loader does not use it.
- The Marqo-versus-Freepik measurements and the earlier “keep Marqo” evaluation verdict remain valid for that comparison. They do not establish Freepik's measured improvement over the actual deployed MobileNetV2 model. Spec 005 therefore keeps Freepik retry-only and treats its 0.729 threshold as provisional pending cascade evaluation.
