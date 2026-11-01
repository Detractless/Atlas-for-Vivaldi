#!/usr/bin/env python3
"""Build Atlas's application-local macOS shortcut filter (no helper process)."""
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main():
    if sys.platform != "darwin":
        raise SystemExit("Build the universal macOS library on macOS with Xcode command-line tools.")
    source = ROOT / "src/native/macos/AtlasSequenceCapture.m"
    output = ROOT / "payload/install-files/native/macos/AtlasShortcuts.dylib"
    output.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run([
        "xcrun", "clang", "-dynamiclib", "-fobjc-arc", "-fblocks", "-Wall", "-Wextra", "-Werror",
        "-arch", "arm64", "-arch", "x86_64", "-mmacosx-version-min=12.0",
        "-framework", "AppKit", "-framework", "Foundation", str(source), "-o", str(output),
    ], check=True)
    subprocess.run(["codesign", "--force", "--sign", "-", str(output)], check=True)
    print(output)


if __name__ == "__main__":
    main()
