"""Step 6: edit Vivaldi's Preferences (backed up first; never overwritten when unreadable)."""

import json
import shutil
import time
from pathlib import Path

from . import util
from .paths import get_prefs_file, newtab_url
from .util import fail, read_text, say, write_json


# The Tools sidebar (PasteKit, Remover, Notes, Saved tabs) is archived, not
# installed: see _old/archive/sidebar-tools/RESTORE.md. The ids below are only used to
# remove a panel an earlier install left in the profile.
PANEL_ID = "WEBPANEL_atlas_sidebar"


def _ensure(d: dict, key: str) -> dict:
    if not isinstance(d.get(key), dict):
        d[key] = {}
    return d[key]


def _load_prefs(prefs_file: Path) -> dict:
    """Read Preferences. A file that exists but will not parse stops the install:
    writing over it would wipe every Vivaldi setting the user has."""
    if not prefs_file.is_file():
        if util.DRY:
            say(f"[dry-run] Preferences not found ({prefs_file}) - will create new profile config")
        else:
            say(f"Initializing new Preferences profile ({prefs_file})")
            prefs_file.parent.mkdir(parents=True, exist_ok=True)
        return {}
    try:
        prefs = json.loads(read_text(prefs_file))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as e:
        fail(
            f"Could not read Vivaldi Preferences ({prefs_file}): {e}\n"
            "  Nothing was written to it. Open and close Vivaldi once, then run the installer again."
        )
    if not isinstance(prefs, dict):
        fail(f"Vivaldi Preferences is not a JSON object ({prefs_file}). Nothing was written to it.")
    return prefs


def _backup_prefs(prefs_file: Path):
    """Keep the very first copy (.atlas-bak) plus a dated copy of every install."""
    if util.DRY or not prefs_file.is_file():
        return
    first = prefs_file.with_name(prefs_file.name + ".atlas-bak")
    if not first.exists():
        shutil.copy2(prefs_file, first)
    stamp = time.strftime("%Y%m%d-%H%M%S")
    shutil.copy2(prefs_file, prefs_file.with_name(f"{prefs_file.name}.atlas-bak-{stamp}"))


def _prefs_appearance(v: dict, css_dst: Path):
    # Custom UI modifications directory.
    _ensure(v, "appearance")["css_ui_mods_directory"] = str(css_dst)
    # Atlas owns the browser theme. Vivaldi's default schedule ("system")
    # swaps in the built-in Dark theme whenever macOS is dark, overriding
    # the Atlas Light/Dark theme and turning the frame dark on its own.
    _ensure(_ensure(v, "theme"), "schedule")["enabled"] = "off"


def _prefs_remove_tools_panel(v: dict):
    # The Tools sidebar web panel is archived: remove it (and its panel-bar slot)
    # if an earlier install added it. The panel bar itself is left as the user has it.
    panels = _ensure(v, "panels")
    web = _ensure(panels, "web")
    _ensure(panels, "state")
    toolbars = _ensure(v, "toolbars")
    elements = web.get("elements")
    if isinstance(elements, list):
        web["elements"] = [
            e for e in elements
            if not (
                isinstance(e, dict)
                and (e.get("id") == PANEL_ID or "/sidepanel.html" in str(e.get("url", "")))
            )
        ]
    panel_bar = toolbars.get("panel")
    panel_bar = list(panel_bar) if isinstance(panel_bar, list) else []
    # Extensions moves to the mainbar (see _prefs_navigation_toolbar).
    toolbars["panel"] = [x for x in panel_bar if str(x) != PANEL_ID and x != "Extensions"]


def _prefs_address_bar(prefs: dict, v: dict):
    # atlas.js only restyles chrome elements that already exist, so the mainbar
    # must be visible and must carry the Extensions (puzzle) button.
    addr = _ensure(v, "address_bar")
    addr["visible"] = True
    _ensure(addr, "extensions")["show_all_toggle"] = True

    # No inline auto-complete, bookmark autofill, history or suggestions.
    auto = _ensure(addr, "autocomplete")
    auto["enabled"] = False
    _ensure(auto, "suffix_expansion")["enabled"] = False

    omni = _ensure(addr, "omnibox")
    for key in ("enabled", "bookmarks", "bookmarks_boosted", "show_bookmarks",
                "show_nicknames", "show_typed_history", "show_browser_history",
                "show_search_history", "search_history_enable", "show_vivaldi_calculator"):
        omni[key] = False

    srch = _ensure(addr, "search")
    for key in ("direct_match_enabled", "direct_match_boosted", "suggest_enabled"):
        srch[key] = False

    in_srch = _ensure(addr, "inline_search")
    in_srch["suggest_enabled"] = False
    in_srch["suggest_on_nickname"] = False

    _ensure(prefs, "search")["suggest_enabled"] = False


def _insert_after(nav: list, btn: str, anchors: tuple, before: bool = False):
    """Put btn right after the first anchor found (or before it), else at the end."""
    nav[:] = [x for x in nav if x != btn]
    for a in anchors:
        if a in nav:
            nav.insert(nav.index(a) + (0 if before else 1), btn)
            return
    nav.append(btn)


def _prefs_navigation_toolbar(v: dict):
    toolbars = _ensure(v, "toolbars")
    # atlas.js only restyles Back/Forward when they live on the mainbar, so
    # pull them off the tab-bar sub-toolbars and onto navigation.
    for tb in ("tabbar_before", "tabbar_after"):
        arr = toolbars.get(tb)
        if isinstance(arr, list) and ("Back" in arr or "Forward" in arr):
            toolbars[tb] = [x for x in arr if x not in ("Back", "Forward")]

    nav = toolbars.get("navigation")
    nav = list(nav) if isinstance(nav, list) else []
    if not nav:
        nav = ["Reload", "AddressField"]
    for i, btn in enumerate(b for b in ("Back", "Forward") if b not in nav):
        nav.insert(i, btn)
    for btn in ("Spacer", "AccountButton"):
        if btn not in nav:
            nav.append(btn)

    # Extensions sits right after AddressField, not out by AccountButton/window
    # controls: its native popup anchors to wherever the button is, and one
    # planted at the far corner gets clipped by the screen edge.
    _insert_after(nav, "Extensions", ("AddressField",))
    # Home sits right after Reload, or just before AddressField.
    if "Reload" in nav:
        _insert_after(nav, "Home", ("Reload",))
    else:
        _insert_after(nav, "Home", ("AddressField",), before=True)
    toolbars["navigation"] = nav


def _prefs_new_tab(v: dict):
    # The Atlas dashboard becomes the new-tab and home page (link type 4 = custom URL).
    url = newtab_url()
    v["homepage"] = url
    tabs = _ensure(v, "tabs")
    tabs["focus_webview"] = True
    new_page = _ensure(tabs, "new_page")
    new_page["link"] = 4
    new_page["custom_url"] = url


def _prefs_themes(v: dict, payload: Path):
    # Atlas themes: merge by id, pick one if none active.
    theme_file = payload / "atlas-themes.json"
    if not theme_file.is_file():
        return
    themes = _ensure(v, "themes")
    user_themes = themes.get("user")
    user_themes = list(user_themes) if isinstance(user_themes, list) else []
    existing_ids = {str(t.get("id")) for t in user_themes if isinstance(t, dict)}
    for at in json.loads(read_text(theme_file)):
        tid = str(at.get("id"))
        if tid not in existing_ids:
            user_themes.append(at)
            existing_ids.add(tid)
    themes["user"] = user_themes
    if str(themes.get("current")) not in ("AtlasLight", "AtlasDark"):
        themes["current"] = "AtlasLight"


def _prefs_startup(prefs: dict, v: dict):
    # Developer Mode on, so unpacked extensions can be managed freely.
    _ensure(_ensure(prefs, "extensions"), "ui")["developer_mode"] = True
    # A clean exit state prevents crash-recovery loops on restored tabs.
    prof = _ensure(prefs, "profile")
    prof["exit_type"] = "Normal"
    prof["exited_cleanly"] = True
    # Open a fresh new tab on startup rather than restoring the last session.
    _ensure(prefs, "session")["restore_on_startup"] = 1
    _ensure(v, "startup")["type"] = 2


def step6_preferences(payload: Path, css_dst: Path):
    prefs_file = get_prefs_file()
    prefs = _load_prefs(prefs_file)
    v = _ensure(prefs, "vivaldi")
    _prefs_appearance(v, css_dst)
    _prefs_remove_tools_panel(v)
    _prefs_address_bar(prefs, v)
    _prefs_navigation_toolbar(v)
    _prefs_new_tab(v)
    _prefs_themes(v, payload)
    _prefs_startup(prefs, v)
    _backup_prefs(prefs_file)
    write_json(prefs_file, prefs, label="Preferences")
    say("Preferences          panel + mainbar + new-tab + css dir + themes set")
