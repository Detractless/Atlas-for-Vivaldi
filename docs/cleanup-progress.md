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

