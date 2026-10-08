# fflate (vendored)
_project: atlas · created 2026-10-08_

`browser.js` is fflate's `esm/browser.js`, recovered from the sourcemap of the
newtab bundle shipped before the 2026-10 cleanup (built 2026-09-06). License:
MIT, by Arjun Barrett (https://github.com/101arrowz/fflate).

One change from upstream: the last line exports six internal helpers
(`b2, b4, zh, slzh, slc, u8`). `src/services/detractlessFormat.js` uses them in
`openArchive` to read the ZIP directory and inflate one entry at a time, so the
page stays responsive while importing a backup.

`scripts/build.mjs` maps `import ... from 'fflate'` to this file. Vendored code
is exempt from the file-size and function-size limits.
