# Legacy test suites (retired 2026-10-08)

These Windows-era suites (`py -3 tests/e2e/test_runner.py`, `tests/test_adversarial.py`)
mostly checked SOURCE TEXT with regexes (that a file contained `'No Surf'`, that a
module was named `05-profile-menu.js`), so every rename or split in the cleanup broke
them without any behavior changing. Before the cleanup they already had 1 error and
6 failures (a 10-second Node simulation that never exits, a Windows-only backup zip,
a Windows .exe, the CRLF audit walking `node_modules`, three context-menu cases that
ran without a `chrome` object).

Everything they protected that is still true is now a behavior test in `tests/unit/`:

| Legacy test | Now covered by |
|---|---|
| tier1 01-02 CSS files exist, line counts | `size_limits.test.js`, `test_install.py` (css-mods copied) |
| tier1 03-05, 11; tier3 01; tier4 04 bundling, syntax, module sizes | `build_sync.test.js` (`bundle.py --check`, node --check, 350-line module cap), `size_limits.test.js` |
| tier1 06-08, 12-13; tier3 04-05 menus with spelling | `atlas_window.test.js`, `page_ctxmenu.test.js` |
| tier1 09 Harper payload | `test_install.py` (Harper manifest + files) |
| tier1 14 tab menu hides the hover card; 16 menus close each other; 18 open link in this tab | `atlas_window.test.js`, `page_ctxmenu.test.js` |
| tier1 15, 17 profile menu | `atlas_window.test.js` (avatar menu opens, rows act) |
| tier2 01-08; adversarial spelling 01-06 | `spelling_engine.test.js` |
| tier2 09 line ceilings | `size_limits.test.js`, `bundle.py` |
| tier3 02 Harper tooltip isolation | `page_ctxmenu.test.js` |
| tier3 03 CSS token use | `css_tokens.test.js` |
| tier3 06 content script includes spelling | `atlas_window.test.js` |
| tier4 01 CRLF audit | `line_endings.test.js` (git-tracked files, per `.gitattributes`) |
| tier4 02 backup zip at `C:\Users\Calibro1\...`, 03 `AtlasSetup.exe` | retired: Windows-machine artifacts, not repo behavior |
| tier1 10 build.cmd builds an .exe | retired: needs Windows + PyInstaller |
| adversarial context-menu 01-03 | `page_ctxmenu.test.js` |

Not carried over: assertions on exact CSS values (36px avatar, 12px radius); those
are styling choices, not behavior.
