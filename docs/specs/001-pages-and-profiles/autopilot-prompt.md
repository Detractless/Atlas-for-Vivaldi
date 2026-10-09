# Autopilot prompt for the rest of spec 001
_project: atlas · created 2026-10-09_

Paste the block below into a Claude Code session to finish Phases 2 to 5.

```text
Finish Atlas spec 001 (pages and profiles) in one go: Phases 2 to 5 of
docs/specs/001-pages-and-profiles/implementation-plan.md. Sequencing is
delegated to you; don't stop between phases to ask whether to continue.

Repo: /Users/calibro/Desktop/Projects (DRIVE CONNECTED)/atlas-installer
Read the plan, docs/cleanup-progress.md and README.md first. Phase 1 (page
subtitles) is done, committed and checked in Vivaldi.

Answers to the open decisions:
- D3 (profile edit page): no extra per-profile settings. The page has image,
  name, label, Google account and Delete. Per-profile settings stay under the
  existing share toggles.
- D4 (Google account): I haven't shared the Google extension. Use a typed
  email (it must look like an email); no account detection. Apply it to the
  Google links the new tab opens (bookmarks, search, bookmark search). Leave
  the address bar's search engine alone. Note detection as a follow-up for
  when I share the extension.
- D5 (popup and Pages design): match the current page switcher and dialogs
  (the new non-pill switcher, not the old Detractless pills). Save 2-3
  mockups of what you considered to
  docs/specs/001-pages-and-profiles/mockups.html so I can look later, and
  build the one you recommend.
- Deleting a profile: ask first, never delete the last one, and deleting the
  active one switches to the first remaining.

Rules for every phase:
- Tests first: each new behavior gets a test that fails before the code
  exists. Then npm run build, python3 scripts/bundle.py if src/modules
  changed, node --check on changed JS, npm test, and
  python3 install.py --dry-run --no-launch.
- Never move on with a red test. If the only failure is the spelling speed
  test ("suggestions are fast") while the computer is busy, rerun once and
  log it. After 3 failed attempts at one phase, git reset --hard to the last
  commit, log why, and go on to the next phase that doesn't depend on it.
- Keep the code rules: files under 400 lines, functions under 80, CRLF line
  endings, no silent catch, every storage key listed in atlasKeys.json.
- Keep storage key names and IndexedDB names as they are. Never delete user
  data; add migrations where needed.
- Commit each phase as "Spec 001 phase N: <what changed>", and tick its tasks
  in the plan with a one-line note of anything that differs from the plan.

Stop and ask me only for:
- Anything that closes, relaunches or reinstalls Vivaldi, or a real install or
  DMG build. Don't run them; give me one install command at the end.
- Deleting anything outside _old/ that the plan doesn't cover.
- Finding that the plan is wrong in a way that changes what I get.

When done, reply in the normal template with: phases done vs skipped, final
test counts, the install command, and a short list of what to check in
Vivaldi (the add popup, Settings > Pages, the profile edit page, a Google
link opening as the linked account).
```
