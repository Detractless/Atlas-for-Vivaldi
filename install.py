#!/usr/bin/env python3
"""
Atlas for Vivaldi - all-in-one installer (Python port of install.ps1).

Installs the Atlas UI (browser restyling, context menus, the Detractless new
tab and the Harper extension) into an existing Vivaldi install on this machine.
Everything - including the JSON edits to your profile Preferences - is done here
with the standard library; no Node, no PowerShell, no system Python needed when
run from the packaged .exe.

Vivaldi MUST be closed. This script closes it for you and (unless --no-launch)
reopens it at the end.

The steps live in the installer/ package next to this file.
"""

import argparse
import subprocess
import sys
from pathlib import Path

from installer import util
from installer.extensions import step7_harper_extension
from installer.files import step1_atlas_files, step2_window_html, step3_detractless, step4_css_mods
from installer.menus import step5_context_menus
from installer.paths import find_vivaldi_res, payload_root
from installer.preferences import step6_preferences
from installer.process import close_vivaldi
from installer.staging import MacOSStagingContext
from installer.system import step8_disable_autoupdates, step9_macos_codesign
from installer.util import fail, say


def main():
    ap = argparse.ArgumentParser(description="Atlas for Vivaldi installer")
    ap.add_argument("--yes", "-y", action="store_true", help="skip the confirmation prompt")
    ap.add_argument("--no-launch", action="store_true", help="do not reopen Vivaldi when done")
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

    if not args.yes and not util.DRY:
        print()
        say("Vivaldi will be CLOSED during installation and reopened when finished.")
        try:
            input("  Press Enter to begin, or Ctrl+C to cancel... ")
        except (KeyboardInterrupt, EOFError):
            print()
            fail("Cancelled.")

    close_vivaldi()

    staging_ctx = MacOSStagingContext(res)
    with staging_ctx as target_res:
        step1_atlas_files(masters, target_res)
        step2_window_html(target_res)
        step3_detractless(detract, target_res, args.skip_detractless)
        css_dst = step4_css_mods(payload)
        step5_context_menus(target_res)
        step6_preferences(payload, css_dst)
        step7_harper_extension(payload)
        step8_disable_autoupdates(app_root)
        step9_macos_codesign(target_res)
        staging_ctx.finalize()

    print()
    say("Done." + ("  (dry run - nothing was changed)" if util.DRY else ""))

    if not args.no_launch and not util.DRY:
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
