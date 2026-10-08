_project: atlas · created 2026-10-08_

Finish the Atlas cleanup, Phases 2 through 8, in one go. Don't stop between phases to ask whether to continue: sequencing is delegated to you.

**Read first**
- Plan: `/Users/calibro/Desktop/Projects (DRIVE CONNECTED)/Temp/docs/atlas-cleanup-plan.md`. It has the section map, the phases and the risks.
- Settings bugs: `/Users/calibro/Desktop/Projects (DRIVE CONNECTED)/Temp/docs/atlas-settings-review.md`.
- Repo: `/Users/calibro/Desktop/Projects (DRIVE CONNECTED)/atlas-installer` (git; Phases 0-1 are done, last commit "Phase 1: safer installer").

**How to work**
- One phase at a time, in plan order. At the end of each phase:
  - run every unit test: `node --test tests/unit/*.test.js` and `python3 -m unittest discover tests/unit`;
  - run `python3 install.py --dry-run --no-launch`;
  - run `node --check` on every changed JS file;
  - commit as `Phase N: <what changed>`.
- Never move to the next phase with a red test. If a phase can't go green after 3 honest attempts, `git reset --hard` to the last phase commit, write down why in the progress log, and skip to the next phase that doesn't depend on it.
- Behavior must not change unless the plan says so. Before Phase 2, write a behavior smoke test that loads `index.html` in jsdom with a fake `chrome.storage` (search bar renders, a page tab renders, a bookmark can be added, Settings opens). Every later phase must pass it.
- Size rules for files you touch or create: under 400 lines per file and under 80 lines per function. Vendored code goes in `vendor/` and is exempt. Phase 8 adds a test that enforces this.
- Line endings: keep CRLF, as the repo uses now, and add `.gitattributes` to lock it in.
- Keep storage key names and IndexedDB store names exactly as they are. Never delete user data; add migrations where needed.

**Defaults for the open questions (don't ask about these)**
- Sidebar toggle, `06-sidebar.css`, the PasteKit/Remover code, and the Downloads/Extensions pages if you prove nothing reaches them: move them into `_old/` with a note. Don't hard-delete them.
- The Windows-era docs (`PROJECT.md`, `ORIGINAL_REQUEST.md`, `TEST_INFRA.md`, `TEST_READY.md`): move them to `_old/docs/`.
- Phase 4 fixes the 3 settings bugs (instant save for every setting, UI scale, profile-switch jump) through the new settings registry.
- Bookmark page management (descriptions, reorder, a Bookmarks settings page) is out of scope. Leave it.
- Phase 2: if extracting the sources from the sourcemap doesn't rebuild to the same behavior, use the plan's fallback. Treat the current bundle as the source and split it by hand into ES modules.

**Stop and ask me only for these**
- Anything that closes, relaunches or reinstalls Vivaldi, or runs a real (non-dry-run) install or DMG build. Do all of it last, in one batch, after Phase 8.
- Deleting anything outside `_old/` that isn't covered above.
- A finding that the plan is wrong in a way that changes scope.

**Keep a log**
Append to `docs/cleanup-progress.md` after every phase: what changed, test counts, the commit hash, anything skipped and why. Keep it short; this is the handoff if the chat runs out.

**When done**
Reply in the normal template with:
- phases done vs skipped;
- final test counts;
- the largest file and largest function left, with line counts;
- the one batch of Vivaldi steps that needs my yes.
