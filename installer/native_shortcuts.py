"""Install the macOS shortcut library inside Vivaldi's existing process."""
import plistlib
import shutil
import subprocess
import sys
from pathlib import Path

from . import util

LOADER_ENTRY = "@executable_path/../Frameworks/AtlasShortcuts.dylib"


def bundle_for(res: Path):
    return next((p for p in res.parents if p.suffix == ".app"), None)


def app_running(app: Path):
    result = subprocess.run(["ps", "-axo", "comm="], capture_output=True, text=True, check=True)
    executable = str(app / "Contents/MacOS/Vivaldi")
    return executable in (line.strip() for line in result.stdout.splitlines())


def desired_plist(plist):
    updated = dict(plist)
    environment = dict(updated.get("LSEnvironment", {}))
    entries = environment.get("DYLD_INSERT_LIBRARIES", "").split(":")
    entries = [entry for entry in entries if entry and entry != LOADER_ENTRY]
    entries.append(LOADER_ENTRY)
    environment["DYLD_INSERT_LIBRARIES"] = ":".join(entries)
    updated["LSEnvironment"] = environment
    return updated


def native_shortcuts_needed(masters: Path, res: Path):
    app = bundle_for(res)
    if sys.platform != "darwin" or not app:
        return False
    payload = masters / "native/macos/AtlasShortcuts.dylib"
    target = app / "Contents/Frameworks/AtlasShortcuts.dylib"
    if not payload.is_file():
        util.fail("AtlasShortcuts.dylib is missing. Build with scripts/build_native_shortcuts.py.")
    plist = plistlib.loads((app / "Contents/Info.plist").read_bytes())
    return (not target.is_file() or payload.read_bytes() != target.read_bytes() or
            desired_plist(plist) != plist)


def preflight_native_shortcuts(masters: Path, res: Path):
    if native_shortcuts_needed(masters, res) and not util.DRY and app_running(bundle_for(res)):
        util.fail("Quit Vivaldi before installing this native shortcut update. "
                  "Its app signature must be updated while it is stopped; no files were changed.")


def install_native_shortcuts(masters: Path, res: Path):
    if not native_shortcuts_needed(masters, res):
        return
    app = bundle_for(res)
    if util.DRY:
        util.say(f"[dry-run] install browser-contained shortcuts in {app.name}")
        return
    if app_running(app):
        util.fail("Native shortcut installation requires this Vivaldi app to be stopped.")
    target = app / "Contents/Frameworks/AtlasShortcuts.dylib"
    shutil.copy2(masters / "native/macos/AtlasShortcuts.dylib", target)
    info = app / "Contents/Info.plist"
    old_bytes = info.read_bytes()
    format_ = plistlib.FMT_BINARY if old_bytes.startswith(b"bplist") else plistlib.FMT_XML
    info.write_bytes(plistlib.dumps(desired_plist(plistlib.loads(old_bytes)), fmt=format_, sort_keys=False))
    util.say("Native shortcuts     installed inside Vivaldi (no separate helper)")
