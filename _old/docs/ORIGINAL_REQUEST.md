# Original User Request

## 2026-09-09T22:13:45Z

Modularize the Atlas for Vivaldi browser modifications by decomposing monolithic `atlas.css` and `atlas.js` into domain-specific, maintainable modules, simplifying the address bar context menu, and implementing offline spell check (with Harper integration for web pages and lightweight address bar suggestions).

Working directory: `C:\Users\Calibro1\Downloads\atlas-installer`
Integrity mode: development

## Requirements

### R1. CSS Modularization
Decompose `payload/css-mods/atlas.css` (1,248 lines) into clean, self-contained stylesheets under `payload/css-mods/` loaded in alphabetical order by Vivaldi's native mod loader:
- `00-tokens.css`: Design tokens, light/dark variables, border and elevation variables (lines 1–80).
- `01-chrome.css`: Base window layout, titlebar, window control buttons, rounded webpage viewport container (lines 81–227).
- `02-tabs.css`: Tab strip geometry, active tab fusion, hover wash, soft-focus idle blur, and context-active states (lines 228–364).
- `03-addressbar.css`: Address bar pill shape, focus expansion, search suggestions, and hairline progress loader (lines 365–560).
- `04-toolbar.css`: Toolbar buttons, icons, and spacing (lines 561–764).
- `05-menus.css`: Custom speech-bubble context menu, profile menu, and speech tail styling (lines 765–865).
- `06-sidebar.css`: Tools sidebar, panel glyphs, and sidebar transition blur (lines 866–1058).
- `07-extensions.css`: Extensions popover grid, puzzle piece, and item chips (lines 1059–1248).

### R2. JavaScript Modularization & Build Pipeline
Decompose `payload/install-files/atlas.js` (1,666 lines) into cohesive source modules under a new `src/modules/` directory, bundled automatically during build into `payload/install-files/atlas.js`:
- `modules/01-addressbar.js`: Address field focus blur release, blank new tab marker (`atlas-newtab`), `spellcheck="true"` activation.
- `modules/02-detractless-bridge.js`: Detractless native integration & service-worker bridge stubs, session-restored tabs repair.
- `modules/03-contextmenu.js`: UI context menu manager (`showUiMenu`, corner bubble tail, item dispatch, outside click / escape handling), tab context-active state and blur toggle, address bar context menu (Cut, Copy, Paste, Paste & Go, Select All; Undo/Redo removed).
- `modules/04-toolbar.js`: React fiber toolbar instance helper (`getToolbarInstance`) and toolbar button context menu ("Remove from toolbar", "Customize toolbar…", "Reset toolbar to default").
- `modules/05-profile-menu.js`: "D" account button interceptor (left-click opens profile dropdown; right-click delegates to toolbar context menu).
- `modules/06-reload-helper.js`: Reload button enabler on internal/extension pages.
- `modules/07-extensions-popover.js`: Extensions popover management and grid.
- `modules/08-theme-sync.js`: Extension theme sync listener and chrome class toggling.
- `modules/09-sidebar.js`: Tools sidebar toggle, webview transition blur timing (650ms, 0.2s fade).
- `modules/10-element-remover.js`: Element remover engine bridge.
- `modules/11-page-progress.js`: Page-load progress indicator & Safari-style loading state.
- `modules/12-spelling.js`: Fast offline dictionary check and candidate suggestion generator for misspelled words in the address bar.
- Add a lightweight bundler script (e.g. `scripts/bundle.py`) executed by `build.cmd` to bundle source modules into `payload/install-files/atlas.js`.

### R3. Address Bar Context Menu Cleanup & Spell Check
- Remove "Undo" and "Redo" from the address bar context menu.
- Keep Cut (`Ctrl+X`), Copy (`Ctrl+C`), Paste (`Ctrl+V`), Paste and go, and Select all (`Ctrl+A`).
- Set `spellcheck = true` on the address bar input.
- Show top 2–3 spelling suggestions at the top of the speech-bubble menu when right-clicking a misspelled word in the address bar.

### R4. Harper Grammar & Spell Check Integration
- Package the offline Harper browser extension directly into the Atlas installer payload (`payload/extensions/harper` or similar) so it installs automatically with Atlas.
- Ensure the Harper in-page suggestion tooltips and underlines work seamlessly alongside the custom Atlas right-click context menu.

### R5. Packaging, Sync & Verification
- Rebuild `dist/AtlasSetup.exe` with `build.cmd`.
- Clean PyInstaller artifacts (`build/` directory and `.spec` files).
- Refresh `atlas-installer-backup-2026-09-08.zip`.
- Maintain 100% Windows CRLF (`\r\n`) line endings across all text files.
- Sync all generated and updated files to the live Vivaldi setup in `AppData`.

## Acceptance Criteria

### Modularity
- [ ] No single source CSS or JS module exceeds 350 lines.
- [ ] Each module has a single, well-defined responsibility.
- [ ] Vivaldi loads all stylesheets in `css-mods/` without styling regressions or console errors.
- [ ] `payload/install-files/atlas.js` is automatically compiled from `src/modules/` during build.

### Context Menus & Address Bar
- [ ] Address bar context menu does not include Undo or Redo.
- [ ] Address bar context menu shows Cut, Copy, Paste, Paste and go, and Select all.
- [ ] Right-clicking an inactive tab unblurs it and maintains hover wash while the menu is open, smoothly re-blurring when dismissed.
- [ ] "D" button left-click opens only the profile dropdown; right-click opens only the toolbar context menu.

### Spell Check & Harper
- [ ] Address bar input has active spell checking and presents right-click spelling suggestions for misspelled words.
- [ ] Harper extension is bundled into the installer payload and operates on web pages with offline error underlines and suggestion popups.

### Build & Integrity
- [ ] All modified files have 100% Windows CRLF line endings.
- [ ] `node -c` validates bundled JavaScript without syntax errors.
- [ ] `build.cmd` builds `dist/AtlasSetup.exe` with exit code 0.
- [ ] Temporary build files (`build/`, `.spec`) are cleaned.
- [ ] `atlas-installer-backup-2026-09-08.zip` is refreshed.
