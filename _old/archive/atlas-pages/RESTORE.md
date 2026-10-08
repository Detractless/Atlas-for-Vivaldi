# Atlas Downloads and Extensions pages (archived 2026-10-08)

`atlas-downloads.html` and `atlas-extensions.html` were custom full-page
replacements for Vivaldi's Downloads and Extensions pages, styled by
`atlas-pages.css` and `atlas-pages.js`. Nothing opened them any more: the
profile menu and the extensions popover open Vivaldi's own `vivaldi://downloads`
and `vivaldi://extensions`, and the only references left were two unused
constants (`Atlas.ATLAS_DOWNLOADS`, `Atlas.ATLAS_EXTENSIONS`) in the bridge
module, now removed.

To restore: move the four files back to `payload/install-files/components/atlas/`
(install.py copies that folder whole), then point a menu item at
`chrome-extension://<extensionId>/components/atlas/atlas-downloads.html`.
