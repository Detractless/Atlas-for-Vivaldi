# Atlas cleanup progress

Plan: `Temp/docs/atlas-cleanup-plan.md`. One section per phase, newest last.
Per-phase gate: `node --test tests/unit/*.test.js`, `python3 -m unittest discover tests/unit`, `python3 install.py --dry-run --no-launch`, `node --check` on changed JS.

## Before Phase 2: smoke test
- Added `tests/unit/newtab_smoke.test.js` (5 tests): loads the real `index.html` + bundle in jsdom with a fake `chrome.*` (`tests/unit/helpers/`) and in-memory IndexedDB (fake-indexeddb). Checks: search bar renders, stored 'off' hides it, page tabs render, a bookmark can be added via the + menu, Settings opens.
- Mutation check: making `addBookmark` a no-op turns the bookmark test red.
- Dev tools in `package.json` (jsdom, esbuild, acorn, fake-indexeddb); `node_modules/` ignored. `scripts/to_crlf.py` keeps new files CRLF.
- Tests: node 17/17, python 7/7.

