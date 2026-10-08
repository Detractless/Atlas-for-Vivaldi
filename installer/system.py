"""Steps 8-9: auto-updates off, ad-hoc re-signing on macOS."""

import subprocess
import sys
from pathlib import Path

from . import util
from .util import fail, say


def step8_disable_autoupdates(app_root: Path):
    if sys.platform == "darwin":
        if util.DRY:
            say("[dry-run] would disable Sparkle auto-updates in com.vivaldi.Vivaldi")
        else:
            try:
                subprocess.run(
                    ["defaults", "write", "com.vivaldi.Vivaldi", "SUEnableAutomaticChecks", "-bool", "false"],
                    capture_output=True,
                )
                subprocess.run(
                    ["defaults", "write", "com.vivaldi.Vivaldi", "SUAutomaticallyUpdate", "-bool", "false"],
                    capture_output=True,
                )
            except Exception as e:
                say(f"Warning: could not turn off auto-updates: {e}", dim=True)
        say("Auto-updates         permanently disabled (Sparkle)")
        return

    if sys.platform != "win32":
        return
    # 1. Disable Windows Scheduled Tasks for Vivaldi updates
    try:
        q = subprocess.run(
            ["schtasks", "/Query", "/FO", "CSV", "/NH"],
            capture_output=True, text=True,
        )
        for line in q.stdout.splitlines():
            if "VivaldiUpdate" in line:
                parts = line.split(",")
                if parts:
                    task_name = parts[0].strip('"')
                    if util.DRY:
                        say(f"[dry-run] would disable scheduled task: {task_name}")
                    else:
                        subprocess.run(
                            ["schtasks", "/Change", "/TN", task_name, "/Disable"],
                            capture_output=True, text=True,
                        )
    except Exception as e:
        say(f"Warning: could not disable the Vivaldi update task: {e}", dim=True)

    # 2. Neuter update_notifier.exe
    notifier = app_root / "update_notifier.exe"
    disabled_notifier = app_root / "update_notifier.exe.disabled"
    if notifier.is_file():
        if util.DRY:
            say(f"[dry-run] would rename {notifier.name} -> {disabled_notifier.name}")
        else:
            try:
                if disabled_notifier.is_file():
                    disabled_notifier.unlink()
                notifier.rename(disabled_notifier)
            except Exception as e:
                say(f"Warning: could not rename update_notifier.exe: {e}", dim=True)

    # 3. Registry policy flags
    if not util.DRY:
        try:
            import winreg
            with winreg.CreateKeyEx(
                winreg.HKEY_CURRENT_USER, r"Software\Vivaldi\AutoUpdate", 0, winreg.KEY_SET_VALUE
            ) as key:
                winreg.SetValueEx(key, "AutoUpdate", 0, winreg.REG_DWORD, 0)
                winreg.SetValueEx(key, "CheckForUpdates", 0, winreg.REG_DWORD, 0)
                winreg.SetValueEx(key, "DoNotUpdate", 0, winreg.REG_DWORD, 1)
        except Exception as e:
            say(f"Warning: could not set the update policy in the registry: {e}", dim=True)

    say("Auto-updates         permanently disabled")


def step9_macos_codesign(res: Path):
    if sys.platform != "darwin":
        return
    app_bundle = None
    for parent in res.parents:
        if parent.suffix == ".app":
            app_bundle = parent
            break
    if not app_bundle or not app_bundle.is_dir():
        return
    if util.DRY:
        say(f"[dry-run] strip quarantine and ad-hoc re-sign {app_bundle.name}")
        return
    say("Code signing         clearing quarantine & re-signing bundle...")
    subprocess.run(["xattr", "-cr", str(app_bundle)], capture_output=True)
    sign = subprocess.run(
        [
            "codesign",
            "--force",
            "--deep",
            "--preserve-metadata=entitlements,requirements,flags,runtime",
            "--sign",
            "-",
            str(app_bundle),
        ],
        capture_output=True, text=True,
    )
    if sign.returncode != 0:
        # Stops before a staged copy replaces Vivaldi: an unsigned bundle may not launch.
        fail(f"codesign failed ({sign.returncode}): {sign.stderr.strip()[:400]}")
    check = subprocess.run(
        ["codesign", "--verify", "--deep", "--strict", str(app_bundle)],
        capture_output=True, text=True,
    )
    if check.returncode != 0:
        say(f"Warning: signature check failed: {check.stderr.strip()[:200]}", dim=True)
    say("Code signature       ad-hoc re-signed for Gatekeeper (entitlements preserved)")
