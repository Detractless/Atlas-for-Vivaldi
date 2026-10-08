# Atlas for Vivaldi
_project: atlas · created 2026-10-08_

Atlas restyles Vivaldi and replaces its new tab with the Detractless dashboard.
`install.py` puts it into an existing Vivaldi on this machine.

## Install from source

```bash
python3 install.py --dry-run    # print every change, touch nothing
python3 install.py              # real install (asks, closes and reopens Vivaldi)
python3 install.py --yes --no-launch
```

On Windows use `py -3` instead of `python3`. Flags: `--yes` skip the prompt,
`--no-launch` don't reopen Vivaldi, `--skip-detractless`, `--dry-run`.

Vivaldi replaces its program folder on update, so re-run the installer after a
Vivaldi update. The CSS mods and the Preferences edits survive updates.

## Build

```bash
npm install        # once: esbuild, jsdom and the other dev tools
./build.sh         # macOS: dist/AtlasSetup.dmg; Windows: build.cmd -> dist\AtlasSetup.exe
```

Both scripts run `scripts/build.py`: bundle `src/modules` into `atlas.js`, build
the new-tab bundles (`npm run build`), then package for the platform.

## Test

```bash
npm test           # node --test tests/unit/*.test.js && python3 -m unittest discover tests/unit
```

The node tests load the real new tab, browser-window code, page menu and
service worker in jsdom/vm with stand-in `chrome.*` APIs. Nothing touches
Vivaldi. Size, line-ending, storage-key and error-handling rules are tests too.

## Layout

| Path | What it is |
|---|---|
| `install.py`, `installer/` | The installer: entry point, then one module per step (files, menus, preferences, Harper, updates, signing). |
| `src/modules/NN-*.js` | Browser-window code (menus, toolbar, profile menu, extensions popover, spelling). `scripts/bundle.py` joins them into `payload/install-files/atlas.js`. |
| `payload/detractless/src/` | New-tab extension source. `npm run build` writes `src/dist/` (never edit dist by hand). |
| `payload/detractless/src/constants/atlasKeys.json` | The one list of storage keys, defaults, database names and the extension id. |
| `payload/detractless/src/settings/` | Settings registry (every setting saves at once and syncs across tabs) and the Settings page. |
| `payload/css-mods/` | The restyling CSS, copied to `Vivaldi/Atlas/css-mods`. |
| `payload/extensions/harper/` | The Harper grammar-checker extension (pre-signed `.crx`; the signing key lives in `keys/`, git-ignored). |
| `tests/unit/` | All tests. |
| `_old/` | Archived features, retired tests and old notes, each with a README or RESTORE.md. |

## What the installer does

1. Copies the Atlas files and the page-menu content scripts into Vivaldi's `resources/vivaldi`.
2. Adds `atlas.js` (and `profilesCore.js`) to `window.html`.
3. Installs the Detractless new tab: only the files its pages load.
4. Copies `css-mods` to `Vivaldi/Atlas/css-mods`.
5. Prunes Vivaldi's page context menus.
6. Edits `Default/Preferences`: CSS-mods folder, toolbar layout, new-tab page, Atlas themes.
   Stops without writing if Preferences cannot be read; backs it up before every write.
7. Registers the Harper extension.
8. Turns off Vivaldi auto-updates.
9. macOS: re-signs the app ad hoc; stops if signing fails.
