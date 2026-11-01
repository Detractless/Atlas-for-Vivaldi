"""Step 7: Extension management (Harper uninstalled)."""

import sys
from pathlib import Path

from . import util
from .paths import get_atlas_root
from .util import say


def step7_harper_extension(payload: Path):
    """Clean up and remove Harper extension to keep browser unencumbered."""
    harper_dst = get_atlas_root() / "extensions" / "harper"
    if harper_dst.exists():
        import shutil
        shutil.rmtree(harper_dst, ignore_errors=True)

    ext_id = "lodbfhdipoipcjmlebjbgmmgekckhpfb"
    crx_id = "oenajmgiaobmflfekmhekopaookeambi"

    if not util.DRY:
        if sys.platform == "darwin":
            ext_dirs = [
                Path.home() / "Library" / "Application Support" / "Vivaldi" / "External Extensions",
                Path.home() / "Library" / "Application Support" / "Google" / "Chrome" / "External Extensions",
            ]
            for d in ext_dirs:
                try:
                    for fid in (ext_id, crx_id):
                        target_file = d / f"{fid}.json"
                        if target_file.is_file():
                            target_file.unlink()
                except Exception as e:
                    say(f"Warning: could not remove Harper registration from {d}: {e}", dim=True)
    say("Harper extension     uninstalled/skipped")
