# Implementation Plan
_project: atlas · created 2026-10-09_

_Spec 002: automatic Google account switching per profile. Written 2026-10-09. Plan only: nothing here is built yet._

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

There is no separate PRD or SDD. The requirements below come from the user's
request on 2026-10-09; the design is the "Key Design Decisions" list.
`REQ-n` below points at these requirements.

- `docs/specs/001-pages-and-profiles/implementation-plan.md` — Phase 4 there built the typed-email link this spec builds on
- `payload/detractless/src/services/googleAccount.js` — how new-tab links carry the account today
- `docs/cleanup-progress.md` and `README.md` — layout, rules and commands
- The user's reference extension, "Google Accounts Autopilot" 0.7.0: `~/Downloads/HBBPKFGFBDKNONPDEHBBAPIOMEPACJBP_0_7_0_0.crx`. Reviewed 2026-10-09; what it does is summarized here. **The approach is reused, not its code.**
  - Finds the signed-in accounts by loading `https://accounts.google.com/ListAccounts?gpsia=1&source=ogb&mo=1&origin=https://accounts.google.com` with cookies. The reply holds a `<script>` whose quoted string, once `\xNN` escapes are undone, is JSON; item `[1]` is the account list, each entry with name at `[2]`, email at `[3]`, photo URL at `[4]` and account number at `[7]` (else its position).
  - On every Google, Gmail and YouTube page (content script, `document_start`), compares the account showing (`/u/N/` in the path, `authuser`, or 0 when neither) with the one a rule assigns, and reloads with `?authuser=N` when they differ.
  - Guards: a URL that already names an account is left alone; the same page is never redirected twice within 5 seconds; a navigation right after hovering Google's own account menu (`iframe[name="account"]`) is not overridden.
  - Saves the account as its number, which shifts when accounts sign in or out. Talks to no server but Google.

Requirements (acceptance criteria):

- **REQ-1 Detection.** Atlas finds the Google accounts signed into Vivaldi by itself, with name, email and photo. Nothing is typed. If it can't (the reply changes, cookies are blocked), it says so and nothing else breaks.
- **REQ-2 Picker.** A profile's edit page lists the detected accounts; choosing one links it to the profile. A linked account that is no longer signed in is shown as such. The typed email (spec 001) stays available.
- **REQ-3 Switch on profile change.** Switching Atlas profile while a Google or YouTube page is open makes that page use the new profile's account, without the user doing anything else.
- **REQ-4 Check on load.** Any Google or YouTube page that opens (typed, from a link, from history) uses the active profile's account, not just links from the new tab.
- **REQ-5 No loops, no fights.** Atlas never redirects a page more than once per load, never loops, leaves a link that already names an account alone, and doesn't undo a switch the user just made in Google's own account menu.
- **REQ-6 Fallback kept.** With detection off or failing, the spec 001 behavior (typed email, new-tab links) still works and its tests still pass.

**Key Design Decisions**:

- **Identity is the email; the number is looked up.** A profile keeps `google: { email }` (spec 001, unchanged). The account number is looked up from a fresh detection when a switch happens, because numbers shift. If the live check (T1.5.3) shows Google accepts `authuser=<email>` on every service tried, the lookup is a safety net; if not, the number is what gets used.
- **Detection lives on the browser-window side.** `src/modules/16-google-accounts.js` (bundled into `atlas.js`, runs in `window.html`) fetches and parses the account list and caches it in `chrome.storage.local["atlasGoogleAccounts"]` (`{ accounts: [{ index, name, email, photo }], at, error }`). window.html is the Vivaldi UI extension, which already holds `<all_urls>` host access (Atlas registers its page-menu script for `<all_urls>` from there, and it works live), so the request can carry Google's cookies. The new tab reads the cache and asks for a refresh by message (`{ atlas: { act: "google-accounts", refresh: true } }`); it never parses Google's reply itself. Pages are never asked to fetch it (their requests are bound by the page's CORS).
- **One decision function.** `redirectFor(url, account, guards)` in the window module decides, for one page, whether to switch and to what URL. The content script, the profile-switch handler and the tests all go through it.
- **Switch on profile change: the active tab now, the rest when shown.** Reloading every Google tab at once could cost unsaved work (a half-written Docs edit, a form). So the active tab switches at once; another Google tab switches when the user moves to it (`chrome.tabs.onActivated`). (Decision E1.)
- **Check on load: a thin content script.** `components/atlas/atlas-google-account.js` (installed with the other `components/atlas` files) runs on `*.google.com`, `*.gmail.com` and `*.youtube.com` at `document_start`, asks the window `{ atlas: { act: "google-account-for-page", url } }`, and if told to, replaces the location once. Registered beside the page menu in `03-bridge-content-scripts.js`.
- **Guards, all in `redirectFor`:** the URL already names an account → leave it; this tab was redirected for this URL in the last 5 seconds → leave it; the user switched accounts in Google's menu → leave that tab alone until the next profile switch; the linked email isn't signed in → leave it (and the edit page says so); at most one redirect per page load.
- **One account per profile, for every Google service.** No per-service rules or schedules like the reference extension's. (Decision E2.)
- **Privacy.** The account list (names, emails, photo links) stays in `chrome.storage.local`, is not in backups (`backup: false` in `atlasKeys.json`), and is only ever sent back to Google. Photos are shown from Google's own photo links.
- **The reference extension should be turned off** once this works, or the two will fight over the same pages. Atlas does not touch it; the user does. (Decision E4.)

**Decisions waiting on the user** (each has a default, so work can go ahead):

- **E1** Which Google tabs switch on a profile change. Default: the active one at once, the others when shown.
- **E2** Per-service accounts or schedules (the extension's rules). Default: no, one account per profile.
- **E3** A manual switch in Google's own account menu. Default: respected in that tab until the next profile switch.
- **E4** The "Google Accounts Autopilot" extension. Default: the user disables it after the live check.

**Implementation Context**:

- Commands to run:
  - `npm test` — `node --test tests/unit/*.test.js && python3 -m unittest discover tests/unit`
  - `python3 scripts/bundle.py` after any `src/modules` change (`--check` is run by the tests)
  - `npm run build` after any new-tab change
  - `node --check <file>` on every changed JS file
  - `python3 install.py --dry-run --no-launch`
  - Real install (`python3 install.py --yes`) is run by the user; it closes and reopens Vivaldi
- Patterns to follow:
  - Rules that are tests: files under 400 lines, functions under 80, `src/modules` files under 350, CRLF line endings, no silent `catch`, every storage key in `payload/detractless/src/constants/atlasKeys.json`
  - Window-side tests use `tests/unit/helpers/windowDom.js` (`openWindow`, recorded `chrome.*` calls, `opts.searchEngines`-style stand-ins); page-side tests load a content script into jsdom like `tests/unit/page_ctxmenu.test.js`; new-tab tests use `tests/unit/helpers/newtabDom.js`
  - No fixture holds real account data: test replies are made up in the same shape
- Interfaces to implement:
  - `src/modules/16-google-accounts.js`: `parseAccountList(text)` → `[{ index, name, email, photo }]`; `refreshGoogleAccounts()` → cache; `accountFor(email)` → `{ email, index } | null`; `redirectFor(url, account, guards)` → new URL or `null`; message handlers `google-accounts` and `google-account-for-page`; a profile-change handler and a `chrome.tabs.onActivated` handler
  - `payload/install-files/components/atlas/atlas-google-account.js`: the content script
  - `payload/detractless/src/pages/newtab/profileEditPage.js`: the picker in `googleRow`
  - `atlasKeys.json`: `local.atlasGoogleAccounts` (`backup: false`)

---

## Implementation Phases

- [ ] T1 Phase 1 Account detection, with a live check (REQ-1, REQ-6)

    - [ ] T1.1 Prime Context
        - [ ] T1.1.1 Read how the window side answers messages and registers page scripts `[ref: src/modules/04-bridge-messages.js; lines: 1-37]` `[ref: src/modules/03-bridge-content-scripts.js; lines: 1-45]`
        - [ ] T1.1.2 Read the reference extension's account-list reader (summary above) and the profile edit page's Google row `[ref: payload/detractless/src/pages/newtab/profileEditPage.js; lines: 60-75, 125-150]`
    - [ ] T1.2 Write Tests (`tests/unit/google_accounts_detect.test.js`)
        - [ ] T1.2.1 `parseAccountList` reads a made-up reply in Google's shape: names, emails, photos, numbers (from `[7]`, else position), `\xNN` and `\/` escapes undone `[ref: REQ-1]` `[activity: unit-test]`
        - [ ] T1.2.2 It returns `[]` (and never throws) for an empty reply, HTML with no script, a script with no quoted string, and JSON of the wrong shape `[ref: REQ-1]` `[activity: unit-test]`
        - [ ] T1.2.3 In the window harness: `refreshGoogleAccounts` fetches the URL above with `credentials: "include"`, caches `{ accounts, at }`, and on a network error or bad reply caches `{ accounts: [], error }` instead `[ref: REQ-1]` `[activity: unit-test]`
        - [ ] T1.2.4 The `google-accounts` message answers from the cache and refreshes when asked; `accountFor(email)` finds the number, case-insensitively, or returns null `[ref: REQ-1]` `[activity: unit-test]`
        - [ ] T1.2.5 The cached list is not in a backup export, and `atlasGoogleAccounts` is listed in `atlasKeys.json` (the storage-key test) `[ref: REQ-1; Key decisions "Privacy"]` `[activity: unit-test]`
    - [ ] T1.3 Implement
        - [ ] T1.3.1 `src/modules/16-google-accounts.js`: parser, fetch, cache, `accountFor`, message handler; refresh at window start and when asked `[activity: frontend]`
        - [ ] T1.3.2 `atlasKeys.json`: `local.atlasGoogleAccounts`, `backup: false` `[activity: frontend]`
        - [ ] T1.3.3 A read-only line in the edit page's Google row: "N Google accounts found" or the reason none were `[activity: frontend]`
    - [ ] T1.4 Implement: nothing on the new-tab link path changes in this phase (REQ-6) `[activity: frontend]`
    - [ ] T1.5 Validate
        - [ ] T1.5.1 Rules, `node --check`, `python3 scripts/bundle.py` `[activity: lint-code, review-code]`
        - [ ] T1.5.2 `npm run build`, `npm test`, dry run `[activity: run-tests]`
        - [ ] T1.5.3 **Live check (gate).** The user installs and opens a profile's edit page: does it list their accounts? Then opens `https://mail.google.com/mail/?authuser=<email>` and `https://www.youtube.com/?authuser=<email>` for a second account: does each open as it? Record both answers here. If detection fails, Phases 2-4 still go ahead on the typed email (REQ-6) and the picker shows the reason; if `authuser=<email>` fails, switching uses the number from `accountFor` `[activity: business-acceptance]`

- [ ] T2 Phase 2 Account picker on the profile edit page (REQ-2, REQ-6). Needs Phase 1. `[parallel: true]` with Phase 3

    - [ ] T2.1 Prime Context
        - [ ] T2.1.1 Read the edit page and its tests `[ref: payload/detractless/src/pages/newtab/profileEditPage.js]` `[ref: tests/unit/profile_edit.test.js]` `[ref: tests/unit/google_account.test.js]`
    - [ ] T2.2 Write Tests (`tests/unit/google_account_picker.test.js`)
        - [ ] T2.2.1 With a cached list, the Google row lists each account (photo, name, email); choosing one saves `google: { email }` and marks it chosen `[ref: REQ-2]` `[activity: unit-test]`
        - [ ] T2.2.2 A linked email not in the list shows as "not signed in right now" and stays linked `[ref: REQ-2]` `[activity: unit-test]`
        - [ ] T2.2.3 "Type an email instead" shows the spec 001 field, which still links, refuses non-emails and unlinks `[ref: REQ-6]` `[activity: unit-test]`
        - [ ] T2.2.4 With no list (detection failed), the row shows the reason and the typed field, as in spec 001 `[ref: REQ-1, REQ-6]` `[activity: unit-test]`
        - [ ] T2.2.5 "Refresh" asks the window for a new list and redraws when it arrives `[ref: REQ-1]` `[activity: unit-test]`
        - [ ] T2.2.6 Names and emails from Google are escaped; a photo link that isn't `https://*.googleusercontent.com` is not shown `[ref: Key decisions "Privacy"]` `[activity: unit-test]`
    - [ ] T2.3 Implement the picker in `googleRow` (split into its own small plain script if `profileEditPage.js` would pass 400 lines) and its styles in `profilesPage.css` `[activity: frontend]`
    - [ ] T2.4 Implement: keep `tests/unit/google_account.test.js` passing unchanged (REQ-6) `[activity: frontend]`
    - [ ] T2.5 Validate
        - [ ] T2.5.1 Rules and `node --check` `[activity: lint-code, review-code]`
        - [ ] T2.5.2 Build and `npm test` `[activity: run-tests]`
        - [ ] T2.5.3 The user picks an account in Vivaldi `[activity: business-acceptance]`

- [ ] T3 Phase 3 Google tabs switch on profile change (REQ-3, REQ-5). Needs Phase 1. `[parallel: true]` with Phase 2

    - [ ] T3.1 Prime Context
        - [ ] T3.1.1 Read how the window learns of a profile switch `[ref: src/modules/07-profile-menu.js; lines: 82-90, 210-220]` `[ref: payload/detractless/src/pages/newtab/profilesCore.js; lines: 183-195, 355-371]`
    - [ ] T3.2 Write Tests (`tests/unit/google_switch.test.js`, window harness)
        - [ ] T3.2.1 `redirectFor`: a Google or YouTube URL showing another account gets the profile's account (`authuser`, and a `/u/N/` part replaced); one already showing it, a non-Google URL, a look-alike host and an unlinked profile get `null` `[ref: REQ-3]` `[activity: unit-test]`
        - [ ] T3.2.2 A profile switch reloads the active tab when it is a Google or YouTube page, with the new account; a non-Google active tab is not touched `[ref: REQ-3]` `[activity: unit-test]`
        - [ ] T3.2.3 A background Google tab is not reloaded on the switch, but is when the user moves to it, once `[ref: REQ-3; E1]` `[activity: unit-test]`
        - [ ] T3.2.4 Switching to a profile with no linked account touches no tab `[ref: REQ-3]` `[activity: unit-test]`
    - [ ] T3.3 Implement the profile-change and tab-activation handlers in `16-google-accounts.js`, through `redirectFor` `[activity: frontend]`
    - [ ] T3.4 Implement: the account number from `accountFor` when the live check says `authuser=<email>` isn't enough `[activity: frontend]`
    - [ ] T3.5 Validate
        - [ ] T3.5.1 Rules, `node --check`, bundle `[activity: lint-code, review-code]`
        - [ ] T3.5.2 `npm test` `[activity: run-tests]`
        - [ ] T3.5.3 The user switches profile on YouTube and Gmail in Vivaldi `[activity: business-acceptance]`

- [ ] T4 Phase 4 Google pages checked as they load, with loop guards (REQ-4, REQ-5). Needs Phase 3 (shares `redirectFor`)

    - [ ] T4.1 Prime Context
        - [ ] T4.1.1 Read how the page menu script is loaded into pages and tested `[ref: src/modules/03-bridge-content-scripts.js; lines: 14-45]` `[ref: tests/unit/page_ctxmenu.test.js]`
    - [ ] T4.2 Write Tests (`tests/unit/google_page_check.test.js`)
        - [ ] T4.2.1 The content script, loaded into a jsdom page at a Google URL, asks the window and replaces the location once when told to; it does nothing when told nothing `[ref: REQ-4]` `[activity: unit-test]`
        - [ ] T4.2.2 Guard: a URL that already names an account is left alone, without asking the window `[ref: REQ-5]` `[activity: unit-test]`
        - [ ] T4.2.3 Guard: the same tab and URL are not redirected twice within 5 seconds, even if the account still differs (no loop when Google refuses the account) `[ref: REQ-5]` `[activity: unit-test]`
        - [ ] T4.2.4 Guard: after the user switches accounts in Google's own menu, that tab is left alone until the next profile switch `[ref: REQ-5; E3]` `[activity: unit-test]`
        - [ ] T4.2.5 Guard: a linked email that isn't signed in causes no redirect `[ref: REQ-5]` `[activity: unit-test]`
        - [ ] T4.2.6 The script is registered for `*.google.com`, `*.gmail.com` and `*.youtube.com` only, beside the page menu, and an old registration with the same id is updated, not duplicated `[ref: REQ-4]` `[activity: unit-test]`
    - [ ] T4.3 Implement `components/atlas/atlas-google-account.js` and the `google-account-for-page` answer `[activity: frontend]`
    - [ ] T4.4 Implement the guards in `redirectFor` (redirect history per tab in `chrome.storage.session`, manual-switch marks cleared on profile switch) and register the script in `03-bridge-content-scripts.js` `[activity: frontend]`
    - [ ] T4.5 Validate
        - [ ] T4.5.1 Rules, `node --check`, bundle `[activity: lint-code, review-code]`
        - [ ] T4.5.2 `npm test` `[activity: run-tests]`
        - [ ] T4.5.3 The user types `youtube.com` and opens Gmail from history under each profile in Vivaldi `[activity: business-acceptance]`

- [ ] T5 Integration & End-to-End Validation

    - [ ] T5.1 All node and Python tests pass (`npm test`), twice in a row
    - [ ] T5.2 Integration: an account picked on the edit page is the one a profile switch and a page load use; a typed email (fallback) works the same way
    - [ ] T5.3 End-to-end (`tests/unit/spec002_e2e.test.js`): detect two accounts → link one per profile → a YouTube tab open under Personal → switch to Work → the tab reloads once with Work's account → the user picks Personal in Google's menu → Atlas leaves it → the next profile switch applies again
    - [ ] T5.4 Speed: a Google page load waits for one message only; detection runs at start and on request, not on every page
    - [ ] T5.5 Security and privacy: the account list never leaves `chrome.storage.local` except back to Google; it is not in backups; Google's names and photos are escaped or checked before they are shown
    - [ ] T5.6 Every REQ-1 to REQ-6 criterion checked off against the tests above
    - [ ] T5.7 Every new behavior has a test that fails without it
    - [ ] T5.8 `README.md` and `docs/cleanup-progress.md` updated; the reference extension's role noted (approach reused, no code)
    - [ ] T5.9 `npm run build`, `python3 scripts/bundle.py`, dry run; then the user runs the real install
    - [ ] T5.10 Live in Vivaldi, checked by the user: YouTube and Gmail follow the profile switch; typed addresses follow the profile; no page reloads more than once; the reference extension is turned off (E4)
    - [ ] T5.11 The design decisions above still hold; any change is written down with its reason
