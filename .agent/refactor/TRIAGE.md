# Triage of the remaining scan findings

Status after the fix pass: 25 findings before, 14 after. Project tests: 743 JS + 24 Python pass.

## Fixed (11)

| id | where | change |
|---|---|---|
| COL-002 | `payload/css-mods/06-sidebar.css` | date-range color, popover shadow, and panel canvas now use `--atlas-text-3`, `--atlas-pop-shadow`, `--atlas-canvas` |
| COL-003 | `payload/css-mods/08-addbar.css` | scrim, error text, and danger-button label now use `--atlas-scrim`, `--atlas-error`, `--atlas-on-danger` |
| COL-001 (old) | `payload/css-mods/00-tokens.css` | scanner gap: the token file was not recognized because its tokens sit under `:root, #browser`; fixed in `policy/web/color-tokens.mjs` (`definesThemeTokens`) |
| COD-001..003 | `edit-in-bar.js`, `bookmarks-dialog.js`, `26-addbar-edit.js` | scanner gap: file banners and JSDoc examples were read as dead code; `refactor/finders/comment-code.mjs` now skips documentation blocks and still reports `//` runs and pure-code blocks |
| UNU-001..005 | `src/modules/bridge/40-bridge-handlers.js`, `src/modules/toolbar/{06,08,12,13}-*.js` | scanner gap: numbered files inside a `modules/` folder are bundler inputs (`scripts/bundle.py` reads them in filename order), never imported; `refactor/finders/unused.mjs` now recognizes the convention and still flags numbered files outside `modules/` |

New tokens live in `payload/css-mods/00-tokens.css` (light block, with `--atlas-canvas` and `--atlas-scrim` also set in the dark block). The four `--mono-*` values duplicated in the `themes.css` light block were removed; `tokens.css` is their one source, and the dark block still overrides them.

## Left on purpose (1)

- `COL-001` (new number) — `themes.css` and `tokens.css` both define `:root` tokens. This is the design: `tokens.css` holds the theme-independent ramp, `themes.css` holds the semantic color mapping per theme. Clearing this finding means merging both files, which is a structural change, not a cleanup. Not done.

## Left on purpose (12)

| id | where | why |
|---|---|---|
| CSS-001..011 | `payload/css-mods/*.css` | one stylesheet per browser mod, loaded as a mod; there is no component file to pair with, by design (`tests/unit/css_tokens.test.js` covers them) |
| CSS-012 | `payload/detractless/src/pages/newtab/settingsPage.css` | shared page stylesheet imported by `newtab.js:28`, not a component style |

## Left on purpose (1)

- `HAB-001` — `payload/detractless/src/services/tab-saver/open-tab-selection.js`: comments explain order and current-tab rules; they do not restate the code.

## No longer reported (5)

| id | where | why it was a false positive |
|---|---|---|
| UNU-001..005 | `src/modules/bridge/40-bridge-handlers.js`, `src/modules/toolbar/{06,08,12,13}-*.js` | `scripts/bundle.py` reads these by folder and number order into `payload/install-files/atlas.js`; they are build inputs, never imported. The scan now treats numbered files inside `modules/` as bundler inputs. The whole-path `install-files` exclusion stays: that file is a generated copy. |

## Scanner changes made this run

1. `policy/web/color-tokens.mjs` — new `definesThemeTokens` recognizes a token block under any selector containing `:root` (`:root, #browser`, `#browser, :root`, `:root[data-theme]`). `web-findings.mjs` and `web-check.mjs` use it for the color check; token splitting still uses the strict `definesTokens`, so the one-token-file rule did not loosen.
2. `refactor/finders/comment-code.mjs` — a block comment is skipped when it opens with `/**`, has no content lines, or mixes prose with code-shaped lines; a block whose non-empty lines all read as code is still reported (CSS rule blocks included).
3. `refactor/finders/unused.mjs` — `isBundleInput` treats a numbered file inside a `modules/` folder (`modules/toolbar/06-toolbar.js`) as a bundler input, not an unused file.
4. `tests/refactor-finders.test.mjs` — eight tests: two per fix plus two controls checking that real literals, real dead code and numbered files outside `modules/` are still reported.
