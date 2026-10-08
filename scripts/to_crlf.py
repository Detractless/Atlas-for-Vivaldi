#!/usr/bin/env python3
"""Convert text files to CRLF line endings (the repo convention).

Usage: python3 scripts/to_crlf.py FILE...   (no args: every changed or new file in git)
Shell scripts (*.sh) keep LF, since bash cannot run CRLF scripts. Binary files are skipped.
"""
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
KEEP_LF = {".sh"}
# Files other tools own and rewrite in their own format.
SKIP_NAMES = {"package-lock.json", "project.json"}
SKIP_DIRS = {".claude", ".agents", "node_modules"}


def changed_files():
    out = subprocess.run(["git", "status", "--porcelain", "-uall"], cwd=ROOT,
                         capture_output=True, text=True, check=True).stdout
    for line in out.splitlines():
        path = line[3:].split(" -> ")[-1].strip('"')
        if line[:2].strip() != "D":
            yield ROOT / path


def convert(path: Path) -> bool:
    if not path.is_file() or path.suffix in KEEP_LF or path.name in SKIP_NAMES:
        return False
    if SKIP_DIRS.intersection(path.relative_to(ROOT).parts):
        return False
    data = path.read_bytes()
    if b"\0" in data[:8000]:
        return False
    fixed = data.replace(b"\r\n", b"\n").replace(b"\n", b"\r\n")
    if fixed == data:
        return False
    path.write_bytes(fixed)
    return True


def main(argv):
    files = [Path(a).resolve() for a in argv] if argv else list(changed_files())
    done = [f for f in files if convert(f)]
    for f in done:
        print("crlf", f.relative_to(ROOT))


if __name__ == "__main__":
    main(sys.argv[1:])
