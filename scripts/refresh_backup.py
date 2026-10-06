#!/usr/bin/env python3
"""
scripts/refresh_backup.py
Refreshes C:\\Users\\Calibro1\\Downloads\\atlas-installer-backup-2026-09-08.zip with
current repository files. Stores clean root-relative paths and strictly excludes
.agents/, .git/, build/, *.spec, and ORIGINAL_REQUEST.md.
"""

import os
import sys
import zipfile
from pathlib import Path

# Paths
REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_BACKUP_PATH = Path(r"C:\Users\Calibro1\Downloads\atlas-installer-backup-2026-09-08.zip")

EXCLUDE_DIRS = {
    ".agents",
    ".git",
    "build",
    "__pycache__",
    ".pytest_cache",
    ".vscode",
    ".idea",
    "node_modules",
}

EXCLUDE_FILES = {
    "AtlasSetup.spec",
    "ORIGINAL_REQUEST.md",
}

EXCLUDE_EXTENSIONS = {
    ".spec",
}


def refresh_backup(backup_path: Path = DEFAULT_BACKUP_PATH) -> int:
    print(f"Refreshing backup archive at: {backup_path}")
    print(f"Source repository root: {REPO_ROOT}")

    backup_path.parent.mkdir(parents=True, exist_ok=True)
    temp_backup = backup_path.with_suffix(".zip.tmp")

    archived_count = 0
    with zipfile.ZipFile(temp_backup, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for p in sorted(REPO_ROOT.rglob("*")):
            if not p.is_file():
                continue
            rel = p.relative_to(REPO_ROOT)
            # Check directory exclusions
            if any(part in EXCLUDE_DIRS for part in rel.parts):
                continue
            # Check file name exclusions
            if rel.name in EXCLUDE_FILES or p.suffix.lower() in EXCLUDE_EXTENSIONS:
                continue

            # Store clean root-relative POSIX path
            arcname = rel.as_posix()
            zf.write(p, arcname)
            archived_count += 1

    # Replace old backup archive atomically
    if backup_path.exists():
        backup_path.unlink()
    temp_backup.rename(backup_path)

    size_bytes = backup_path.stat().st_size
    print(f"Backup archive successfully created: {archived_count} files ({size_bytes:,} bytes)")

    # Integrity verification
    with zipfile.ZipFile(backup_path, "r") as zf:
        bad_file = zf.testzip()
        if bad_file is not None:
            print(f"Error: Corrupted file detected in archive: {bad_file}", file=sys.stderr)
            return 1
        print("Archive integrity verified (testzip passed).")

    return 0


def main():
    target_zip = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_BACKUP_PATH
    sys.exit(refresh_backup(target_zip))


if __name__ == "__main__":
    main()
