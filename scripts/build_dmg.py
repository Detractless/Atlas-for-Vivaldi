#!/usr/bin/env python3
"""
scripts/build_dmg.py
Builds a standalone macOS DMG installer containing "Install Atlas.app".
Uses built-in macOS tools (sips, iconutil, hdiutil, codesign).
"""

import os
import sys
import shutil
import subprocess
import tempfile
from pathlib import Path


def fail(msg: str):
    print(f"\nERROR: {msg}", file=sys.stderr)
    sys.exit(1)


def run_cmd(cmd, **kwargs):
    res = subprocess.run(cmd, capture_output=True, text=True, **kwargs)
    if res.returncode != 0:
        fail(f"Command failed: {' '.join(cmd)}\n{res.stderr}\n{res.stdout}")
    return res


def create_icns(icon_src: Path, out_icns: Path):
    with tempfile.TemporaryDirectory() as tmp_dir:
        iconset = Path(tmp_dir) / "Atlas.iconset"
        iconset.mkdir()
        sizes = [
            ("icon_16x16.png", 16),
            ("icon_16x16@2x.png", 32),
            ("icon_32x32.png", 32),
            ("icon_32x32@2x.png", 64),
            ("icon_128x128.png", 128),
            ("icon_128x128@2x.png", 256),
            ("icon_256x256.png", 256),
            ("icon_256x256@2x.png", 512),
            ("icon_512x512.png", 512),
        ]
        for name, sz in sizes:
            target = iconset / name
            run_cmd(["sips", "-z", str(sz), str(sz), str(icon_src), "--out", str(target)])
        run_cmd(["iconutil", "-c", "icns", str(iconset), "-o", str(out_icns)])


def main():
    if sys.platform != "darwin":
        fail("DMG packaging can only be run on macOS (requires hdiutil and iconutil).")

    repo_root = Path(__file__).resolve().parent.parent
    payload_dir = repo_root / "payload"
    install_py = repo_root / "install.py"
    dist_dir = repo_root / "dist"
    dist_dmg = dist_dir / "AtlasSetup.dmg"

    if not payload_dir.is_dir() or not install_py.is_file():
        fail(f"Required files missing in {repo_root}")

    print("[1/5] Bundling JavaScript modules...")
    bundle_script = repo_root / "scripts" / "bundle.py"
    run_cmd([sys.executable, str(bundle_script)])

    print("[2/5] Creating application icons...")
    icon_png = payload_dir / "detractless" / "icons" / "icon128.png"

    with tempfile.TemporaryDirectory() as staging_tmp:
        staging_path = Path(staging_tmp)
        icns_path = staging_path / "AppIcon.icns"
        if icon_png.is_file() and shutil.which("iconutil") and shutil.which("sips"):
            create_icns(icon_png, icns_path)

        print("[3/5] Assembling Install Atlas.app bundle...")
        app_dir = staging_path / "Install Atlas.app"
        contents = app_dir / "Contents"
        macos_dir = contents / "MacOS"
        res_dir = contents / "Resources"
        macos_dir.mkdir(parents=True)
        res_dir.mkdir(parents=True)

        # Info.plist
        plist_content = """<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleName</key>
    <string>Install Atlas</string>
    <key>CFBundleDisplayName</key>
    <string>Install Atlas</string>
    <key>CFBundleIdentifier</key>
    <string>com.atlas.vivaldi.installer</string>
    <key>CFBundleVersion</key>
    <string>1.0.0</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0.0</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleExecutable</key>
    <string>AtlasSetup</string>
    <key>CFBundleIconFile</key>
    <string>AppIcon</string>
    <key>LSMinimumSystemVersion</key>
    <string>10.13</string>
    <key>NSHighResolutionCapable</key>
    <true/>
</dict>
</plist>
"""
        with open(contents / "Info.plist", "w", encoding="utf-8") as f:
            f.write(plist_content)

        # Launcher executable
        launcher_sh = """#!/usr/bin/env bash
DIR="$(cd "$(dirname "$0")/.." && pwd)"
RESOURCES="$DIR/Resources"

# If run from terminal with arguments, forward directly to CLI
if [ -t 0 ] || [ $# -gt 0 ]; then
    exec /usr/bin/python3 "$RESOURCES/install.py" "$@"
fi

# GUI mode (launched via Finder)
CHOICE=$(osascript -e 'display dialog "Install Atlas for Vivaldi?\n\nThis will install the Atlas UI themes, custom toolbars, context menus, and extensions into Vivaldi.\n\nVivaldi will be closed during installation." buttons {"Cancel", "Install"} default button "Install" with icon caution with title "Atlas for Vivaldi Installer"' 2>/dev/null)

if [ "$CHOICE" != "button returned:Install" ]; then
    exit 0
fi

# Run installer
OUTPUT=$(/usr/bin/python3 "$RESOURCES/install.py" --yes --no-launch 2>&1 | tee /tmp/atlas_install.log)
STATUS=$?

if [ $STATUS -eq 0 ]; then
    LAUNCH=$(osascript -e 'display dialog "Atlas for Vivaldi has been successfully installed!\n\nWould you like to launch Vivaldi now?" buttons {"Done", "Launch Vivaldi"} default button "Launch Vivaldi" with icon note with title "Atlas for Vivaldi Installer"' 2>/dev/null)
    if [ "$LAUNCH" = "button returned:Launch Vivaldi" ]; then
        open -a Vivaldi 2>/dev/null || open -a "$HOME/Applications/Vivaldi.app" 2>/dev/null || true
    fi
else
    ESCAPED=$(echo "$OUTPUT" | sed 's/["\\]/ /g' | tail -n 6)
    osascript -e 'display alert "Atlas Installation Failed" message "'"$ESCAPED"'\n\nDetailed log saved to /tmp/atlas_install.log" as critical' 2>/dev/null
fi
"""
        launcher_bin = macos_dir / "AtlasSetup"
        with open(launcher_bin, "w", encoding="utf-8") as f:
            f.write(launcher_sh)
        launcher_bin.chmod(0o755)

        # Copy resources
        if icns_path.is_file():
            shutil.copy2(icns_path, res_dir / "AppIcon.icns")
        shutil.copy2(install_py, res_dir / "install.py")
        # Keys, Finder metadata and stale sourcemaps never go in the DMG.
        shutil.copytree(payload_dir, res_dir / "payload",
                        ignore=shutil.ignore_patterns("*.pem", ".DS_Store", "*.map"))

        # Add README in DMG
        readme_txt = """Atlas for Vivaldi - macOS Installer
====================================

Double-click "Install Atlas.app" to set up Atlas on this Mac.
Vivaldi will be automatically updated with the Atlas UI theme, custom tabs,
context menus, sidebar tools, and Harper extension.

CLI usage from Terminal:
  "/Volumes/Atlas for Vivaldi/Install Atlas.app/Contents/MacOS/AtlasSetup" --help
"""
        with open(staging_path / "ReadMe.txt", "w", encoding="utf-8") as f:
            f.write(readme_txt)

        # Sign the app bundle
        print("[4/5] Code signing app bundle (ad-hoc)...")
        run_cmd(["xattr", "-cr", str(app_dir)])
        run_cmd(["codesign", "--force", "--deep", "--sign", "-", str(app_dir)])

        # Build DMG
        print("[5/5] Building compressed DMG image...")
        dist_dir.mkdir(parents=True, exist_ok=True)
        if dist_dmg.exists():
            dist_dmg.unlink()

        run_cmd([
            "hdiutil", "create",
            "-volname", "Atlas for Vivaldi",
            "-srcfolder", str(staging_path),
            "-ov",
            "-format", "UDZO",
            str(dist_dmg)
        ])

    size_mb = dist_dmg.stat().st_size / (1024 * 1024)
    print()
    print("========================================")
    print(f"SUCCESS: Built {dist_dmg.relative_to(repo_root)} ({size_mb:.2f} MB)")
    print("========================================")


if __name__ == "__main__":
    main()
