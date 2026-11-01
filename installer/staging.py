"""macOS: patch a staged copy of Vivaldi.app when the original is locked."""

import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

from . import util
from .util import say


class MacOSStagingContext:
    def __init__(self, res: Path, allow_live: bool = True):
        self.orig_res = res
        self.is_staged = False
        self.orig_bundle = None
        self.staging_bundle = None
        self.old_bundle = None
        self.allow_live = allow_live

        if sys.platform == "darwin":
            for parent in [res, *res.parents]:
                if parent.suffix == ".app":
                    self.orig_bundle = parent.resolve()
                    break

    def __enter__(self) -> Path:
        if sys.platform != "darwin" or not self.orig_bundle:
            return self.orig_res

        # Test write permission on res
        test_file = self.orig_res / ".write_test"
        can_write = False
        if not util.DRY:
            try:
                test_file.touch()
                test_file.unlink()
                can_write = True
            except (PermissionError, OSError):
                can_write = False
        else:
            can_write = True

        if can_write:
            return self.orig_res

        from .process import vivaldi_running
        if not self.allow_live and not vivaldi_running():
            pass  # a close request may have just freed the bundle
        elif vivaldi_running():
            # Swapping the .app bundle out from under a running Vivaldi is too
            # risky; ask for a quit instead.
            util.fail("Vivaldi's app bundle is locked (macOS App Management) while Vivaldi runs.\n"
                      "  Quit Vivaldi, or pass --close to let the installer quit it first.")

        say("macOS App Management detected: staging bundle to bypass lock...")
        caches_dir = Path.home() / "Library" / "Caches"
        caches_dir.mkdir(parents=True, exist_ok=True)
        self.staging_bundle = caches_dir / f"Vivaldi_staging_{os.getpid()}.app"
        if self.staging_bundle.exists():
            shutil.rmtree(self.staging_bundle, ignore_errors=True)

        subprocess.run(["ditto", str(self.orig_bundle), str(self.staging_bundle)], check=True)
        self.is_staged = True
        rel = self.orig_res.relative_to(self.orig_bundle)
        return self.staging_bundle / rel

    def finalize(self):
        if not self.is_staged or not self.staging_bundle or util.DRY:
            return

        say("Replacing Vivaldi bundle with patched version...")
        self.old_bundle = self.orig_bundle.parent / f"{self.orig_bundle.name}.old.{int(time.time())}"
        self.orig_bundle.rename(self.old_bundle)
        self.staging_bundle.rename(self.orig_bundle)

        try:
            shutil.rmtree(self.old_bundle)
        except Exception:
            try:
                trash_dest = Path.home() / ".Trash" / f"{self.old_bundle.name}_{int(time.time())}"
                self.old_bundle.rename(trash_dest)
            except Exception as e:
                say(f"Warning: the old Vivaldi copy is still at {self.old_bundle} ({e}); delete it by hand.", dim=True)
        say("Vivaldi bundle          successfully updated")
        lsregister = Path("/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister")
        if lsregister.is_file():
            subprocess.run([str(lsregister), "-f", str(self.orig_bundle)], capture_output=True)

    def __exit__(self, exc_type, exc_val, exc_tb):
        if exc_type is not None and self.is_staged and self.staging_bundle and self.staging_bundle.exists():
            shutil.rmtree(self.staging_bundle, ignore_errors=True)
