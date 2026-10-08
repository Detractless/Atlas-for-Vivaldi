"""Output, dry-run switch and the file helpers every step uses."""

import json
import shutil
import sys
from pathlib import Path


DRY = False


def say(msg, *, dim=False):
    print(("  " + msg) if not dim else ("  " + msg))


def _guard():
    if DRY:
        return True
    return False


def copy_file(src: Path, dst_dir: Path):
    dst_dir_str = str(dst_dir)
    if _guard():
        say(f"[dry-run] copy file {src.name} -> {dst_dir_str}")
        return
    dst_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst_dir / src.name)


# Never install private signing keys, Finder metadata or stale source maps.
NEVER_INSTALL = ("*.pem", ".DS_Store", "*.map")


def copy_tree(src_dir: Path, dst_dir: Path):
    if _guard():
        say(f"[dry-run] copy tree {src_dir}\\*  ->  {dst_dir}")
        return
    dst_dir.mkdir(parents=True, exist_ok=True)
    shutil.copytree(src_dir, dst_dir, dirs_exist_ok=True,
                    ignore=shutil.ignore_patterns(*NEVER_INSTALL))


def read_text(p: Path) -> str:
    return p.read_text(encoding="utf-8")


def write_text(p: Path, text: str, *, label=None):
    if _guard():
        say(f"[dry-run] write {label or p}")
        return
    with open(p, "w", encoding="utf-8", newline="") as f:
        f.write(text)


def write_json(p: Path, data, *, label=None):
    # Chromium/Vivaldi write Preferences as compact JSON on one line; match that.
    blob = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    if _guard():
        say(f"[dry-run] write JSON {label or p}  ({len(blob)} bytes)")
        return
    with open(p, "w", encoding="utf-8", newline="") as f:
        f.write(blob)


def fail(msg: str):
    print()
    print("  ERROR: " + msg)
    sys.exit(1)
