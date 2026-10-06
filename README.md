# Atlas for Vivaldi - installer (Python)

One script, `install.py`, that installs the Atlas UI into an existing Vivaldi on
this machine. Replaces the old PowerShell `install.ps1` (which broke on
PowerShell 5.1's JSON serializer).

## Run from source

**Windows**:
```bat
py -3 install.py --dry-run      # show every change, touch nothing
py -3 install.py                # real install (prompts, closes + reopens Vivaldi)
py -3 install.py --yes --no-launch
```

**macOS**:
```bash
python3 install.py --dry-run    # show every change, touch nothing
python3 install.py              # real install (prompts, closes + reopens Vivaldi)
python3 install.py --yes --no-launch
```

Flags: `--yes` skip prompt, `--no-launch` don't reopen Vivaldi,
`--skip-detractless`, `--dry-run`.

## Build Standalone Installers

### Windows (`dist\AtlasSetup.exe`)
```bat
build.cmd
```
Produces `dist\AtlasSetup.exe` — a single file with the Python runtime and the `payload\` folder baked in.

### macOS (`dist/AtlasSetup.dmg`)
```bash
./build.sh
```
Produces `dist/AtlasSetup.dmg` — a compressed macOS disk image containing `Install Atlas.app`.
Double-click the DMG and open `Install Atlas.app` to run with a native GUI confirmation dialog, or invoke via CLI from Terminal:
```bash
"/Volumes/Atlas for Vivaldi/Install Atlas.app/Contents/MacOS/AtlasSetup" --yes
```

## Profile switcher (new tab)

The new tab's top-right avatar opens an avatar-strip menu: click an avatar to
switch profile, the dashed + adds one, and Add page or bookmark and Settings
sit below. Phase 1 saves only the profile list and the active profile
(`atlasProfiles`); bookmarks, pages and settings are shared by every profile.
It ships in `payload/detractless/src/pages/newtab/profileMenu.js` and
`newtab.css`, which `install.py` already copies. To install it (closes and
reopens Vivaldi, so run it yourself):

```bash
python3 install.py --yes
```

## What it does (ported 1:1 from install.ps1)

1. Copy Atlas files into `...\Vivaldi\Application\<newest>\resources\vivaldi\`.
2. Add `<script src="atlas.js">` to `window.html`.
3. Install + shim Detractless (`index/gate/sidepanel.html` + `src/*`).
4. Copy `css-mods` to `...\Vivaldi\Atlas\css-mods` (survives Vivaldi updates).
5. Prune `menus\contextmenu.json` to the Atlas menu set.
6. Edit `User Data\Default\Preferences`: custom-CSS dir, Tools side panel,
   panel bar, and merge the Atlas themes. Backs up to `Preferences.atlas-bak`
   once.

Steps 1-3 and 5 live inside the Vivaldi program folder, which Vivaldi replaces
on update - re-run the installer after a Vivaldi update. Steps 4 and 6 persist.
