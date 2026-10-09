# Implementation Plan
_project: atlas · created 2026-10-09_

_Spec 001: pages and profiles. Written 2026-10-08. Plan only: nothing here is built yet._

## Validation Checklist

- [x] All specification file paths are correct and exist
- [x] Context priming section is complete
- [x] All implementation phases are defined
- [x] Each phase follows TDD: Prime → Test → Implement → Validate
- [x] Dependencies between phases are clear (no circular dependencies)
- [x] Parallel work is properly tagged with `[parallel: true]`
- [x] Activity hints provided for specialist selection `[activity: type]`
- [x] Every phase references relevant SDD sections
- [x] Every test references PRD acceptance criteria
- [x] Integration & E2E tests defined in final phase
- [x] Project commands match actual project setup
- [x] A developer could follow this plan independently

---

## Specification Compliance Guidelines

### How to Ensure Specification Adherence

1. **Before Each Phase**: Complete the Pre-Implementation Specification Gate
2. **During Implementation**: Reference specific SDD sections in each task
3. **After Each Task**: Run Specification Compliance checks
4. **Phase Completion**: Verify all specification requirements are met

### Deviation Protocol

If implementation cannot follow specification exactly:
1. Document the deviation and reason
2. Get approval before proceeding
3. Update SDD if the deviation is an improvement
4. Never deviate without documentation

## Metadata Reference

- `[parallel: true]` - Tasks that can run concurrently
- `[component: component-name]` - For multi-component features
- `[ref: document/section; lines: 1, 2-3]` - Links to specifications, patterns, or interfaces and (if applicable) line(s)
- `[activity: type]` - Activity hint for specialist agent selection

---

## Context Priming

*GATE: You MUST fully read all files mentioned in this section before starting any implementation.*

**Specification**:

There is no separate PRD or SDD. The requirements are the user's four ideas,
written up with the agreed reading in the recap; the design is the "Key Design
Decisions" list below. `REQ-n` below points at these requirements.

- `Temp/docs/atlas-recap-and-ideas.md` (section "Your ideas") — the four ideas and the open questions
- `docs/cleanup-progress.md` — how the code is laid out after the cleanup, and its rules
- `README.md` — layout, build and test commands

Requirements (acceptance criteria):

- **REQ-1 Page subtitles.** Every page has a subtitle under its name in the page switcher. It is required, 3 to 5 words (pending decision D1), editable, never cut off, and every row in the switcher is the same height. Existing pages get a starter subtitle; no page data is lost.
- **REQ-2 Add popup.** One popup replaces the + menu and its four step-by-step dialogs (name → URL → page → group). It adds a bookmark or a page (with its subtitle).
- **REQ-3 Pages in Settings.** A Pages section in Settings lists every page with its subtitle; add, edit, reorder and delete happen there, and add/edit open the same popup as REQ-2. Home stays first and can't be deleted.
- **REQ-4 Profile edit page.** In Settings → Profiles each profile shows read-only with an Edit button; Edit opens a full page for that profile (image, name, label, Google account, delete). Inline name/label editing goes away.
- **REQ-5 Google account per profile.** A profile can be linked to one of the Google accounts signed into Vivaldi. While that profile is active, Google links Atlas opens use that account.

**Key Design Decisions**:

- **Pages keep their storage.** Pages stay in `activeTabs` (chrome.storage.sync, backed up, per profile when "Bookmarks & pages" isn't shared). A subtitle is a new `sub` field on each page object; the key name and shape otherwise stay. Backups carry it with no change to export/import.
- **Migration, not deletion.** On load, a page without a valid `sub` gets a starter subtitle and is saved once (D2 decides the text). Home's built-in "Everything at a glance" becomes a stored value the same way.
- **One validation rule, one place.** A small `pageSubtitle.js` service owns the rule (word count, character cap, trimming) and is used by the switcher, the popup and Settings → Pages. The character cap is set to what fits the switcher row at its fixed width; CSS keeps `nowrap` + ellipsis only as a safety net, never as the normal look.
- **The popup replaces, not wraps.** The new popup is one component (`components/addPopup/`) used by both the + button and Settings → Pages. The old sequential add flow in `bookmarkModal.js` and the add pickers in `bookmarkDialog.js` are removed once the popup passes the same tests (git history keeps them). Rename/delete of groups and bookmarks keep using `buildDialog` until a later change.
- **Design before build.** The popup and the Pages section are shown as 2-3 mockups (A/B/C) in the new tab's own tokens before any code (D5).
- **Settings sub-pages.** The settings shell gains hidden pages (registered but not in the side list) so a profile's edit page can open from the Profiles list and come back. One profile id is passed with it.
- **Profiles keep their state.** Profiles stay in `atlasProfilesV2` (chrome.storage.local). The Google link is a new `google: { email }` field on a profile; `normalize()` in `profilesCore.js` must keep it. The email is stored, not the `u/N` number, because the numbers shift when accounts sign in or out.
- **Google links by rewrite.** One helper `withGoogleAccount(url, email)` adds `authuser=<email>` to Google URLs (google.com and its subdomains, plus youtube.com) and leaves every other URL alone. It is applied at the three places the new tab opens links: bookmark anchors (`bookmarks.js`), search submit (`search.js`), bookmark search (`bookmarkSearch.js`).
- **Detection is a spike, with a fallback.** Whether the new tab can read the signed-in accounts (Google's account list page, or the method the user's Google extension uses) is checked live first. If it can't, the edit page takes the email typed in; linking still works, it just isn't a picker.

**Decisions waiting on the user** (each blocks only its phase):

- **D1** Subtitle length: 3-4 words or 3-5. (Phase 1)
- **D2** Starter subtitle for existing pages, for example "Your saved links here". (Phase 1)
- **D3** What else is set per profile on the edit page (start page, theme, search engine…). (Phase 3)
- **D4** The Google extension the user mentioned, and whether address-bar searches and typed Google addresses should follow the profile too. (Phase 4)
- **D5** Which popup / Pages design (A, B or C). (Phase 2)

**Implementation Context**:

- Commands to run:
  - `npm test` — `node --test tests/unit/*.test.js && python3 -m unittest discover tests/unit`
  - `npm run build` — rebuilds `payload/detractless/src/dist/` (the build_sync test fails if dist is stale)
  - `python3 scripts/bundle.py` — rebuilds `payload/install-files/atlas.js` from `src/modules/`
  - `node --check <file>` on every changed JS file
  - `python3 install.py --dry-run --no-launch`
  - Real install (`python3 install.py --yes`) is run by the user; it closes and reopens Vivaldi
- Patterns to follow:
  - Rules that are tests: files under 400 lines, functions under 80, CRLF line endings, no silent `catch {}`, every storage key listed in `payload/detractless/src/constants/atlasKeys.json`
  - Settings controls go through the registry (`src/settings/registry.js`, `definitions.js`)
  - Storage goes through `src/services/storage.js` (`storageGet/Set/Remove`)
  - New-tab behavior tests use `tests/unit/helpers/newtabDom.js` (`openNewTab`, `click`, `waitFor`, `settle`)
- Interfaces to implement:
  - `src/services/pageSubtitle.js`: `validSubtitle(text)`, `subtitleProblem(text)` (a short reason, or null), `starterSubtitle(page)`
  - `src/components/addPopup/addPopup.js`: `openAddPopup({ mode: 'bookmark' | 'page', page?, onSaved })`
  - `window.AtlasSettingsUI.register({ ..., hidden: true })` and `go(id, arg)`
  - `AtlasProfiles.update(id, { google: { email } | null })`
  - `src/services/googleAccount.js`: `withGoogleAccount(url, email)`, `activeGoogleEmail()`

---

## Implementation Phases

- [x] T1 Phase 1 Page subtitles (REQ-1)

    - [x] T1.1 Prime Context
        - [x] T1.1.1 Read how pages are stored, shown and renamed `[ref: payload/detractless/src/components/tabs/tabs.js; lines: 37-67, 157-226, 241-272]`
        - [x] T1.1.2 Read the switcher row styles and the menu width `[ref: payload/detractless/src/components/tabs/tabs.css; lines: 47-113]`
        - [x] T1.1.3 Read Home's built-in subtitle and the starter pages `[ref: payload/detractless/src/constants/defaults.js; lines: 6]` `[ref: payload/detractless/src/services/starterContent.js; lines: 45-50]`
        - [x] T1.1.4 Get D1 and D2 from the user
    - [x] T1.2 Write Tests
        - [x] T1.2.1 `pageSubtitle` rule: accepts 3-5 words within the cap; rejects 1-2 words, too many words, too many characters, blank; trims spaces `[ref: REQ-1]` `[activity: unit-test]`
        - [x] T1.2.2 New tab: every page in the switcher shows its subtitle, Home included `[ref: REQ-1]` `[activity: unit-test]`
        - [x] T1.2.3 Migration: pages stored without `sub` get the starter subtitle once and are saved; pages with a valid `sub` are untouched; page count and bookmarks are unchanged `[ref: REQ-1]` `[activity: unit-test]`
        - [x] T1.2.4 Rename dialog: changing a subtitle saves it; an invalid one shows the reason and saves nothing `[ref: REQ-1]` `[activity: unit-test]`
        - [x] T1.2.5 New page: creating a page asks for name and subtitle; it can't be created without a valid subtitle `[ref: REQ-1]` `[activity: unit-test]`
        - [x] T1.2.6 Backup: a subtitle survives export → import into a fresh new tab `[ref: REQ-1]` `[activity: unit-test]`
    - [x] T1.3 Implement
        - [x] T1.3.1 `src/services/pageSubtitle.js` with the rule and the character cap `[activity: frontend]`
        - [x] T1.3.2 Migration at page load in `tabs.js`, Home's fallback moved into it `[activity: frontend]`
        - [x] T1.3.3 Switcher rows: fixed menu width, one-line subtitle, equal row height `[activity: frontend-css]`
        - [x] T1.3.4 Subtitle field in the page rename dialog and in the new-page prompt `[activity: frontend]`
    - [x] T1.4 Implement: note `activeTabs` items' `sub` field in `atlasKeys.json` (`note` text only; the key is unchanged) `[activity: frontend]`
    - [ ] T1.5 Validate
        - [x] T1.5.1 Size, line-ending and error-handling rules pass; `node --check` on changed files `[activity: lint-code, review-code]`
        - [x] T1.5.2 `npm run build`, then `npm test`, then the dry run `[activity: run-tests]`
        - [x] T1.5.3 User checks in Vivaldi: the longest allowed subtitle fits without cutting off, rows are even `[activity: business-acceptance]`
        - Done 2026-10-09 with D1 = 3-5 words and D2 = "Your saved links here" (the user's /goal). Also added: Home can be right-clicked for Rename and Edit subtitle (no Delete), and the page dialog's title is the name the switcher shows. The backup test (T1.2.6) passes on the old code too, since activeTabs is exported whole; it guards the behavior. Menu fixed at 300px, subtitles capped at 32 characters; the user checked it in Vivaldi on 2026-10-09 and it looks right.

- [x] T2 Phase 2 New add popup and Pages in Settings (REQ-2, REQ-3). Needs Phase 1 (the popup uses the subtitle rule).

    - [x] T2.1 Design gate `[component: addPopup]`
        - [x] T2.1.1 Read the current add flow and the dialog builder `[ref: payload/detractless/src/components/bookmarks/bookmarkModal.js; lines: 1-283]` `[ref: payload/detractless/src/components/bookmarks/bookmarkDialog.js; lines: 41-120, 293-366]`
        - [x] T2.1.2 Show 2-3 mockups of the popup and the Pages section in the new tab's tokens; get D5 `[activity: ui-design]`
    - [x] T2.2 Add popup `[component: addPopup]`
        - [x] T2.2.1 Prime Context: bookmark storage (`bookmarksDB`), groups, the + button wiring `[ref: payload/detractless/src/components/bookmarks/bookmarks.js; lines: 160-200]`
        - [x] T2.2.2 Write Tests: + opens the popup; a bookmark with name, URL, page and group is saved and shown; a new group can be made from it; a page with name and subtitle is created and opened; empty or invalid fields show inline reasons and save nothing; Escape and the backdrop close it without saving. Update `newtab_smoke.test.js` "a bookmark can be added through the + menu" to the new popup without weakening it `[ref: REQ-2]` `[activity: unit-test]`
        - [x] T2.2.3 Implement `components/addPopup/addPopup.js` + `.css` (one popup, both modes) and point the + button at it `[activity: frontend]`
        - [x] T2.2.4 Remove the old sequential add flow once all add tests pass `[activity: frontend]`
        - [x] T2.2.5 Validate: rules, build, tests `[activity: run-tests]`
    - [x] T2.3 Settings → Pages `[component: settings-pages]`
        - [x] T2.3.1 Prime Context: the settings shell and how a page registers `[ref: payload/detractless/src/settings/shell.js; lines: 15-47, 185-199]` `[ref: payload/detractless/src/settings/pages.js; lines: 75-88]`
        - [x] T2.3.2 Write Tests: Pages lists every page in order with its subtitle; Edit opens the popup filled in and saves; Add page opens the popup in page mode; Move up/down reorders and the switcher follows; Delete asks first and removes the page and its bookmarks; Home has no Delete `[ref: REQ-3]` `[activity: unit-test]`
        - [x] T2.3.3 Implement the Pages settings page (`src/settings/pagesSection.js`), registered in the Settings list `[activity: frontend]`
        - [x] T2.3.4 Validate: rules, build, tests `[activity: run-tests]`
    - Done 2026-10-09. Design A built (mockups.html has A, B and C). The + button opens the popup directly; the + menu, bookmarkModal.js and tabs.js addNewTab are gone. Page edits live in tabs.js (updatePage, deletePage, movePage), shared by the switcher's right-click dialog and Settings > Pages, which is first in the Settings list. Found while testing: a group picked before the group list finished loading was reset; the list now keeps it.

- [ ] T3 Phase 3 Profile edit page (REQ-4). Independent of Phases 1-2. `[parallel: true]`

    - [x] T3.1 Prime Context
        - [x] T3.1.1 Read the profile model and its update rules `[ref: payload/detractless/src/pages/newtab/profilesCore.js; lines: 1-60, 185-230]`
        - [x] T3.1.2 Read the current Profiles settings page `[ref: payload/detractless/src/pages/newtab/profilesPage.js; lines: 38-139]`
        - [x] T3.1.3 Get D3 from the user
    - [x] T3.2 Write Tests
        - [x] T3.2.1 Settings shell: a hidden page opens with `go(id, arg)`, isn't in the side list, and Back returns to its parent `[ref: REQ-4]` `[activity: unit-test]`
        - [x] T3.2.2 Profiles list: rows show image, name and label read-only, each with Edit; no inline text boxes `[ref: REQ-4]` `[activity: unit-test]`
        - [x] T3.2.3 Edit page: changing name, label or image saves at once and the list and the toolbar avatar follow `[ref: REQ-4]` `[activity: unit-test]`
        - [x] T3.2.4 Delete: asks first; the last profile can't be deleted; deleting the active one switches to the first remaining `[ref: REQ-4; profiles-plan decision 4]` `[activity: unit-test]`
        - [x] T3.2.5 `profilesCore` keeps unknown-but-valid fields it should keep (`google`) through `normalize()` `[ref: REQ-4, REQ-5]` `[activity: unit-test]`
    - [x] T3.3 Implement
        - [x] T3.3.1 Hidden pages and `go(id, arg)` in `src/settings/shell.js` `[activity: frontend]`
        - [x] T3.3.2 Profiles list rows + Edit button; new `profileEditPage.js` (plain script, like `profilesPage.js`) `[activity: frontend]`
        - [x] T3.3.3 Fields from D3, if any, wired to existing settings `[activity: frontend]`
    - [x] T3.4 Implement: keep `storage_keys.test.js` pins in step with any new profile field `[activity: frontend]`
    - [x] T3.5 Validate
        - [x] T3.5.1 Rules and `node --check` `[activity: lint-code, review-code]`
        - [x] T3.5.2 Build and `npm test` `[activity: run-tests]`
        - [ ] T3.5.3 User checks the edit page in Vivaldi `[activity: business-acceptance]`
    - Done 2026-10-09 with D3 = no extra per-profile settings. The Google account field is built in Phase 4. Profiles got a `google` field ({email} or null) in profilesCore.js (normalize, update, backups). The image picker moved from the list to the edit page. T3.5.3 (live check) waits for the user's install.

- [ ] T4 Phase 4 Google account per profile (REQ-5). Needs Phase 3 (the field lives on the edit page).

    - [x] T4.1 Prime Context
        - [ ] T4.1.1 Read the user's Google extension (D4) and how it finds the signed-in accounts
        - [x] T4.1.2 Read where the new tab opens links `[ref: payload/detractless/src/components/bookmarks/bookmarks.js; lines: 172]` `[ref: payload/detractless/src/components/search/search.js; lines: 120-135]` `[ref: payload/detractless/src/components/bookmarks/bookmarkSearch.js; lines: 52]`
        - [ ] T4.1.3 Spike, live in Vivaldi: can the new tab read the account list? Decide picker vs typed email `[activity: research]`
    - [x] T4.2 Write Tests
        - [x] T4.2.1 `withGoogleAccount`: adds `authuser` to google.com, its subdomains (mail, drive, docs, calendar) and youtube.com; replaces an existing `authuser`; keeps other parameters and the hash; leaves non-Google URLs and look-alike hosts (`google.com.evil.test`) alone `[ref: REQ-5]` `[activity: unit-test]`
        - [x] T4.2.2 New tab: with an active profile linked to an email, a Google bookmark, a Google search and a bookmark-search result all open with that account; with no link they open unchanged `[ref: REQ-5]` `[activity: unit-test]`
        - [x] T4.2.3 Switching profile switches the account used, without a reload `[ref: REQ-5]` `[activity: unit-test]`
        - [x] T4.2.4 Edit page: link, change and unlink an account; a typed value must look like an email `[ref: REQ-5]` `[activity: unit-test]`
    - [x] T4.3 Implement
        - [x] T4.3.1 `src/services/googleAccount.js` (`withGoogleAccount`, `activeGoogleEmail`) `[activity: frontend]`
        - [x] T4.3.2 Apply it at the three link-opening points `[activity: frontend]`
        - [x] T4.3.3 Google account field on the edit page: picker if the spike worked, typed email if not `[activity: frontend]`
    - [ ] T4.4 Implement, only if D4 says so: address-bar searches follow the profile (the Google engine template in `src/modules/15-addressbar-engine.js` carries `authuser`) `[activity: frontend]`
    - [x] T4.5 Validate
        - [x] T4.5.1 Rules and `node --check` `[activity: lint-code, review-code]`
        - [x] T4.5.2 Build and `npm test` `[activity: run-tests]`
        - [ ] T4.5.3 User checks in Vivaldi: Gmail and Drive open as the linked account for each profile `[activity: business-acceptance]`
    - Done 2026-10-09 with D4 = typed email, no detection, address bar left alone. Not done, by that decision: T4.1.1 and T4.1.3 (the user's Google extension and the detection spike; follow-up when it is shared) and T4.4 (address bar). Searches the browser runs with its own default engine (engine set to the browser default) don't carry the account either; a chosen Google engine does. Also covered: a /u/N/ account number in a Google path is replaced by the email, and bookmark links re-read the account just before opening. T4.5.3 (live check) waits for the user's install.

- [ ] T5 Integration & End-to-End Validation

    - [x] T5.1 All node and Python tests pass (`npm test`), twice in a row
    - [x] T5.2 Integration: a subtitle edited in Settings → Pages shows in the switcher; a page added from the popup appears in Settings → Pages; profile edits reach the toolbar profile menu
    - [x] T5.3 End-to-end in the jsdom harness: add a page with a subtitle → add a bookmark to it → link a Google account to the active profile → open the bookmark with that account → switch profile → the same bookmark opens with the other account
    - [x] T5.4 Speed: the new tab still opens without a visible delay; the migration runs once, not on every load
    - [x] T5.5 Privacy: the linked email is only stored in `atlasProfilesV2` and only sent to Google as `authuser`; no other site gets it
    - [x] T5.6 Every REQ-1 to REQ-5 criterion checked off against the tests above
    - [x] T5.7 Every new behavior has a test that fails without it
    - [x] T5.8 `docs/cleanup-progress.md` and `README.md` updated
    - [ ] T5.9 `npm run build`, `python3 scripts/bundle.py`, dry run, then the user runs the real install and the DMG build
    - [ ] T5.10 All five requirements live in Vivaldi, checked by the user
    - [x] T5.11 The design decisions above still hold; any change is written down with its reason
    - Done 2026-10-09: `tests/unit/spec001_e2e.test.js` (5) covers T5.2-T5.5; these check flows across features already built, so they passed on arrival. T5.9: build, bundle check and dry run done; the real install and the DMG build are the user's. T5.10 waits for the user's live check. node 134/134 + 1 todo (the old Extensions-popover search bug), python 10/10, twice in a row.
