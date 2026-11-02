"""Step 6b: the facts every other profile needs, written next to atlas.js.

The installer sets up the one profile it is run for (preferences.py). Atlas's window code runs in every
profile; src/modules/39-profile-setup.js reads this file on a profile's first open and applies the same
settings there (38-profile-recipe.js holds the rules; tests/unit/profile_recipe_parity.test.js keeps the two
in step). Raise RECIPE_VERSION when the settings change and every profile applies them once more.
"""

import json
from pathlib import Path

from .paths import atlas_keys, newtab_url
from .preferences import DOWNLOADS_PANEL_ID, DOWNLOADS_PANEL_PATH
from .util import read_text, say, write_json

RECIPE_VERSION = 2
FACTS_FILE = "atlas-profile.json"


def profile_facts(payload: Path, css_dst: Path) -> dict:
    theme_file = payload / "atlas-themes.json"
    themes = json.loads(read_text(theme_file)) if theme_file.is_file() else []
    return {
        "version": RECIPE_VERSION,
        "cssDir": str(css_dst),
        "newTabUrl": newtab_url(),
        "downloadsPanel": {
            "id": DOWNLOADS_PANEL_ID,
            "url": f"chrome-extension://{atlas_keys()['extensionId']}/{DOWNLOADS_PANEL_PATH}",
        },
        "themes": themes,
    }


def step6_profile_facts(res: Path, payload: Path, css_dst: Path):
    write_json(res / FACTS_FILE, profile_facts(payload, css_dst), label=FACTS_FILE)
    say("Other profiles       set up on first open")
