#!/usr/bin/env python3
"""
scripts/build.py — the one build entry point; build.sh and build.cmd call it.

  1. src/modules            -> payload/install-files/atlas.js   (scripts/bundle.py)
  2. payload/detractless/src -> payload/detractless/src/dist     (npm run build; needs `npm install` once)
  3. macOS:   dist/AtlasSetup.dmg        (scripts/build_dmg.py)
     Windows: dist/AtlasSetup(.exe)     (PyInstaller one-file build, if installed)
     else:    nothing to package; run `python3 install.py` from source.

Step 2 is skipped with a notice when node_modules is missing: the bundles in
dist are committed, and tests/unit/build_sync.test.js keeps them current.
"""

import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def run(cmd, label):
    print(f"\n== {label}")
    res = subprocess.run(cmd, cwd=ROOT)
    if res.returncode != 0:
        sys.exit(f"BUILD FAILED at: {label}")


def build_newtab():
    if not (ROOT / "node_modules" / "esbuild").is_dir() or not shutil.which("node"):
        print("\n== New-tab bundles: skipped (run `npm install` to rebuild them; the committed ones are used)")
        return
    run(["node", "scripts/build.mjs"], "New-tab bundles (esbuild)")


def package():
    if sys.platform == "darwin":
        run([sys.executable, "scripts/build_dmg.py"], "macOS DMG")
        return
    pyinstaller = subprocess.run([sys.executable, "-m", "PyInstaller", "--version"], capture_output=True)
    if pyinstaller.returncode != 0:
        print("\n== Packaging: PyInstaller not installed; run the installer from source: python3 install.py")
        return
    sep = ";" if sys.platform == "win32" else ":"
    run([sys.executable, "-m", "PyInstaller", "--noconfirm", "--clean", "--onefile", "--console",
         "--name", "AtlasSetup", "--add-data", f"payload{sep}payload",
         "--collect-submodules", "encodings", "install.py"], "One-file executable (PyInstaller)")
    shutil.rmtree(ROOT / "build", ignore_errors=True)
    (ROOT / "AtlasSetup.spec").unlink(missing_ok=True)


def main():
    run([sys.executable, "scripts/bundle.py"], "Browser-window bundle (atlas.js)")
    build_newtab()
    package()
    print("\nBUILD OK")


if __name__ == "__main__":
    main()
