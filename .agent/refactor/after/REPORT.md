# Refactor scan report

- project: /Users/calibro/Desktop/Projects (DRIVE CONNECTED)/atlas-installer
- scope: whole project
- date: 2026-11-12
- read: 415 code files, 44951 lines, in 0.4 s
- left out (generated, vendored or too big to read): .agent/ (1 folder), .claude/ (1 folder), .git/ (1 folder), __pycache__/ (5 folders), _old/ (1 folder), dist/ (2 folders), node_modules/ (1 folder), vendor/ (1 folder), 2 minified files, 1 generated file
- findings: 41

## Counts

| kind | found | sure | likely | check | left |
|---|---|---|---|---|---|
| Circular imports | 0 | 0 | 0 | 0 | 0 |
| Duplicate | 4 | 3 | 1 | 0 | 0 |
| Long function | 1 | 1 | 0 | 0 | 0 |
| Too big | 6 | 6 | 0 | 0 | 0 |
| Unused | 5 | 0 | 5 | 0 | 0 |
| Commented-out code | 3 | 0 | 0 | 3 | 0 |
| Comment habits | 1 | 0 | 0 | 1 | 0 |
| Colors and sizes outside the tokens | 8 | 6 | 2 | 0 | 0 |
| Inline style and script in HTML | 0 | 0 | 0 | 0 | 0 |
| Stylesheet and component layout | 13 | 0 | 13 | 0 | 0 |
| Markup in JS strings | 0 | 0 | 0 | 0 | 0 |

## Top 10 to read first

- DUP-003 | payload/install-files/components/atlas/atlas-spelling.js:2 | sure | 231 identical lines also at src/modules/spelling/14-spelling.js:2; move them into one shared function in a well-named file | key: dup|payload/install-files/components/atlas/atlas-spelling.js|f76380b3
- DUP-004 | payload/install-files/components/atlas/tab-shortcuts/tab-shortcuts.js:23 | sure | 13 identical lines also at src/modules/addressbar/01-addressbar.js:134; move them into one shared function in a well-named file | key: dup|payload/install-files/components/atlas/tab-shortcuts/tab-shortcuts.js|7627f260
- DUP-002 | payload/install-files/components/atlas/atlas-scroll-fade.js:34 | sure | 11 identical lines also at src/modules/appearance/36-scroll-fade-layer.js:21; move them into one shared function in a well-named file | key: dup|payload/install-files/components/atlas/atlas-scroll-fade.js|d67aad44
- FUN-001 | payload/install-files/components/atlas/nsfw/ort-wasm-simd-threaded.jsep.mjs:5 | sure | (anonymous function) is 131 lines, over 50; split it into named steps | key: fn|payload/install-files/components/atlas/nsfw/ort-wasm-simd-threaded.jsep.mjs|(anonymous function)
- BIG-003 | payload/extensions/harper/background.js:1 | sure | 544 lines, over the 350-line cap; split it by responsibility | key: lines|payload/extensions/harper/background.js
- BIG-004 | payload/extensions/harper/content.js:1 | sure | 416 lines, over the 350-line cap; split it by responsibility | key: lines|payload/extensions/harper/content.js
- BIG-005 | payload/install-files/components/atlas/ | sure | 37 code files directly in payload/install-files/components/atlas/ (max 8); group related files into feature subfolders | key: folder|payload/install-files/components/atlas
- BIG-002 | payload/detractless/src/pages/newtab/ | sure | 16 code files directly in payload/detractless/src/pages/newtab/ (max 8); group related files into feature subfolders | key: folder|payload/detractless/src/pages/newtab
- BIG-006 | scripts/ | sure | 15 code files directly in scripts/ (max 8); group related files into feature subfolders | key: folder|scripts
- BIG-001 | payload/css-mods/ | sure | 11 code files directly in payload/css-mods/ (max 8); group related files into feature subfolders | key: folder|payload/css-mods

## Not checked

- .css (29 files): long functions, unused code and circular imports not checked
- .html (28 files): long functions, unused code and circular imports not checked
- .h (2 files): long functions, unused code and circular imports not checked
- .c (2 files): long functions, unused code and circular imports not checked
- .sh (1 file): long functions, unused code and circular imports not checked
- a name used through a string, a plugin or generated code can look unused; a copy that was rewritten is invisible

## External tools

- not found on PATH, so not used: eslint, ruff, vulture, madge, jscpd, knip, depcruise

## Findings

### Duplicate (4)

- DUP-001 | payload/install-files/components/atlas/atlas-menu.js:136 | likely | 6 identical lines also at src/modules/menus/37-ui-menu.js:118; move them into one shared function in a well-named file | key: dup|payload/install-files/components/atlas/atlas-menu.js|b9e71d89
- DUP-002 | payload/install-files/components/atlas/atlas-scroll-fade.js:34 | sure | 11 identical lines also at src/modules/appearance/36-scroll-fade-layer.js:21; move them into one shared function in a well-named file | key: dup|payload/install-files/components/atlas/atlas-scroll-fade.js|d67aad44
- DUP-003 | payload/install-files/components/atlas/atlas-spelling.js:2 | sure | 231 identical lines also at src/modules/spelling/14-spelling.js:2; move them into one shared function in a well-named file | key: dup|payload/install-files/components/atlas/atlas-spelling.js|f76380b3
- DUP-004 | payload/install-files/components/atlas/tab-shortcuts/tab-shortcuts.js:23 | sure | 13 identical lines also at src/modules/addressbar/01-addressbar.js:134; move them into one shared function in a well-named file | key: dup|payload/install-files/components/atlas/tab-shortcuts/tab-shortcuts.js|7627f260

### Long function (1)

- FUN-001 | payload/install-files/components/atlas/nsfw/ort-wasm-simd-threaded.jsep.mjs:5 | sure | (anonymous function) is 131 lines, over 50; split it into named steps | key: fn|payload/install-files/components/atlas/nsfw/ort-wasm-simd-threaded.jsep.mjs|(anonymous function)

### Too big (6)

- BIG-001 | payload/css-mods/ | sure | 11 code files directly in payload/css-mods/ (max 8); group related files into feature subfolders | key: folder|payload/css-mods
- BIG-002 | payload/detractless/src/pages/newtab/ | sure | 16 code files directly in payload/detractless/src/pages/newtab/ (max 8); group related files into feature subfolders | key: folder|payload/detractless/src/pages/newtab
- BIG-003 | payload/extensions/harper/background.js:1 | sure | 544 lines, over the 350-line cap; split it by responsibility | key: lines|payload/extensions/harper/background.js
- BIG-004 | payload/extensions/harper/content.js:1 | sure | 416 lines, over the 350-line cap; split it by responsibility | key: lines|payload/extensions/harper/content.js
- BIG-005 | payload/install-files/components/atlas/ | sure | 37 code files directly in payload/install-files/components/atlas/ (max 8); group related files into feature subfolders | key: folder|payload/install-files/components/atlas
- BIG-006 | scripts/ | sure | 15 code files directly in scripts/ (max 8); group related files into feature subfolders | key: folder|scripts

### Unused (5)

- UNU-001 | src/modules/bridge/40-bridge-handlers.js:1 | likely | nothing imports or names this file and it is not an entry point; delete it after checking | key: file|src/modules/bridge/40-bridge-handlers.js
- UNU-002 | src/modules/toolbar/06-toolbar.js:1 | likely | nothing imports or names this file and it is not an entry point; delete it after checking | key: file|src/modules/toolbar/06-toolbar.js
- UNU-003 | src/modules/toolbar/08-reload-internal-pages.js:1 | likely | nothing imports or names this file and it is not an entry point; delete it after checking | key: file|src/modules/toolbar/08-reload-internal-pages.js
- UNU-004 | src/modules/toolbar/12-ext-dock.js:1 | likely | nothing imports or names this file and it is not an entry point; delete it after checking | key: file|src/modules/toolbar/12-ext-dock.js
- UNU-005 | src/modules/toolbar/13-page-progress.js:1 | likely | nothing imports or names this file and it is not an entry point; delete it after checking | key: file|src/modules/toolbar/13-page-progress.js

### Commented-out code (3)

- COD-001 | payload/detractless/src/components/bookmarks/bookmarks-dialog.js:32 | check | 2 lines of commented-out code starting " pick(value) }"; delete it, version history keeps it | key: cc|payload/detractless/src/components/bookmarks/bookmarks-dialog.js|4bb30c4e
- COD-002 | payload/detractless/src/components/edit-in-bar/edit-in-bar.js:16 | check | 3 lines of commented-out code starting "{ kind: 'bookmark', page, group, name, u" (may be a documentation example); delete it, version history keeps it | key: cc|payload/detractless/src/components/edit-in-bar/edit-in-bar.js|2c720f26
- COD-003 | src/modules/addbar/26-addbar-edit.js:10 | check | 2 lines of commented-out code starting "{ kind: 'bookmark', page, group, name, u" (may be a documentation example); delete it, version history keeps it | key: cc|src/modules/addbar/26-addbar-edit.js|27e02c60

### Comment habits (1)

- HAB-001 | payload/detractless/src/services/tab-saver/open-tab-selection.js:4 | check | 30% of the lines are comments (limit 30%); comments explain why, so cut the ones that restate the code | key: habit|density|payload/detractless/src/services/tab-saver/open-tab-selection.js

### Colors and sizes outside the tokens (8)

- COL-001 | payload/css-mods/00-tokens.css | sure | 36 color value(s) written out outside :root; Define each color once as a --color-... variable in :root in the one tokens file (for example styles/tokens.css), and use var(--color-...) here. transparent, currentColor and inherit are fine. | key: webColorLiteral|payload/css-mods/00-tokens.css
- COL-002 | payload/css-mods/05-menus.css | sure | 4 color value(s) written out outside :root; Define each color once as a --color-... variable in :root in the one tokens file (for example styles/tokens.css), and use var(--color-...) here. transparent, currentColor and inherit are fine. | key: webColorLiteral|payload/css-mods/05-menus.css
- COL-003 | payload/css-mods/06-sidebar.css | sure | 4 color value(s) written out outside :root; Define each color once as a --color-... variable in :root in the one tokens file (for example styles/tokens.css), and use var(--color-...) here. transparent, currentColor and inherit are fine. | key: webColorLiteral|payload/css-mods/06-sidebar.css
- COL-004 | payload/css-mods/08-addbar.css | sure | 5 color value(s) written out outside :root; Define each color once as a --color-... variable in :root in the one tokens file (for example styles/tokens.css), and use var(--color-...) here. transparent, currentColor and inherit are fine. | key: webColorLiteral|payload/css-mods/08-addbar.css
- COL-005 | payload/detractless/src/styles/tokens.css | sure | 3 stylesheets define :root tokens (payload/detractless/src/styles/themes.css, payload/detractless/src/styles/tokens.css, payload/install-files/components/atlas/atlas-downloads-panel.css); keep every --token in ONE file (styles/tokens.css) and use var(--...) everywhere else | key: tokens|split
- COL-006 | payload/extensions/harper/content.css | sure | 54 color value(s) written out outside :root; Define each color once as a --color-... variable in :root in the one tokens file (for example styles/tokens.css), and use var(--color-...) here. transparent, currentColor and inherit are fine. | key: webColorLiteral|payload/extensions/harper/content.css
- COL-007 | payload/extensions/harper/content.css | likely | 6 font-size value(s) written out; Define the size once as a --font-size-... variable in the tokens file and use var(--font-size-...) here. | key: webFontSizeLiteral|payload/extensions/harper/content.css
- COL-008 | payload/extensions/harper/content.css | likely | 1 z-index value(s) written out; Define the layer once as a --z-... variable in the tokens file and use var(--z-...) here, so the stacking order has one list. | key: webZIndexLiteral|payload/extensions/harper/content.css

### Stylesheet and component layout (13)

- CSS-001 | payload/css-mods/00-tokens.css:1 | likely | 00-tokens.css has no same-named component file beside it; keep a style next to the component it styles (recipe-card.css beside recipe-card.js), or in a styles/ folder if it is shared | key: css-partner|payload/css-mods/00-tokens.css
- CSS-002 | payload/css-mods/01-chrome.css:1 | likely | 01-chrome.css has no same-named component file beside it; keep a style next to the component it styles (recipe-card.css beside recipe-card.js), or in a styles/ folder if it is shared | key: css-partner|payload/css-mods/01-chrome.css
- CSS-003 | payload/css-mods/02-tabs.css:1 | likely | 02-tabs.css has no same-named component file beside it; keep a style next to the component it styles (recipe-card.css beside recipe-card.js), or in a styles/ folder if it is shared | key: css-partner|payload/css-mods/02-tabs.css
- CSS-004 | payload/css-mods/03-addressbar.css:1 | likely | 03-addressbar.css has no same-named component file beside it; keep a style next to the component it styles (recipe-card.css beside recipe-card.js), or in a styles/ folder if it is shared | key: css-partner|payload/css-mods/03-addressbar.css
- CSS-005 | payload/css-mods/04-toolbar.css:1 | likely | 04-toolbar.css has no same-named component file beside it; keep a style next to the component it styles (recipe-card.css beside recipe-card.js), or in a styles/ folder if it is shared | key: css-partner|payload/css-mods/04-toolbar.css
- CSS-006 | payload/css-mods/05-menus.css:1 | likely | 05-menus.css has no same-named component file beside it; keep a style next to the component it styles (recipe-card.css beside recipe-card.js), or in a styles/ folder if it is shared | key: css-partner|payload/css-mods/05-menus.css
- CSS-007 | payload/css-mods/06-sidebar.css:1 | likely | 06-sidebar.css has no same-named component file beside it; keep a style next to the component it styles (recipe-card.css beside recipe-card.js), or in a styles/ folder if it is shared | key: css-partner|payload/css-mods/06-sidebar.css
- CSS-008 | payload/css-mods/07-extensions.css:1 | likely | 07-extensions.css has no same-named component file beside it; keep a style next to the component it styles (recipe-card.css beside recipe-card.js), or in a styles/ folder if it is shared | key: css-partner|payload/css-mods/07-extensions.css
- CSS-009 | payload/css-mods/08-addbar.css:1 | likely | 08-addbar.css has no same-named component file beside it; keep a style next to the component it styles (recipe-card.css beside recipe-card.js), or in a styles/ folder if it is shared | key: css-partner|payload/css-mods/08-addbar.css
- CSS-010 | payload/css-mods/09-popups.css:1 | likely | 09-popups.css has no same-named component file beside it; keep a style next to the component it styles (recipe-card.css beside recipe-card.js), or in a styles/ folder if it is shared | key: css-partner|payload/css-mods/09-popups.css
- CSS-011 | payload/css-mods/10-popup-controls.css:1 | likely | 10-popup-controls.css has no same-named component file beside it; keep a style next to the component it styles (recipe-card.css beside recipe-card.js), or in a styles/ folder if it is shared | key: css-partner|payload/css-mods/10-popup-controls.css
- CSS-012 | payload/detractless/src/pages/newtab/settingsPage.css:1 | likely | settingsPage.css has no same-named component file beside it; keep a style next to the component it styles (recipe-card.css beside recipe-card.js), or in a styles/ folder if it is shared | key: css-partner|payload/detractless/src/pages/newtab/settingsPage.css
- CSS-013 | payload/install-files/components/atlas/ | likely | payload/install-files/components/atlas/ has no atlas.<ext> or index.<ext>; every component folder has one main file that the rest hang off | key: component-main|payload/install-files/components/atlas

## Triage notes

- DUP-001, DUP-002, and DUP-004 are small helpers used in separate Vivaldi window and web-page contexts; sharing them would require build-pipeline changes. DUP-003 is generated from `src/modules/spelling/14-spelling.js` by `scripts/bundle.py`.
- FUN-001 is the vendored ONNX Runtime WASM loader. BIG-003, BIG-004, and COL-006 through COL-008 are part of the packaged Harper extension.
- BIG-001 is the ordered `00`–`10` CSS module set copied into Vivaldi's CSS folder. BIG-002 and BIG-006 were tried and reverted after installer tests failed. BIG-005 is a package namespace of standalone scripts and assets with paths listed in `payload/install-files/atlas.js`.
- UNU-001 through UNU-005 are collected recursively by `scripts/bundle.py`; they are not unused. COD-001 through COD-003 are API/data-shape examples, and HAB-001 comments explain why the tab-saving guard exists.
- COL-001 and COL-002 define scoped Atlas tokens. COL-003 and COL-004 contain raw colors that could use shared tokens. The write guard's token scan does not skip `_old` or `archive`: for `00-tokens.css` it finds four other token files, one archived and three active (`themes.css`, `tokens.css`, and the standalone downloads-panel stylesheet). Excluding `_old` alone would still leave the project-wide token rule crossing separate CSS contexts, so scope that rule before changing these tokens. Keep the archive intact. Harper findings remain vendor code.
- CSS-001 through CSS-011 are global Vivaldi override sheets with numeric cascade order. CSS-012 is imported by `src/pages/newtab/newtab.js`; CSS-013 describes the standalone-script namespace, not a single component.
