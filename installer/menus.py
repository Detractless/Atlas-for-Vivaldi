"""Step 5: prune Vivaldi's page context menus."""

import json
from pathlib import Path

from .util import read_text, say, write_json


MENU_PLAN = {
    "pageviews": [
        ["DOCUMENT_BACK", "DOCUMENT_FORWARD", "DOCUMENT_RELOAD"],
        ["DOCUMENT_COPY_ADDRESS", "DOCUMENT_SAVE", "DOCUMENT_PRINT"],
        ["DOCUMENT_EXIT_FULLSCREEN"],
        ["DOCUMENT_CONTAINER_DEVELOPER_TOOLS"],
    ],
    "pagelinks": [
        ["DOCUMENT_OPEN_IN_NEW_TAB", "DOCUMENT_OPEN_IN_NEW_BACKGROUND_TAB"],
        ["DOCUMENT_COPY_LINK_ADDRESS"],
        ["DOCUMENT_CONTAINER_DEVELOPER_TOOLS"],
    ],
    "pageimages": [
        ["DOCUMENT_OPEN_IMAGE_IN_NEW_TAB", "DOCUMENT_COPY_IMAGE"],
        ["DOCUMENT_SAVE_IMAGE"],
        ["DOCUMENT_CONTAINER_DEVELOPER_TOOLS"],
    ],
    "pageselections": [
        ["DOCUMENT_COPY", "DOCUMENT_SEARCH"],
        ["DOCUMENT_CONTAINER_DEVELOPER_TOOLS"],
    ],
    "docedit": [
        ["DOCUMENT_CONTAINER_SPELLCHECK"],
        ["DOCUMENT_CUT", "DOCUMENT_COPY", "DOCUMENT_PASTE"],
        ["DOCUMENT_SELECT_ALL"],
    ],
}


def step5_context_menus(res: Path):
    menu_file = res / "menus" / "contextmenu.json"
    if not menu_file.is_file():
        return
    menus = json.loads(read_text(menu_file))
    for name, plan in MENU_PLAN.items():
        menu = next(
            (m for m in menus if isinstance(m, dict) and m.get("action") == name),
            None,
        )
        if not menu or not isinstance(menu.get("children"), list):
            continue
        children = menu["children"]
        by_action = {}
        for c in children:
            act = c.get("action") if isinstance(c, dict) else None
            if act and act not in by_action:
                by_action[act] = c
        seps = [c for c in children if isinstance(c, dict) and c.get("type") == "separator"]
        out = []
        sep_idx = 0
        for group in plan:
            picked = [by_action[a] for a in group if a in by_action]
            if not picked:
                continue
            if out and sep_idx < len(seps):
                out.append(seps[sep_idx])
                sep_idx += 1
            out.extend(picked)
        if out:
            menu["children"] = out
    write_json(menu_file, menus, label="contextmenu.json")
    say("Context menus        pruned")
