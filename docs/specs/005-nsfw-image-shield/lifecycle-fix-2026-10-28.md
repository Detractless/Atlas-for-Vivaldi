# Image lifecycle corrections — October 28, 2026

The user approved correcting duplicate checks, retaining state across page moves, consulting saved verdicts before showing Checking, and retaining stronger-model confirmations. This approval supersedes the original plan's restriction against persisting a separate stronger-model confirmation.

## Installed behavior

- A load event for the same selected source keeps its current request. A new source relinquishes ownership of the old blurred preview.
- A source helper captures/restores original attributes and recognizes mutations written by Atlas. These changes cannot start additional model requests.
- Images reported in removed subtrees keep their state when already reconnected. Actual removals still release snapshots and UI resources.
- Cache lookup completes before a Checking status is created. Startup lookup waits for persisted scores. A saved safe preparation response includes its verdict and needs no second classification message.
- First-model scores and stronger confirmations remain separate in the digest-keyed store. A valid stronger confirmation takes precedence for the source it evaluated, including after another element or browser window is created.
- Strong retry results derive their source identity from the retained offscreen snapshot, rather than trusting an image URL supplied with a retry request. Only digests and verdict metadata are persisted.
- Cache records include model/preprocessing revisions. Unversioned or mismatched first-model scores are ignored and rebuilt; this can make the first visit after updating perform more fresh checks.
- A forced fresh request bypasses cached decisions and requests fresh source bytes. A first-model diagnostic does not erase an existing stronger confirmation.
- The seven-day retention and both classification thresholds are unchanged. HTTP URL identity and exact data-image identity remain the cache keys; changed bytes behind an unchanged HTTP URL require expiration or a forced check to reevaluate.

The new source helper is registered before the controller. A full Vivaldi restart is required to update the persistent content-script registration. Until then, older registrations can use the basic guard rather than failing when the helper is absent.

## Verification

- Final focused checks: 62 passed, including lifecycle, cache, existing shield/guard/debug behavior and code-size constraints.
- Final lifecycle smoke after the transition guard: 16 passed.
- The broader run passed 459 JavaScript tests. Python installer tests had one unrelated existing Preferences comparison failure, `test_step6_writes_what_the_original_installer_wrote`; this task did not modify installer or Preferences code.
- Real-browser fixture using the shipped source/controller/UI/guard: one initial classification, one classification after the actual source upgrade, zero redundant restarts, zero model calls for saved SFW, and stronger SFW retained after recreating the image. The real replacement raster was visually inspected for centered, readable status and backing.
- The fresh 597×335 attachment was processed with the actual TFJS WebGL first model and the actual Freepik ONNX retry preprocessing/runtime, outside the verdict cache. The first score was 0.266 (safe at the current ~0.4434 cutoff); Freepik was 1.0 (NSFW at 0.729). These are attachment bytes, not a claim to have refetched byte-identical Google thumbnail data.

The first model and automatic escalation policy were not changed. The lifecycle fix does not itself make that first-pass false negative block automatically. The fresh results support a separate model/routing decision.

Only the five Atlas runtime files were copied into the installed app, then re-signed using the installer's existing ad-hoc signing options. The browser process was left running for the user to restart when ready. Pre-change files and install verification artifacts are retained in the task workspace.
