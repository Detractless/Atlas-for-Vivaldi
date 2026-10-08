"""Step 7: the Harper extension."""

import sys
from pathlib import Path

from . import util
from .paths import get_atlas_root
from .util import copy_tree, say, write_json


def step7_harper_extension(payload: Path):
    harper_src = payload / "extensions" / "harper"
    if not harper_src.is_dir():
        say("Harper extension payload missing - SKIPPED")
        return
    harper_dst = get_atlas_root() / "extensions" / "harper"
    copy_tree(harper_src, harper_dst)

    ext_id = "lodbfhdipoipcjmlebjbgmmgekckhpfb"
    manifest_path = harper_dst / "manifest.json"

    if not util.DRY:
        if sys.platform == "darwin":
            ext_dirs = [
                Path.home() / "Library" / "Application Support" / "Vivaldi" / "External Extensions",
                Path.home() / "Library" / "Application Support" / "Google" / "Chrome" / "External Extensions",
            ]
            crx_path = harper_dst / "harper.crx"
            crx_id = "oenajmgiaobmflfekmhekopaookeambi"
            for d in ext_dirs:
                try:
                    d.mkdir(parents=True, exist_ok=True)
                    if crx_path.is_file():
                        ext_data_crx = {
                            "external_version": "1.0.0",
                            "external_crx": str(crx_path),
                        }
                        write_json(d / f"{crx_id}.json", ext_data_crx, label=f"External Extensions/{crx_id}.json")
                    ext_data_unpacked = {
                        "external_version": "1.0.0",
                        "path": str(manifest_path),
                    }
                    write_json(d / f"{ext_id}.json", ext_data_unpacked, label=f"External Extensions/{ext_id}.json")
                except Exception as e:
                    say(f"Warning: could not register Harper in {d}: {e}", dim=True)
        elif sys.platform == "win32":
            try:
                import winreg
                for reg_path in (
                    rf"Software\Vivaldi\Extensions\{ext_id}",
                    rf"Software\Google\Chrome\Extensions\{ext_id}",
                ):
                    try:
                        with winreg.CreateKeyEx(winreg.HKEY_CURRENT_USER, reg_path, 0, winreg.KEY_SET_VALUE) as key:
                            winreg.SetValueEx(key, "path", 0, winreg.REG_SZ, str(manifest_path))
                            winreg.SetValueEx(key, "version", 0, winreg.REG_SZ, "1.0.0")
                    except Exception as e:
                        say(f"Warning: could not register Harper under {reg_path}: {e}", dim=True)
            except ImportError:
                pass  # no winreg: not Windows after all
    say("Harper extension     installed")
