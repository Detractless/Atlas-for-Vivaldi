# Project: Atlas for Vivaldi Modularization & Spell Check

## Architecture
Atlas for Vivaldi is a comprehensive UI customization layer and offline productivity suite for the Vivaldi desktop browser.
The project modularization decomposes monolithic CSS and JavaScript assets into decoupled domain modules, updates the build pipeline to compile them cleanly with PyInstaller, enriches the address bar context menu with offline spelling assistance, bundles the offline Harper grammar extension, and synchronizes assets to live browser profiles.

### Architecture Overview
1. **CSS UI Mod Layer (`payload/css-mods/`)**:
   - Decomposed into 8 discrete stylesheets named alphabetically (`00-tokens.css` through `07-extensions.css`) so Vivaldi's native UI mod loader initializes tokens first.
   - Deletes legacy monolithic `atlas.css` to prevent duplicate rule application.
2. **JavaScript Modular Source (`src/modules/`)**:
   - Decomposed into 12 cohesive modules (`01-addressbar.js` through `12-spelling.js`), each under 350 lines.
   - Compiled by `scripts/bundle.py` into an outer IIFE with an internal `Atlas` namespace and exported to `payload/install-files/atlas.js`.
3. **Address Bar Context Menu & Spelling**:
   - `03-contextmenu.js` removes Undo/Redo and retains Cut, Copy, Paste, Paste & Go, Select All.
   - `01-addressbar.js` activates persistent `spellcheck = true` on URL input fields.
   - `12-spelling.js` provides an in-memory offline lexicon and bounded edit-distance candidate generator, prepending top 2-3 suggestions to right-click menus on misspelled words.
4. **Offline Harper Extension (`payload/extensions/harper/`)**:
   - Unpacked Manifest V3 browser extension packaged in payload.
   - Installed to `%LOCALAPPDATA%\Vivaldi\Atlas\extensions\harper` and registered in external extension registry.
   - Coexists peacefully with Atlas UI speech-bubble context menu via bubble-phase isolation.
5. **Build, Packaging & Live Sync Pipeline**:
   - `build.cmd` bundles modules, validates JS with `node -c`, compiles `dist/AtlasSetup.exe` via PyInstaller, and cleans temporary artifacts (`build/`, `.spec`).
   - `scripts/refresh_backup.py` updates `atlas-installer-backup-2026-09-08.zip`.
   - Full CRLF (`\r\n`) line ending enforcement across all text files.
   - Live synchronization to `%LOCALAPPDATA%\Vivaldi`.

## Feature Inventory
Every feature from the original request and survey is assigned to a milestone:
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | CSS Token Isolation | Split design tokens, variables, elevation into `00-tokens.css` (<=350 lines) | M1 | ORIGINAL_REQUEST §R1 |
| 2 | CSS Chrome & Layout | Window layout, titlebar, window controls, rounded viewport in `01-chrome.css` (<=350 lines) | M1 | ORIGINAL_REQUEST §R1 |
| 3 | CSS Tabs Styling | Tab strip geometry, active tab fusion, soft idle blur in `02-tabs.css` (<=350 lines) | M1 | ORIGINAL_REQUEST §R1 |
| 4 | CSS Address Bar | Pill shape, focus expansion, hairline loader in `03-addressbar.css` (<=350 lines) | M1 | ORIGINAL_REQUEST §R1 |
| 5 | CSS Toolbar Styling | Toolbar buttons, icons, spacing in `04-toolbar.css` (<=350 lines) | M1 | ORIGINAL_REQUEST §R1 |
| 6 | CSS Menus Styling | Custom speech-bubble context menu and tails in `05-menus.css` (<=350 lines) | M1 | ORIGINAL_REQUEST §R1 |
| 7 | CSS Sidebar Styling | Tools sidebar, panel glyphs, blur in `06-sidebar.css` (<=350 lines) | M1 | ORIGINAL_REQUEST §R1 |
| 8 | CSS Extensions Styling | Extensions popover grid, puzzle piece in `07-extensions.css` (<=350 lines) | M1 | ORIGINAL_REQUEST §R1 |
| 9 | Monolithic CSS Removal | Delete `payload/css-mods/atlas.css` and update `install.py` to purge stale live file | M1 | Survey Finding |
| 10 | JS Core Modules (01-11) | Decompose `atlas.js` into cohesive modules 01-11 under `src/modules/` (all <=350 lines) | M2 | ORIGINAL_REQUEST §R2 |
| 11 | JS Bundler Script | Create `scripts/bundle.py` to bundle modules in order, check <=350 lines, enforce CRLF | M2 | ORIGINAL_REQUEST §R2 |
| 12 | Build Command Integration | Update `build.cmd` to bundle JS, run `node -c`, compile PyInstaller, and clean build/spec | M2 | ORIGINAL_REQUEST §R2, §R5 |
| 13 | Address Bar Menu Cleanup | Remove Undo/Redo; keep Cut, Copy, Paste, Paste & Go, Select All in `03-contextmenu.js` | M3 | ORIGINAL_REQUEST §R3 |
| 14 | Address Bar Spellcheck | Set persistent `spellcheck = true` on address field input in `01-addressbar.js` | M3 | ORIGINAL_REQUEST §R3 |
| 15 | Offline Spelling Engine | Fast offline dictionary check and candidate generator in `12-spelling.js` (<=350 lines) | M3 | ORIGINAL_REQUEST §R2, §R3 |
| 16 | Menu Spelling Suggestions | Prepend top 2-3 suggestions on misspelled words in address bar context menu | M3 | ORIGINAL_REQUEST §R3 |
| 17 | Harper Extension Payload | Package offline unpacked Harper extension under `payload/extensions/harper` (MV3) | M4 | ORIGINAL_REQUEST §R4 |
| 18 | Harper Installer Support | Update `install.py` to copy Harper extension and register via external extension keys | M4 | ORIGINAL_REQUEST §R4 |
| 19 | Context Menu Coexistence | Ensure Harper in-page tooltips and Atlas context menus do not interfere | M4 | ORIGINAL_REQUEST §R4 |
| 20 | Executable Packaging | Rebuild `dist/AtlasSetup.exe` with exit code 0 via `build.cmd` | M5 | ORIGINAL_REQUEST §R5 |
| 21 | PyInstaller Cleanup | Clean `build/` directory and `.spec` files post-build | M5 | ORIGINAL_REQUEST §R5 |
| 22 | Backup Archive Refresh | Refresh `atlas-installer-backup-2026-09-08.zip` with updated files | M5 | ORIGINAL_REQUEST §R5 |
| 23 | CRLF Line Endings | Ensure 100% Windows CRLF (`\r\n`) across all modified and new text files | M5 | ORIGINAL_REQUEST §R5 |
| 24 | Live AppData Sync | Sync all updated files to live Vivaldi AppData installation (`resources\vivaldi` and `Atlas\css-mods`) | M5 | ORIGINAL_REQUEST §R5 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | CSS Modularization | Split `atlas.css` into 8 stylesheets <=350 lines, delete `atlas.css`, update `install.py` stale check | none | DONE |
| M2 | JS Modularization & Bundler | Decompose JS modules 01-11, build `scripts/bundle.py`, integrate into `build.cmd` | none | DONE |
| M3 | Context Menu & Spell Check | Address bar menu cleanup (no Undo/Redo), `spellcheck=true`, `12-spelling.js` offline suggestions | M2 | DONE |
| M4 | Harper Extension Integration | Package `payload/extensions/harper`, update `install.py` registry/copy, non-interference guard | M1, M2 | DONE |
| M5 | Packaging, Backup, CRLF & Sync | Run `build.cmd`, clean artifacts, refresh backup zip, verify CRLF, sync to live AppData | M1, M2, M3, M4 | DONE |
| M-E2E | E2E Testing Suite | Develop automated test suite (Tiers 1-4) in `tests/e2e/`, publish `TEST_READY.md` | none (parallel) | DONE |

## Interface Contracts

### Shared JavaScript Namespace (`Atlas`)
Bundled code in `payload/install-files/atlas.js` runs in an outer IIFE:
```javascript
(function () {
  'use strict';
  var Atlas = window.__Atlas = window.__Atlas || {};
  // ... modules attach shared exports to Atlas ...
})();
```
- `Atlas.showUiMenu(items, targetEl, options)`: Renders custom speech-bubble context menu.
- `Atlas.closeMenu()`: Closes open context menu.
- `Atlas.closeExtPop()`: Closes open extensions popover.
- `Atlas.setPanelBlur(enable)`: Toggles webview transition blur.
- `Atlas.addDropTail(menu, targetEl, pos)`: Attaches SVG speech-bubble tail.
- `Atlas.spelling`:
  - `Atlas.spelling.checkWord(word) -> boolean`
  - `Atlas.spelling.getSuggestions(word, maxResults=3) -> string[]`

### CSS Mod Loading Contract
- All CSS files reside in `payload/css-mods/`.
- Alphabetical prefixing (`00-`, `01-`, ... `07-`) guarantees tokens load before components.
- Zero dependencies on external stylesheets or web fonts; fully offline.

### Harper Extension Contract
- Location: `payload/extensions/harper/` (MV3).
- Installed destination: `%LOCALAPPDATA%\Vivaldi\Atlas\extensions\harper`.
- Windows Registry Entry: `HKCU\Software\Vivaldi\Extensions\lodbfhdipoipcjmlebjbgmmgekckhpfb` with `path` pointing to manifest.

## Code Layout
```text
C:\Users\Calibro1\Downloads\atlas-installer\
├── build.cmd                                      Updated build script (bundle + pyinstaller + clean)
├── install.py                                     Installer script (adds Harper step, cleans stale CSS)
├── README.md
├── scripts/
│   ├── bundle.py                                  Modular JS bundler & line count validator
│   └── refresh_backup.py                          Backup zip refresh utility
├── src/
│   └── modules/
│       ├── 01-addressbar.js                       Address field focus, new tab marker, spellcheck=true
│       ├── 02-detractless-bridge.js               Detractless bridge stubs & session repair
│       ├── 03-contextmenu.js                      UI context menu manager & address bar menu cleanup
│       ├── 04-toolbar.js                          React fiber toolbar helper & context menu
│       ├── 05-profile-menu.js                     "D" account button interceptor
│       ├── 06-reload-helper.js                    Reload button enabler on internal pages
│       ├── 07-extensions-popover.js               Extensions popover management & grid
│       ├── 08-theme-sync.js                       Theme sync listener & chrome classes
│       ├── 09-sidebar.js                          Sidebar toggle & transition blur
│       ├── 10-element-remover.js                  Element remover engine bridge
│       ├── 11-page-progress.js                    Page-load progress indicator
│       └── 12-spelling.js                         Offline dictionary & spelling candidate engine
├── payload/
│   ├── css-mods/
│   │   ├── 00-tokens.css                          Design tokens & theme variables (80 lines)
│   │   ├── 01-chrome.css                          Window layout & control buttons (162 lines)
│   │   ├── 02-tabs.css                            Tab strip & fusion (122 lines)
│   │   ├── 03-addressbar.css                      Pill shape, suggestions & loader (196 lines)
│   │   ├── 04-toolbar.css                         Buttons, icons & spacing (204 lines)
│   │   ├── 05-menus.css                           Context menu & speech tail (101 lines)
│   │   ├── 06-sidebar.css                         Sidebar panels & blur (193 lines)
│   │   └── 07-extensions.css                      Extensions popover & grid (190 lines)
│   ├── install-files/
│   │   ├── atlas.js                               Bundled output file (generated)
│   │   └── components/atlas/atlas-ctxmenu.js      Web page context menu with Harper guard
│   └── extensions/
│       └── harper/                                Packaged offline Harper extension (MV3)
├── dist/
│   └── AtlasSetup.exe                             Compiled standalone installer
└── tests/
    └── e2e/                                       Automated opaque-box verification test suite
```
