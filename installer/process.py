"""Closing Vivaldi before files are replaced."""

import subprocess
import sys
import time
from pathlib import Path

from . import util
from .util import say


def vivaldi_running() -> bool:
    if sys.platform == "darwin":
        return subprocess.run(
            ["pgrep", "-if", "Vivaldi.app"],
            capture_output=True,
        ).returncode == 0
    out = subprocess.run(
        ["tasklist", "/FI", "IMAGENAME eq vivaldi.exe", "/NH"],
        capture_output=True, text=True,
    ).stdout.lower()
    return "vivaldi.exe" in out


def close_vivaldi():
    if not vivaldi_running():
        return
    if util.DRY:
        say("[dry-run] would close Vivaldi")
        return
    say("Closing Vivaldi...")
    if sys.platform == "darwin":
        subprocess.run(["osascript", "-e", 'tell application "Vivaldi" to quit'], capture_output=True)
        deadline = time.time() + 15
        while vivaldi_running() and time.time() < deadline:
            time.sleep(0.5)
        if vivaldi_running():
            subprocess.run(["pkill", "-KILL", "-if", "Vivaldi.app"], capture_output=True)
            time.sleep(2)
        # Clear orphaned Chromium singleton socket / lock files
        vivaldi_data = Path.home() / "Library" / "Application Support" / "Vivaldi"
        for lock_name in ("SingletonLock", "SingletonSocket", "SingletonCookie"):
            for lock_file in (vivaldi_data / lock_name, vivaldi_data / "Default" / lock_name):
                try:
                    if lock_file.exists() or lock_file.is_symlink():
                        lock_file.unlink()
                except Exception:
                    pass  # best effort: Vivaldi recreates or ignores a stale lock
    else:
        subprocess.run(["taskkill", "/IM", "vivaldi.exe"], capture_output=True, text=True)
        deadline = time.time() + 15
        while vivaldi_running() and time.time() < deadline:
            time.sleep(0.5)
        if vivaldi_running():
            subprocess.run(["taskkill", "/F", "/IM", "vivaldi.exe"], capture_output=True, text=True)
            time.sleep(3)
