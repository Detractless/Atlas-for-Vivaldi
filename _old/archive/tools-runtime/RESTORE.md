# Tools-sidebar runtime code (archived 2026-10-08)

The Tools sidebar (PasteKit snippets, Element Remover, Notes, Saved tabs) was
archived earlier (`_old/archive/sidebar-tools/RESTORE.md`), but parts of its
runtime still shipped in the bundles. Phase 6 of the cleanup moved them here:

- `payload/detractless/src/pastekit/` — snippet database CRUD and search, the
  service-worker message hub, install seeding, side-panel action, and the
  "Save to Pastekit" right-click item (`clip.js`).
- `payload/detractless/src/background/removerController.js` — Element Remover
  per-tab state and injection (its `inject.bundle.js` no longer existed).

What stayed live, so no user data is lost:
- Snippets in the `pastekit` IndexedDB database still go into backups and come
  back on import (`src/services/snippetBackup.js`, same schema and format).
- `rhe_rules` (Remover rules) are still carried by backups.
- Nothing deletes the `pastekit` database, `pastekit.settings`, `rhe_rules` or
  `rheTabStates`, except "Reset everything" in Settings, which the user starts.
- `src/background/archivedCleanup.js` removes the stale "Save to Pastekit" item
  from the browser's own right-click menu.

To restore: move the files back, re-add the imports in
`src/background/serviceWorker.js` and the remover actions in
`src/background/messaging.js` (see git history before commit "Phase 6"), and
run `npm run build`.
