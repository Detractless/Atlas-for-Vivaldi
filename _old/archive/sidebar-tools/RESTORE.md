# Tools sidebar: archived 2026-10-05

The Tools sidebar (PasteKit, Remover, Notes, Saved tabs) is not part of the current
installer. Everything needed to bring it back is in this folder. Nothing was deleted.

## What was archived

Moved, with their original paths kept under `files/`:

- `payload/detractless/sidepanel.html`
- `payload/detractless/src/pages/sidepanel/` (panel UI source, including the Settings-style restyle block)
- `payload/detractless/src/pastekit/` (PasteKit page script, snippet picker, styles)
- `payload/detractless/src/content/elementRemover/` (Remover page picker)
- `payload/detractless/src/dist/{sidepanel,pastekit-content,inject,rules}.bundle.*`
- `src/modules/10-element-remover.js` (Remover coordinator for the browser window)

Changed in place (the originals are saved next to `files/` as `*.orig`):

- `src/modules/09-sidebar.js` is now `src/modules/09-ext-dock.js`. It keeps only the
  Extensions-button docking in the address field. The Tools toolbar button, panel
  transition blur and panel webview guard were dropped.
- `src/modules/02-detractless-bridge.js` no longer registers the `detractless-rules`
  and `detractless-pastekit` content scripts. Both ids stay in `OUR_CS_IDS`, so an
  existing registration is swept on the next launch.
- `install.py` no longer copies the sidebar files, removes the `WEBPANEL_atlas_sidebar`
  web panel from `Preferences`, and deletes the old sidebar files from the installed app.
- `tests/e2e/helpers.py` expects `09-ext-dock.js` and no `10-element-remover.js`.

## What was left alone

- The background worker `src/dist/serviceWorker.bundle.js` still holds the PasteKit and
  Remover code and the tab limiter. It is shared, so it was not touched.
- Your data stays in extension storage (notes, snippets, saved tab groups, Remover rules).
  Restoring the sidebar shows it again.
- `payload/css-mods/06-sidebar.css` and the `PanelToggle` rules in `04-toolbar.css` still
  style Vivaldi's own panel bar. They do nothing for the removed button.
- `04-toolbar.js` still has a harmless branch for the old `atlas-sidebar-toggle` button.

## Restore

1. Copy everything under `archive/sidebar-tools/files/` back to the same path under the
   installer root (`files/payload/...` goes to `payload/...`, `files/src/...` to `src/...`).
2. Copy `files/src-modules-09-sidebar.js.orig` back to `src/modules/09-sidebar.js` and delete
   `src/modules/09-ext-dock.js`.
3. Replace `src/modules/02-detractless-bridge.js`, `install.py` and `tests/e2e/helpers.py`
   with the `.orig` copies in `files/`.
4. Run `bash build.sh`, mount the DMG, run `AtlasSetup --yes`.

Shortcut: `pre-archive-snapshot.tar.gz` is the whole installer folder (without `dist/`) as it
was just before the archive. Extract it over the installer root to undo everything:

    tar -xzf archive/sidebar-tools/pre-archive-snapshot.tar.gz -C .

then delete `src/modules/09-ext-dock.js` (the snapshot has the old `09-sidebar.js`).
