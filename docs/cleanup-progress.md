# Atlas cleanup progress

Plan: `Temp/docs/atlas-cleanup-plan.md`. One section per phase, newest last.
Per-phase gate: `node --test tests/unit/*.test.js`, `python3 -m unittest discover tests/unit`, `python3 install.py --dry-run --no-launch`, `node --check` on changed JS.

## Before Phase 2: smoke test
- Added `tests/unit/newtab_smoke.test.js` (5 tests): loads the real `index.html` + bundle in jsdom with a fake `chrome.*` (`tests/unit/helpers/`) and in-memory IndexedDB (fake-indexeddb). Checks: search bar renders, stored 'off' hides it, page tabs render, a bookmark can be added via the + menu, Settings opens.
- Mutation check: making `addBookmark` a no-op turns the bookmark test red.
- Dev tools in `package.json` (jsdom, esbuild, acorn, fake-indexeddb); `node_modules/` ignored. `scripts/to_crlf.py` keeps new files CRLF.
- Tests: node 17/17, python 7/7.

## Phase 2: buildable new-tab bundle
- Fixed a Phase 0 bug first (commit f0598ec): `.gitignore` rule `dist/` also hid `payload/detractless/src/dist`, so the shipped bundles were never in git. Now `/dist/`; the original bundles are committed as found.
- Restored all 81 sources from the 5 sourcemaps into `payload/detractless/src/` (45 were missing on disk). fflate goes to `payload/detractless/vendor/fflate/` (one added export line, see its README).
- Ported every hand patch from the bundle into source: AtlasProfiles hooks (bookmarksDB init, export, import, reset), DB onblocked/onversionchange (bookmarksDB, pastekit db), Theme saves (theme.js, modalVisibility.js), grayscale in export/import, hideModal in settingsModal, DEFAULT_TABS label, chunked `openArchive`, the switcher rewrite of `tabs.js`/`tabs.css`, `sentenceCase` (now module-local), and the appended Settings CSS (now `src/pages/newtab/settingsPage.css`).
- `scripts/build.mjs` (`npm run build`) builds newtab, gate and serviceWorker bundles with a GENERATED banner, CRLF, no sourcemaps.
- Proof of no behavior change: token-level compare of rebuilt vs shipped newtab bundle: 61/66 modules identical; the rest differ only by a trailing comma, `undefined` vs `void 0`, tree-shaken unused code, and quote-less `[attr=true]` CSS selectors. gate bundle byte-identical. Service worker: `tab?.url` instead of the lowered form, plus the pastekit-db robustness patch (shared module).
- Moved to `_old/`: the 5 stale sourcemaps (`_old/dist-maps/`), `pages/newtab/modals.js` (1-line stub), `styles/panel.css` (archived side panel).
- Plan correction: `pages/gate/*` and `styles/{tokens,themes,base,components}.css` were NOT dead; they are bundle sources.
- Bug found, left for Phase 4: the `pageshow` handler in `newtab.js` calls `checkSettingsHash`, which is out of scope there (ReferenceError when a cached tab with `?settings` is restored).
- New test `tests/unit/build_sync.test.js`: dist must equal a fresh build.
- Tests: node 18/18 (smoke 5/5), python 7/7. Dry run OK. `node --check` on 75 changed JS files: 0 failures.
- Size rules not yet met by restored sources (largest: `engineModal.js` 406, `bookmarkDialog.js` 367, `bookmarksDB.js` ~385); Phase 3 splits them.

## Phase 3: no god files in the new tab
- Split every new-tab/service-worker function over 80 lines: `initializeSearch` (181), `attachScrollAffordance` (112), `renderBookmarks` (105), the DOMContentLoaded boot (92), `persistImportDataCore` (88), the SW message listener (87, now an action table), `importBookmarks` (85).
- Split the two files over 400 lines: `detractlessFormat.js` (422 -> 309, plus `snippetCsv.js` and `zipReader.js`), `engineModal.js` (406 -> 279, plus `engineIconPicker.js`).
- `tabs.js`: dead filter code and the unused `el`/`FILTER_THRESHOLD` removed; the switcher split into small functions.
- Kept the existing src layout (components/, services/, pages/, utils/, constants/) instead of the plan's suggested core/db/features tree: the restored sources are already one module per job, and moving 80 files would only churn imports.
- State: `pages/newtab/newtabState.js` already is the one small state module (live exports + setters); no events added, nothing needs them yet.
- New tests: `newtab_features.test.js` (8: pills, Enter on URL/text/engine, Shift+Enter, file-path warning, bookmarks page, backup export -> import round trip) and `service_worker.test.js` (4). Both pass on the Phase 2 bundle too, so they pin old behavior. Harness records navigations (`helpers/jsdomNavigation.js`) and closes windows after each test.
- `scripts/size_report.mjs`: lists files/functions over the limits (a whole-file IIFE wrapper counts as file scope).
- Left over the limits on purpose: `settingsPage.js` 424, `initSettingsModal` 106, `index.html` 449 (Phase 4); `pastekit/services/db.js` 462 (Phase 6).
- Tests: node 30/30, python 7/7. Dry run OK. node --check 0 failures.

## Phase 4: one owner per setting; the 3 settings bugs fixed
- `src/constants/atlasKeys.json`: the one list of storage keys (with defaults, backup and profile flags), database names and the extension id. Used by the bundles (`constants/storageKeys.js`, `defaults.js`, bookmarksDB, reset, export/import, service-worker seeds) and by `install.py` (`newtab_url()`).
- Plain scripts can't import it (profilesCore.js, preinit.js, themePreinit.js), so `tests/unit/storage_keys.test.js` pins their copies: every key the code names is listed, every listed key is used, profile categories match, DB names match, install.py's URL matches.
- Settings registry (`src/settings/registry.js` + `definitions.js`): every setting saves the moment it changes; `chrome.storage.onChanged` applies changes from other tabs live. Tab limit and search delay keep their 30-minute queue rules (`requestTabLimit`, `requestSearchDelay`).
- Settings page moved into the bundle (`src/settings/{shell,pages,controls,menu,markup}.js`), bound to the registry. Deleted: `settingsPage.js` (drove hidden controls), `settingsModal.js`, the hidden #settings-modal markup (index.html 449 -> 191 lines), the Discard button. `window.AtlasSettingsUI` kept for profilesPage.js.
- Bug fixes: (1) search bar and every other toggle save at once; (2) UI scale saves at once, `_scaleCache` is written only from the saved value, and Settings shows a size sample (Settings itself stays at 100%); (3) profile switch swaps in place (`pages/newtab/profileSwitch.js` via `AtlasProfiles.setSwitchHandler`), reloading only if that fails. Also fixed: `pageshow` with ?settings threw a ReferenceError.
- Backups now include `uiScale` (export and import).
- Moved to Phase 5: merging the theme resolvers and generating atlas-pages.css tokens (those files belong to the window.html side that Phase 5 restructures).
- Not removed: `tabLimiterUI.css` rules for the deleted limiter buttons (dead CSS, harmless).
- New tests: `settings_page.test.js` (10; 6 of them fail on the Phase 3 code, i.e. they catch the bugs), `storage_keys.test.js` (5). Feature test export now goes through Settings > Backup.
- Tests: node 45/45, python 7/7. Dry run OK. node --check 0 failures.

## Phase 5: browser-window code, installer, dead pages
- `02-detractless-bridge.js` split into `02-bridge-setup`, `03-bridge-content-scripts`, `04-bridge-messages`; the extensions popover into `09-extensions-native` + `10-extensions-popover`. Modules renumbered 01-14, no gaps. Legacy python tests' module paths updated.
- `bundle.py` writes `ATLAS_EXT_ID` / `ATLAS_NEWTAB_URL` from atlasKeys.json (no module hard-codes the id), has `--out` and `--check` (never writes the payload in tests), and its `main` is split.
- Long functions split: `showUiMenu` (87), the window right-click handler (161), `drawExtPop` (134), `atlas-ctxmenu.js` `itemsFor` (83) and `openMenu` (86). `window.__atlasDrivingNative` is now a documented module flag (`setDrivingNative`).
- Removed: the `redriveIfBlocked` no-op, `isOurPage`, 18 `Atlas.*` exports nothing read, sidebar-toggle branches (`_old/dead-code/sidebar-toggle.md`).
- Archived (`_old/archive/atlas-pages/`, with RESTORE.md): atlas-downloads.html, atlas-extensions.html, atlas-pages.css/js. Proof nothing reached them: menus open `vivaldi://downloads` and `vivaldi://extensions`; only unused constants named them.
- NOT archived, on purpose: `payload/css-mods/06-sidebar.css`. Most of it styles Vivaldi's native panels and the `vivaldi://history` page, and it hides the panel strip; moving it would visibly change the browser.
- Theme rule (moved here from Phase 4): the 4 copies live in 4 different documents and two are plain scripts, so they cannot share code; `theme_rule.test.js` runs all four over every case. atlas-pages.css token generation is moot (file archived).
- `install.py` (957 lines) -> entry point (107) + `installer/` package (util, paths, process, files, menus, preferences, extensions, system, staging; largest 214). Moved mechanically by top-level definition; test proves step 6 still writes exactly what the pre-cleanup installer wrote. `build_dmg.py` copies the package into the app and its `main` is split; a test assembles the app in a temp folder and dry-runs it.
- New tests: `atlas_window.test.js` (13 incl. 1 todo), `page_ctxmenu.test.js` (6), `theme_rule.test.js` (2), installer tests now 9.
- Bug found, not fixed (behavior change outside the plan): the Extensions popover search field resets on every keystroke (`drawExtPop` calls `closeExtPop`, which clears the query). Pinned by a todo test.
- Tests: node 66/66 + 1 todo, python 9/9. Dry run OK. node --check 0 failures.

## Phase 6: archived features out of the bundles
- Moved to `_old/archive/tools-runtime/` (with RESTORE.md): `src/pastekit/` (snippet CRUD/search, message hub, install seeding, side-panel action, "Save to Pastekit" menu) and `background/removerController.js`. The service worker no longer loads them (bundle 41 KB -> 24 KB); its message table lost the Remover actions.
- Plan deviation, for data safety: snippets still travel in backups. The plan said to drop the PasteKit DB from the new-tab bundle, but then Export would silently leave snippets out, and Reset still deletes the `pastekit` database, so export + reset would lose them. `src/services/snippetBackup.js` (282 lines, export/import/close only, same schema and format) replaces the 463-line PasteKit db module.
- Migration (`background/archivedCleanup.js`): removes the stale "Save to Pastekit" item from the browser's right-click menu; deletes no data. `pastekit` DB, `pastekit.settings`, `rhe_rules`, `rheTabStates` stay; atlasKeys.json marks the unused ones `archived`.
- Left on purpose: `services/tabSaver.js` (saved tab groups); the live tab limiter still calls it.
- New tests: snippets survive export -> import into a fresh tab (passes on the old code too); the service worker ignores Remover/PasteKit messages and removes the menu item.
- Tests: node 68/68 + 1 todo, python 9/9. Dry run OK. node --check 0 failures.

## Phase 7: no silent failures
- `src/services/storage.js`: every chrome.storage read/write in the bundles goes through `storageGet/Set/Remove/Clear`, which checks `chrome.runtime.lastError` once, logs it, and still answers (reads resolve to {}). 60 call sites in 21 files converted by a parser-based codemod (innermost calls first); the key scanner and manifest test follow the wrappers.
- `src/services/log.js` `warn()` for the bundles; `atlasWarn()` in the new `src/modules/00-shared.js` for atlas.js; plain scripts use `console.warn('[Atlas] ...')`.
- All 54 silent `catch {}` blocks and 10 silent `.catch(() => {})` handlers outside Harper now either log (menu actions, profile listeners, tab-limiter failures, import image move, IndexedDB pref writes, clipboard copy) or carry a one-line reason (no localStorage in this context, already closed, best effort). Installer: 9 `except: pass` now warn or explain.
- Removed: the service worker's `reapplyRules`/`triggerFade` messages, sent only to the archived Element Remover's page script (Phase 6 leftover).
- Harper (`payload/extensions/harper`, a separate extension) left untouched: 2 silent catches remain there.
- New test `error_handling.test.js`: no silent catch/.catch in JS, no reasonless `except: pass` in Python.
- Tests: node 70/70 + 1 todo, python 9/9. Dry run OK. node --check 0 failures.

