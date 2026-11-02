#!/usr/bin/env python3
"""
Atlas for Vivaldi - all-in-one installer (Python port of install.ps1).

Installs the Atlas UI (browser restyling, context menus, the Detractless new
tab and the Harper extension) into an existing Vivaldi install on this machine.
Everything - including the JSON edits to your profile Preferences - is done here
with the standard library; no Node, no PowerShell, no system Python needed when
run from the packaged .exe.

Installs in the background: a running Vivaldi is left alone (the old files keep
serving until you quit and relaunch Vivaldi yourself). Pass --close to have the
installer quit Vivaldi first, or --launch to reopen it when done.

The steps live in the installer/ package next to this file.
"""

import argparse
import subprocess
import sys
from pathlib import Path

from installer import util
from installer.extensions import step7_harper_extension
from installer.files import step1_atlas_files, step2_core_html, step2_window_html, step3_detractless, step4_css_mods
from installer.menus import step5_context_menus
from installer.native_shortcuts import preflight_native_shortcuts, install_native_shortcuts
from installer.paths import find_vivaldi_res, payload_root
from installer.preferences import step6_preferences
from installer.profile_facts import step6_profile_facts
from installer.process import close_vivaldi, vivaldi_running
from installer.staging import MacOSStagingContext
from installer.system import step8_disable_autoupdates, step9_macos_codesign
from installer.util import fail, say


def main():
    ap = argparse.ArgumentParser(description="Atlas for Vivaldi installer")
    ap.add_argument("--yes", "-y", action="store_true", help="kept for compatibility; nothing to confirm now")
    ap.add_argument("--close", action="store_true", help="quit Vivaldi before installing (old behaviour)")
    ap.add_argument("--launch", action="store_true", help="launch Vivaldi when finished")
    ap.add_argument("--no-close", action="store_true", help="kept for compatibility; background install is now the default")
    ap.add_argument("--no-launch", action="store_true", help="kept for compatibility; never launching is now the default")
    ap.add_argument("--skip-detractless", action="store_true", help="do not install Detractless")
    ap.add_argument("--dry-run", action="store_true", help="print every change, touch nothing")
    args = ap.parse_args()
    util.DRY = args.dry_run

    print()
    say("Atlas for Vivaldi - installer" + ("   [DRY RUN]" if util.DRY else ""))
    say("------------------------------")

    payload = payload_root()
    masters = payload / "install-files"
    detract = payload / "detractless"
    if not masters.is_dir():
        fail(f"Payload is missing install-files\\ - package is incomplete. ({masters})")

    res = find_vivaldi_res()
    app_root = res.parent.parent.parent  # ...\Application\<ver>\resources\vivaldi

    if args.close:
        close_vivaldi()
    elif vivaldi_running():
        say("Vivaldi is running: installing in the background. Quit and relaunch")
        say("Vivaldi when you are ready for the new Atlas to take effect.")

    preflight_native_shortcuts(masters, res)
    staging_ctx = MacOSStagingContext(res, allow_live=not args.close)
    with staging_ctx as target_res:
        step1_atlas_files(masters, target_res)
        step2_window_html(target_res)
        if sys.platform == "darwin":
            step2_core_html(target_res)
            install_native_shortcuts(masters, target_res)
        step3_detractless(detract, target_res, args.skip_detractless)
        css_dst = step4_css_mods(payload)
        step5_context_menus(target_res)
        step6_preferences(payload, css_dst)
        step6_profile_facts(target_res, payload, css_dst)
        step7_harper_extension(payload)
        step8_disable_autoupdates(app_root)
        step9_macos_codesign(target_res)
        staging_ctx.finalize()

    print()
    say("Done." + ("  (dry run - nothing was changed)" if util.DRY else ""))

    if args.launch and not util.DRY:
        if sys.platform == "darwin":
            app_candidates = [
                Path("/Applications/Vivaldi.app"),
                Path.home() / "Applications" / "Vivaldi.app",
            ]
            app_path = next((p for p in app_candidates if p.is_dir()), None)
            if app_path:
                subprocess.Popen(["open", "-a", str(app_path)])
                say("Vivaldi relaunched.")
        else:
            exe = app_root / "vivaldi.exe"
            if exe.is_file():
                flags = getattr(subprocess, "DETACHED_PROCESS", 0) if sys.platform == "win32" else 0
                subprocess.Popen([str(exe)], creationflags=flags)
                say("Vivaldi relaunched.")
    print()


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception as e:  # noqa: BLE001 - top-level guard, show the real error
        fail(f"{type(e).__name__}: {e}")
