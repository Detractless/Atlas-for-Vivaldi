# Refactor scan report

- project: /Users/calibro/Desktop/Projects (DRIVE CONNECTED)/atlas-installer
- scope: whole project
- date: 2026-11-13
- read: 364 code files, 38076 lines, in 0.6 s
- left out (generated, vendored or too big to read): .agent/ (1 folder), .claude/ (1 folder), .git/ (1 folder), __pycache__/ (5 folders), _old/ (1 folder), dist/ (2 folders), node_modules/ (1 folder), vendor/ (1 folder), 2 minified files, 1 generated file
- excluded by .agent/refactor/exclusions.json: 5 entries, 53 files, 3 findings
- findings: 14

## Counts

| kind | found | sure | likely | check | left |
|---|---|---|---|---|---|
| Circular imports | 0 | 0 | 0 | 0 | 0 |
| Duplicate | 0 | 0 | 0 | 0 | 0 |
| Long function | 0 | 0 | 0 | 0 | 0 |
| Too big | 0 | 0 | 0 | 0 | 0 |
| Unused | 0 | 0 | 0 | 0 | 0 |
| Commented-out code | 0 | 0 | 0 | 0 | 0 |
| Comment habits | 1 | 0 | 0 | 1 | 0 |
| Colors and sizes outside the tokens | 1 | 1 | 0 | 0 | 0 |
| Inline style and script in HTML | 0 | 0 | 0 | 0 | 0 |
| Stylesheet and component layout | 12 | 0 | 12 | 0 | 0 |
| Markup in JS strings | 0 | 0 | 0 | 0 | 0 |

## Top 10 to read first

- COL-001 | payload/detractless/src/styles/tokens.css | sure | 2 stylesheets define :root tokens (payload/detractless/src/styles/themes.css, payload/detractless/src/styles/tokens.css); keep every --token in ONE file (styles/tokens.css) and use var(--...) everywhere else | key: tokens|split
- CSS-001 | payload/css-mods/00-tokens.css:1 | likely | 00-tokens.css has no same-named component file beside it; keep a style next to the component it styles (recipe-card.css beside recipe-card.js), or in a styles/ folder if it is shared | key: css-partner|payload/css-mods/00-tokens.css
- CSS-002 | payload/css-mods/01-chrome.css:1 | likely | 01-chrome.css has no same-named component file beside it; keep a style next to the component it styles (recipe-card.css beside recipe-card.js), or in a styles/ folder if it is shared | key: css-partner|payload/css-mods/01-chrome.css
- CSS-003 | payload/css-mods/02-tabs.css:1 | likely | 02-tabs.css has no same-named component file beside it; keep a style next to the component it styles (recipe-card.css beside recipe-card.js), or in a styles/ folder if it is shared | key: css-partner|payload/css-mods/02-tabs.css
- CSS-004 | payload/css-mods/03-addressbar.css:1 | likely | 03-addressbar.css has no same-named component file beside it; keep a style next to the component it styles (recipe-card.css beside recipe-card.js), or in a styles/ folder if it is shared | key: css-partner|payload/css-mods/03-addressbar.css
- CSS-005 | payload/css-mods/04-toolbar.css:1 | likely | 04-toolbar.css has no same-named component file beside it; keep a style next to the component it styles (recipe-card.css beside recipe-card.js), or in a styles/ folder if it is shared | key: css-partner|payload/css-mods/04-toolbar.css
- CSS-006 | payload/css-mods/05-menus.css:1 | likely | 05-menus.css has no same-named component file beside it; keep a style next to the component it styles (recipe-card.css beside recipe-card.js), or in a styles/ folder if it is shared | key: css-partner|payload/css-mods/05-menus.css
- CSS-007 | payload/css-mods/06-sidebar.css:1 | likely | 06-sidebar.css has no same-named component file beside it; keep a style next to the component it styles (recipe-card.css beside recipe-card.js), or in a styles/ folder if it is shared | key: css-partner|payload/css-mods/06-sidebar.css
- CSS-008 | payload/css-mods/07-extensions.css:1 | likely | 07-extensions.css has no same-named component file beside it; keep a style next to the component it styles (recipe-card.css beside recipe-card.js), or in a styles/ folder if it is shared | key: css-partner|payload/css-mods/07-extensions.css
- CSS-009 | payload/css-mods/08-addbar.css:1 | likely | 08-addbar.css has no same-named component file beside it; keep a style next to the component it styles (recipe-card.css beside recipe-card.js), or in a styles/ folder if it is shared | key: css-partner|payload/css-mods/08-addbar.css

## Not checked

- .css (26 files): long functions, unused code and circular imports not checked
- .html (25 files): long functions, unused code and circular imports not checked
- .h (2 files): long functions, unused code and circular imports not checked
- .c (2 files): long functions, unused code and circular imports not checked
- .sh (1 file): long functions, unused code and circular imports not checked
- a name used through a string, a plugin or generated code can look unused; a copy that was rewritten is invisible

## Excluded

- payload/install-files (every rule) - generated installer copy of the extension; rebuilt from src/ and payload/detractless; 48 files left out
- payload/extensions/harper (every rule) - vendored Harper extension; not our code to split or restyle; 5 files left out
- payload/css-mods (rules too-big) - one file per CSS mod by design, so the folder is long on purpose; 1 finding left out
  - dropped Too big at payload/css-mods/: 11 code files directly in payload/css-mods/ (max 8); group related files into feature subfolders
- payload/detractless/src/pages/newtab (rules too-big) - pages folder groups one file per page by design; 1 finding left out
  - dropped Too big at payload/detractless/src/pages/newtab/: 16 code files directly in payload/detractless/src/pages/newtab/ (max 8); group related files into feature subfolders
- scripts (rules too-big) - one helper script per task by design; 1 finding left out
  - dropped Too big at scripts/: 15 code files directly in scripts/ (max 8); group related files into feature subfolders

## External tools

- not found on PATH, so not used: eslint, ruff, vulture, madge, jscpd, knip, depcruise

## Findings

### Comment habits (1)

- HAB-001 | payload/detractless/src/services/tab-saver/open-tab-selection.js:4 | check | 30% of the lines are comments (limit 30%); comments explain why, so cut the ones that restate the code | key: habit|density|payload/detractless/src/services/tab-saver/open-tab-selection.js

### Colors and sizes outside the tokens (1)

- COL-001 | payload/detractless/src/styles/tokens.css | sure | 2 stylesheets define :root tokens (payload/detractless/src/styles/themes.css, payload/detractless/src/styles/tokens.css); keep every --token in ONE file (styles/tokens.css) and use var(--...) everywhere else | key: tokens|split

### Stylesheet and component layout (12)

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
