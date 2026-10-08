"""Where Vivaldi and the payload are, and the ids from atlasKeys.json."""

import json
import os
import re
import sys
from pathlib import Path

from .util import fail, read_text, say


def payload_root() -> Path:
    # installer/paths.py -> the folder that holds install.py and payload/.
    base = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent.parent))
    return base / "payload"


def vivaldi_data_dir() -> Path:
    """Vivaldi's per-user folder: ~/Library/Application Support/Vivaldi or %LOCALAPPDATA%/Vivaldi."""
    if sys.platform == "darwin":
        return Path.home() / "Library" / "Application Support" / "Vivaldi"
    local = os.environ.get("LOCALAPPDATA", "")
    if not local:
        fail("LOCALAPPDATA is not set; cannot locate Vivaldi.")
    return Path(local) / "Vivaldi"


def get_atlas_root() -> Path:
    return vivaldi_data_dir() / "Atlas"


def get_prefs_file() -> Path:
    base = vivaldi_data_dir()
    pref_ud = base / "User Data" / "Default" / "Preferences"
    if sys.platform != "darwin":
        return pref_ud
    pref = base / "Default" / "Preferences"
    if pref_ud.is_file() and not pref.is_file():
        return pref_ud
    return pref


def find_vivaldi_res() -> Path:
    if sys.platform == "darwin":
        app_candidates = [
            Path("/Applications/Vivaldi.app"),
            Path.home() / "Applications" / "Vivaldi.app",
        ]
        app_root = next((p for p in app_candidates if p.is_dir()), None)
        if not app_root:
            fail("Vivaldi.app not found in /Applications or ~/Applications. Install Vivaldi first, then run this again.")
        framework_versions = (
            app_root / "Contents" / "Frameworks" / "Vivaldi Framework.framework" / "Versions"
        )
        if not framework_versions.is_dir():
            fail(f"Vivaldi Framework versions not found under {framework_versions}")
        current_res = framework_versions / "Current" / "Resources" / "vivaldi"
        if current_res.is_dir():
            res = current_res.resolve()
            ver_name = res.parent.parent.name if res.parent.parent.name != "Versions" else res.parent.name
            say(f"Vivaldi macOS ({ver_name})")
            return res
        ver_re = re.compile(r"^\d+\.\d+\.\d+\.\d+$")
        versions = [d for d in framework_versions.iterdir() if d.is_dir() and ver_re.match(d.name)]
        if not versions:
            fail(f"No Vivaldi version folder found under {framework_versions}")
        newest = max(versions, key=lambda d: tuple(int(x) for x in d.name.split(".")))
        res = newest / "Resources" / "vivaldi"
        if not res.is_dir():
            fail(f"Not found: {res}")
        say(f"Vivaldi macOS {newest.name}")
        return res

    local = os.environ.get("LOCALAPPDATA", "")
    if not local:
        fail("LOCALAPPDATA is not set; cannot locate Vivaldi.")
    app_root = Path(local) / "Vivaldi" / "Application"
    if not app_root.is_dir():
        fail(f"Vivaldi not found at {app_root}. Install Vivaldi first, then run this again.")
    ver_re = re.compile(r"^\d+\.\d+\.\d+\.\d+$")
    versions = [d for d in app_root.iterdir() if d.is_dir() and ver_re.match(d.name)]
    if not versions:
        fail(f"No Vivaldi version folder under {app_root}")
    newest = max(versions, key=lambda d: tuple(int(x) for x in d.name.split(".")))
    res = newest / "resources" / "vivaldi"
    if not res.is_dir():
        fail(f"Not found: {res}")
    say(f"Vivaldi {newest.name}")
    return res


def atlas_keys() -> dict:
    """payload/detractless/src/constants/atlasKeys.json: the one list of ids and storage keys."""
    path = payload_root() / "detractless" / "src" / "constants" / "atlasKeys.json"
    return json.loads(read_text(path))


def newtab_url() -> str:
    keys = atlas_keys()
    return f"chrome-extension://{keys['extensionId']}/{keys['newTabPath']}"
