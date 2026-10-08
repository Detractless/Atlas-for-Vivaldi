# Sidebar toggle leftovers (removed 2026-10-08)

The Tools sidebar toggle button (`.atlas-sidebar-toggle`) was archived with the
Tools sidebar (`_old/archive/sidebar-tools/RESTORE.md`). Two code paths still
handled it and were removed:

- `src/modules/04-toolbar.js`, toolbar right-click menu: a button with class
  `atlas-sidebar-toggle` was named `atlas-sidebar-toggle`, and "Remove from
  toolbar" hid it and set `sessionStorage.atlas_sidebar_toggle_hidden = '1'`.
- `src/modules/09-ext-dock.js`, `dropLeftoverToolsButton()`: removed any
  `.atlas-sidebar-toggle` element left in a window from an older version, on
  every docking pass. A reinstall restarts Vivaldi, so no such element exists.

`payload/css-mods/06-sidebar.css` was NOT archived: most of it styles Vivaldi's
own panels and the `vivaldi://history` page, and its section 15 hides the panel
switcher strip. It is live CSS.
