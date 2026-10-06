#!/usr/bin/env python3
"""
Atlas for Vivaldi - all-in-one installer (Python port of install.ps1).

Installs the Atlas UI (custom History/Downloads/Extensions pages, the Detractless
new tab, the Tools sidebar and the Element Remover engine) into an existing
Vivaldi install on this machine. Everything - including the JSON edits to your
profile Preferences - is done here with the standard library; no Node, no
PowerShell, no system Python needed when run from the packaged .exe.

Vivaldi MUST be closed. This script closes it for you and (unless --no-launch)
reopens it at the end.
"""

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path

# --------------------------------------------------------------------------- #
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


def copy_tree(src_dir: Path, dst_dir: Path):
    if _guard():
        say(f"[dry-run] copy tree {src_dir}\\*  ->  {dst_dir}")
        return
    dst_dir.mkdir(parents=True, exist_ok=True)
    # Never install private signing keys or Finder metadata.
    shutil.copytree(src_dir, dst_dir, dirs_exist_ok=True,
                    ignore=shutil.ignore_patterns("*.pem", ".DS_Store"))


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


# --------------------------------------------------------------------------- #
def payload_root() -> Path:
    base = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent))
    return base / "payload"


def get_atlas_root() -> Path:
    if sys.platform == "darwin":
        return Path.home() / "Library" / "Application Support" / "Vivaldi" / "Atlas"
    local = os.environ.get("LOCALAPPDATA", "")
    if not local:
        fail("LOCALAPPDATA is not set; cannot locate Vivaldi.")
    return Path(local) / "Vivaldi" / "Atlas"


def get_prefs_file() -> Path:
    if sys.platform == "darwin":
        base = Path.home() / "Library" / "Application Support" / "Vivaldi"
        pref = base / "Default" / "Preferences"
        pref_ud = base / "User Data" / "Default" / "Preferences"
        if pref_ud.is_file() and not pref.is_file():
            return pref_ud
        return pref
    local = os.environ.get("LOCALAPPDATA", "")
    if not local:
        fail("LOCALAPPDATA is not set; cannot locate Vivaldi profile.")
    return Path(local) / "Vivaldi" / "User Data" / "Default" / "Preferences"


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


def close_vivaldi():
    def running() -> bool:
        if sys.platform == "darwin":
            return subprocess.run(
                ["pgrep", "-if", "Vivaldi.app"],
                capture_output=True,
            ).returncode == 0
        out = subprocess.run(
            ["tasklist", "/FI", "IMAGENAME eq vivaldi.exe", "/NH"],
            capture_output=True, text=True,
        ).stdout.lower()
        return "vivaldi.exe" in out

    if not running():
        return
    if DRY:
        say("[dry-run] would close Vivaldi")
        return
    say("Closing Vivaldi...")
    if sys.platform == "darwin":
        subprocess.run(["osascript", "-e", 'tell application "Vivaldi" to quit'], capture_output=True)
        deadline = time.time() + 15
        while running() and time.time() < deadline:
            time.sleep(0.5)
        if running():
            subprocess.run(["pkill", "-KILL", "-if", "Vivaldi.app"], capture_output=True)
            time.sleep(2)
        # Clear orphaned Chromium singleton socket / lock files
        vivaldi_data = Path.home() / "Library" / "Application Support" / "Vivaldi"
        for lock_name in ("SingletonLock", "SingletonSocket", "SingletonCookie"):
            for lock_file in (vivaldi_data / lock_name, vivaldi_data / "Default" / lock_name):
                try:
                    if lock_file.exists() or lock_file.is_symlink():
                        lock_file.unlink()
                except Exception:
                    pass
        # Clear stale Sessions files so old tabs are discarded
        sessions_dir = vivaldi_data / "Default" / "Sessions"
        if sessions_dir.is_dir():
            for sf in sessions_dir.glob("*"):
                try:
                    sf.unlink()
                except Exception:
                    pass
    else:
        subprocess.run(["taskkill", "/IM", "vivaldi.exe"], capture_output=True, text=True)
        deadline = time.time() + 15
        while running() and time.time() < deadline:
            time.sleep(0.5)
        if running():
            subprocess.run(["taskkill", "/F", "/IM", "vivaldi.exe"], capture_output=True, text=True)
            time.sleep(3)


# --------------------------------------------------------------------------- #
COMPASS = (
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E"
    "%3Ccircle cx='12' cy='12' r='9' fill='none' stroke='%23888888' stroke-width='1.7'/%3E"
    "%3Cpath d='M15.8 8.2l-2.4 5.2-5.2 2.4 2.4-5.2z' fill='%23888888'/%3E%3C/svg%3E"
)

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

# The Tools sidebar (PasteKit, Remover, Notes, Saved tabs) is archived, not
# installed: see _old/archive/sidebar-tools/RESTORE.md. The ids below are only used to
# remove a panel an earlier install left in the profile.
PANEL_ID = "WEBPANEL_atlas_sidebar"
PANEL_URL = "chrome-extension://mpognobbkildjkofajifpdfhcoklimli/sidepanel.html"

# Files an earlier install put in Resources/vivaldi for the archived sidebar.
ARCHIVED_SIDEBAR_FILES = [
    "sidepanel.html",
    "src/pages/sidepanel",
    "src/pastekit",
    "src/content",
] + [
    f"src/dist/{n}.bundle.{e}"
    for n in ("sidepanel", "pastekit-content", "inject", "rules")
    for e in ("js", "js.map", "css", "css.map")
]


# --------------------------------------------------------------------------- #
def step1_atlas_files(masters: Path, res: Path):
    copy_file(masters / "atlas.js", res)
    copy_tree(masters / "components" / "atlas", res / "components" / "atlas")
    copy_file(masters / "src" / "atlas-localstorage-shim.js", res / "src")
    copy_file(masters / "src" / "atlas-preinit-bridge.js", res / "src")
    say("Atlas files          installed")


PROFILES_TAG = '  <script src="src/pages/newtab/profilesCore.js"></script>\n'


def step2_window_html(res: Path):
    win = res / "window.html"
    html = read_text(win)
    changed = False
    if "atlas.js" not in html:
        html = html.replace("</body>", '  <script src="atlas.js"></script>\n</body>')
        changed = True
    # The profile list/switcher is shared with the new tab; it must load before atlas.js.
    if "profilesCore.js" not in html:
        html = html.replace('  <script src="atlas.js"></script>', PROFILES_TAG + '  <script src="atlas.js"></script>', 1)
        changed = True
    if changed:
        write_text(win, html, label="window.html")
        say("window.html          patched")
    else:
        say("window.html          already patched", dim=True)


def _remove_archived_sidebar_files(res: Path):
    """Delete what an earlier install left behind for the archived Tools sidebar."""
    gone = 0
    for rel in ARCHIVED_SIDEBAR_FILES:
        target = res / rel
        if _guard():
            continue
        if target.is_dir():
            shutil.rmtree(target, ignore_errors=True)
            gone += 1
        elif target.is_file():
            target.unlink()
            gone += 1
    if gone:
        say(f"Tools sidebar        removed {gone} archived files")


def step3_detractless(detract: Path, res: Path, skip: bool):
    if skip:
        return
    if not detract.is_dir():
        say("Detractless payload missing - SKIPPED")
        return
    for f in ("index.html", "gate.html"):
        sp = detract / f
        if sp.is_file():
            copy_file(sp, res)
    if (detract / "icons").is_dir():
        copy_tree(detract / "icons", res / "icons")
    for d in ("dist", "assets", "styles", "pages"):
        src_d = detract / "src" / d
        if src_d.is_dir():
            copy_tree(src_d, res / "src" / d)
    _remove_archived_sidebar_files(res)

    if DRY:
        say("Detractless          installed + shimmed  [dry-run: head edits skipped]")
        return

    for f in ("index.html", "gate.html"):
        p = res / f
        if not p.is_file():
            continue
        t = read_text(p)
        if "atlas-localstorage-shim" not in t:
            t = re.sub(
                r"(<head>\s*\r?\n)",
                r'\1    <script src="src/atlas-localstorage-shim.js"></script>\n',
                t, count=1,
            )
        if "atlas-preinit-bridge" not in t:
            t = t.replace(
                "</head>",
                '    <script src="src/atlas-preinit-bridge.js"></script>\n</head>',
                1,
            )
        if 'name="color-scheme"' not in t:
            t = re.sub(
                r'(<meta charset="[^"]*">)',
                r'\1\n    <meta name="color-scheme" content="light dark">',
                t, count=1,
            )
        if f == "index.html" and 'rel="icon"' not in t:
            t = re.sub(
                r"(<head>[^\r\n]*\r?\n)",
                lambda m: m.group(1)
                + f'    <link rel="icon" type="image/svg+xml" href="{COMPASS}">\n',
                t, count=1,
            )
        write_text(p, t, label=f)
    say("Detractless          installed + shimmed")


def step4_css_mods(payload: Path) -> Path:
    css_dst = get_atlas_root() / "css-mods"
    legacy = css_dst / "atlas.css"
    if legacy.is_file():
        legacy.unlink()
    copy_tree(payload / "css-mods", css_dst)
    say("CSS mods             installed")
    return css_dst


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


def _ensure(d: dict, key: str) -> dict:
    if not isinstance(d.get(key), dict):
        d[key] = {}
    return d[key]


def step6_preferences(payload: Path, css_dst: Path):
    prefs_file = get_prefs_file()
    if not prefs_file.is_file():
        if DRY:
            say(f"[dry-run] Preferences not found ({prefs_file}) - will create new profile config")
            prefs = {}
        else:
            say(f"Initializing new Preferences profile ({prefs_file})")
            prefs_file.parent.mkdir(parents=True, exist_ok=True)
            prefs = {}
    else:
        bak = prefs_file.with_name(prefs_file.name + ".atlas-bak")
        if not bak.exists() and not DRY:
            shutil.copy2(prefs_file, bak)
        try:
            prefs = json.loads(read_text(prefs_file))
        except Exception:
            prefs = {}
    v = _ensure(prefs, "vivaldi")
    appear = _ensure(v, "appearance")
    panels = _ensure(v, "panels")
    web = _ensure(panels, "web")
    state = _ensure(panels, "state")
    toolbars = _ensure(v, "toolbars")
    themes = _ensure(v, "themes")

    # 6a. custom UI modifications directory
    appear["css_ui_mods_directory"] = str(css_dst)

    # 6a2. Atlas owns the browser theme. Vivaldi's default schedule ("system")
    #      swaps in the built-in Dark theme whenever macOS is dark, overriding
    #      the Atlas Light/Dark theme and turning the frame dark on its own.
    sched = _ensure(_ensure(v, "theme"), "schedule")
    sched["enabled"] = "off"

    # 6b. Tools sidebar web panel is archived: remove it (and its panel-bar slot)
    #     if an earlier install added it. The panel bar itself is left as the user has it.
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
    panel_bar = [x for x in panel_bar if str(x) != PANEL_ID]
    toolbars["panel"] = panel_bar

    # 6d. Native anchors atlas.js needs. It only restyles chrome elements that
    #     already exist, so the mainbar must be visible and must carry the
    #     Extensions (puzzle) button and the Account button.
    addr = _ensure(v, "address_bar")
    addr["visible"] = True
    ext_prefs = _ensure(addr, "extensions")
    ext_prefs["show_all_toggle"] = True

    # Disable all address bar inline auto-complete, bookmarks autofill, history, and suggestions
    auto = _ensure(addr, "autocomplete")
    auto["enabled"] = False
    auto_suffix = _ensure(auto, "suffix_expansion")
    auto_suffix["enabled"] = False

    omni = _ensure(addr, "omnibox")
    omni["enabled"] = False
    omni["bookmarks"] = False
    omni["bookmarks_boosted"] = False
    omni["show_bookmarks"] = False
    omni["show_nicknames"] = False
    omni["show_typed_history"] = False
    omni["show_browser_history"] = False
    omni["show_search_history"] = False
    omni["search_history_enable"] = False
    omni["show_vivaldi_calculator"] = False

    srch = _ensure(addr, "search")
    srch["direct_match_enabled"] = False
    srch["direct_match_boosted"] = False
    srch["suggest_enabled"] = False

    in_srch = _ensure(addr, "inline_search")
    in_srch["suggest_enabled"] = False
    in_srch["suggest_on_nickname"] = False

    search_root = _ensure(prefs, "search")
    search_root["suggest_enabled"] = False

    if "Extensions" in panel_bar:
        panel_bar = [x for x in panel_bar if x != "Extensions"]
        toolbars["panel"] = panel_bar

    # atlas.js §9 only restyles Back/Forward when they live on the mainbar, so
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
    # controls — its native popup anchors to wherever the button is, and one
    # planted at the far corner gets clipped by the screen edge. (Hover-reveal
    # CSS in atlas.css keeps it visually tucked against the field.)
    nav = [x for x in nav if x != "Extensions"]
    if "AddressField" in nav:
        nav.insert(nav.index("AddressField") + 1, "Extensions")
    else:
        nav.append("Extensions")

    # Home sits right after Reload (to its right, before AddressField)
    nav = [x for x in nav if x != "Home"]
    if "Reload" in nav:
        nav.insert(nav.index("Reload") + 1, "Home")
    elif "AddressField" in nav:
        nav.insert(nav.index("AddressField"), "Home")
    else:
        nav.append("Home")
    toolbars["navigation"] = nav

    # 6e. Atlas dashboard becomes the new-tab and home page (link type 4 = custom URL).
    v["homepage"] = "chrome-extension://mpognobbkildjkofajifpdfhcoklimli/index.html"
    tabs = _ensure(v, "tabs")
    tabs["focus_webview"] = True
    new_page = _ensure(tabs, "new_page")
    new_page["link"] = 4
    new_page["custom_url"] = (
        "chrome-extension://mpognobbkildjkofajifpdfhcoklimli/index.html"
    )

    # 6c. Atlas themes: merge by id, pick one if none active
    theme_file = payload / "atlas-themes.json"
    if theme_file.is_file():
        atlas_themes = json.loads(read_text(theme_file))
        user_themes = themes.get("user")
        user_themes = list(user_themes) if isinstance(user_themes, list) else []
        existing_ids = {
            str(t.get("id")) for t in user_themes if isinstance(t, dict)
        }
        for at in atlas_themes:
            tid = str(at.get("id"))
            if tid not in existing_ids:
                user_themes.append(at)
                existing_ids.add(tid)
        themes["user"] = user_themes
        if str(themes.get("current")) not in ("AtlasLight", "AtlasDark"):
            themes["current"] = "AtlasLight"

    # 6f. Ensure Developer Mode is enabled so unpacked extensions can be managed freely
    ext_ui = _ensure(_ensure(prefs, "extensions"), "ui")
    ext_ui["developer_mode"] = True

    # 6g. Ensure profile.exit_type is Normal to prevent crash recovery loops on restored tabs
    prof = _ensure(prefs, "profile")
    prof["exit_type"] = "Normal"
    prof["exited_cleanly"] = True

    # 6h. Open fresh new-tab on startup rather than attempting last session restore
    sess = _ensure(prefs, "session")
    sess["restore_on_startup"] = 1
    v_start = _ensure(v, "startup")
    v_start["type"] = 2

    write_json(prefs_file, prefs, label="Preferences")
    say("Preferences          panel + mainbar + new-tab + css dir + themes set")


def step7_harper_extension(payload: Path):
    harper_src = payload / "extensions" / "harper"
    if not harper_src.is_dir():
        say("Harper extension payload missing - SKIPPED")
        return
    harper_dst = get_atlas_root() / "extensions" / "harper"
    copy_tree(harper_src, harper_dst)

    ext_id = "lodbfhdipoipcjmlebjbgmmgekckhpfb"
    manifest_path = harper_dst / "manifest.json"

    if not DRY:
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
                except Exception:
                    pass
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
                    except Exception:
                        pass
            except ImportError:
                pass
    say("Harper extension     installed")


def step8_disable_autoupdates(app_root: Path):
    if sys.platform == "darwin":
        if DRY:
            say("[dry-run] would disable Sparkle auto-updates in com.vivaldi.Vivaldi")
        else:
            try:
                subprocess.run(
                    ["defaults", "write", "com.vivaldi.Vivaldi", "SUEnableAutomaticChecks", "-bool", "false"],
                    capture_output=True,
                )
                subprocess.run(
                    ["defaults", "write", "com.vivaldi.Vivaldi", "SUAutomaticallyUpdate", "-bool", "false"],
                    capture_output=True,
                )
            except Exception:
                pass
        say("Auto-updates         permanently disabled (Sparkle)")
        return

    if sys.platform != "win32":
        return
    # 1. Disable Windows Scheduled Tasks for Vivaldi updates
    try:
        q = subprocess.run(
            ["schtasks", "/Query", "/FO", "CSV", "/NH"],
            capture_output=True, text=True,
        )
        for line in q.stdout.splitlines():
            if "VivaldiUpdate" in line:
                parts = line.split(",")
                if parts:
                    task_name = parts[0].strip('"')
                    if DRY:
                        say(f"[dry-run] would disable scheduled task: {task_name}")
                    else:
                        subprocess.run(
                            ["schtasks", "/Change", "/TN", task_name, "/Disable"],
                            capture_output=True, text=True,
                        )
    except Exception:
        pass

    # 2. Neuter update_notifier.exe
    notifier = app_root / "update_notifier.exe"
    disabled_notifier = app_root / "update_notifier.exe.disabled"
    if notifier.is_file():
        if DRY:
            say(f"[dry-run] would rename {notifier.name} -> {disabled_notifier.name}")
        else:
            try:
                if disabled_notifier.is_file():
                    disabled_notifier.unlink()
                notifier.rename(disabled_notifier)
            except Exception as e:
                say(f"Warning: could not rename update_notifier.exe: {e}", dim=True)

    # 3. Registry policy flags
    if not DRY:
        try:
            import winreg
            with winreg.CreateKeyEx(
                winreg.HKEY_CURRENT_USER, r"Software\Vivaldi\AutoUpdate", 0, winreg.KEY_SET_VALUE
            ) as key:
                winreg.SetValueEx(key, "AutoUpdate", 0, winreg.REG_DWORD, 0)
                winreg.SetValueEx(key, "CheckForUpdates", 0, winreg.REG_DWORD, 0)
                winreg.SetValueEx(key, "DoNotUpdate", 0, winreg.REG_DWORD, 1)
        except Exception:
            pass

    say("Auto-updates         permanently disabled")


def step9_macos_codesign(res: Path):
    if sys.platform != "darwin":
        return
    app_bundle = None
    for parent in res.parents:
        if parent.suffix == ".app":
            app_bundle = parent
            break
    if not app_bundle or not app_bundle.is_dir():
        return
    if DRY:
        say(f"[dry-run] strip quarantine and ad-hoc re-sign {app_bundle.name}")
        return
    say("Code signing         clearing quarantine & re-signing bundle...")
    subprocess.run(["xattr", "-cr", str(app_bundle)], capture_output=True)
    subprocess.run(
        [
            "codesign",
            "--force",
            "--deep",
            "--preserve-metadata=entitlements,requirements,flags,runtime",
            "--sign",
            "-",
            str(app_bundle),
        ],
        capture_output=True,
    )
    subprocess.run(["codesign", "-vvv", "--check-restriction", str(app_bundle)], capture_output=True)
    say("Code signature       ad-hoc re-signed for Gatekeeper (entitlements preserved)")


class MacOSStagingContext:
    def __init__(self, res: Path):
        self.orig_res = res
        self.is_staged = False
        self.orig_bundle = None
        self.staging_bundle = None
        self.old_bundle = None

        if sys.platform == "darwin":
            for parent in [res, *res.parents]:
                if parent.suffix == ".app":
                    self.orig_bundle = parent.resolve()
                    break

    def __enter__(self) -> Path:
        if sys.platform != "darwin" or not self.orig_bundle:
            return self.orig_res

        # Test write permission on res
        test_file = self.orig_res / ".write_test"
        can_write = False
        if not DRY:
            try:
                test_file.touch()
                test_file.unlink()
                can_write = True
            except (PermissionError, OSError):
                can_write = False
        else:
            can_write = True

        if can_write:
            return self.orig_res

        say("macOS App Management detected: staging bundle to bypass lock...")
        caches_dir = Path.home() / "Library" / "Caches"
        caches_dir.mkdir(parents=True, exist_ok=True)
        self.staging_bundle = caches_dir / f"Vivaldi_staging_{os.getpid()}.app"
        if self.staging_bundle.exists():
            shutil.rmtree(self.staging_bundle, ignore_errors=True)

        subprocess.run(["ditto", str(self.orig_bundle), str(self.staging_bundle)], check=True)
        self.is_staged = True
        rel = self.orig_res.relative_to(self.orig_bundle)
        return self.staging_bundle / rel

    def finalize(self):
        if not self.is_staged or not self.staging_bundle or DRY:
            return

        say("Replacing Vivaldi bundle with patched version...")
        self.old_bundle = self.orig_bundle.parent / f"{self.orig_bundle.name}.old.{int(time.time())}"
        self.orig_bundle.rename(self.old_bundle)
        self.staging_bundle.rename(self.orig_bundle)

        try:
            shutil.rmtree(self.old_bundle)
        except Exception:
            try:
                trash_dest = Path.home() / ".Trash" / f"{self.old_bundle.name}_{int(time.time())}"
                self.old_bundle.rename(trash_dest)
            except Exception:
                pass
        say("Vivaldi bundle          successfully updated")
        lsregister = Path("/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister")
        if lsregister.is_file():
            subprocess.run([str(lsregister), "-f", str(self.orig_bundle)], capture_output=True)

    def __exit__(self, exc_type, exc_val, exc_tb):
        if exc_type is not None and self.is_staged and self.staging_bundle and self.staging_bundle.exists():
            shutil.rmtree(self.staging_bundle, ignore_errors=True)


# --------------------------------------------------------------------------- #
def main():
    global DRY
    ap = argparse.ArgumentParser(description="Atlas for Vivaldi installer")
    ap.add_argument("--yes", "-y", action="store_true", help="skip the confirmation prompt")
    ap.add_argument("--no-launch", action="store_true", help="do not reopen Vivaldi when done")
    ap.add_argument("--skip-detractless", action="store_true", help="do not install Detractless")
    ap.add_argument("--dry-run", action="store_true", help="print every change, touch nothing")
    args = ap.parse_args()
    DRY = args.dry_run

    print()
    say("Atlas for Vivaldi - installer" + ("   [DRY RUN]" if DRY else ""))
    say("------------------------------")

    payload = payload_root()
    masters = payload / "install-files"
    detract = payload / "detractless"
    if not masters.is_dir():
        fail(f"Payload is missing install-files\\ - package is incomplete. ({masters})")

    res = find_vivaldi_res()
    app_root = res.parent.parent.parent  # ...\Application\<ver>\resources\vivaldi

    if not args.yes and not DRY:
        print()
        say("Vivaldi will be CLOSED during installation and reopened when finished.")
        try:
            input("  Press Enter to begin, or Ctrl+C to cancel... ")
        except (KeyboardInterrupt, EOFError):
            print()
            fail("Cancelled.")

    close_vivaldi()

    staging_ctx = MacOSStagingContext(res)
    with staging_ctx as target_res:
        step1_atlas_files(masters, target_res)
        step2_window_html(target_res)
        step3_detractless(detract, target_res, args.skip_detractless)
        css_dst = step4_css_mods(payload)
        step5_context_menus(target_res)
        step6_preferences(payload, css_dst)
        step7_harper_extension(payload)
        step8_disable_autoupdates(app_root)
        step9_macos_codesign(target_res)
        staging_ctx.finalize()

    print()
    say("Done." + ("  (dry run - nothing was changed)" if DRY else ""))

    if not args.no_launch and not DRY:
        if sys.platform == "darwin":
            app_candidates = [
                Path("/Applications/Vivaldi.app"),
                Path.home() / "Applications" / "Vivaldi.app",
            ]
            app_path = next((p for p in app_candidates if p.is_dir()), None)
            if app_path:
                subprocess.Popen(["open", "-a", str(app_path)])
                say("Vivaldi relaunched.")
        else:
            exe = app_root / "vivaldi.exe"
            if exe.is_file():
                flags = getattr(subprocess, "DETACHED_PROCESS", 0) if sys.platform == "win32" else 0
                subprocess.Popen([str(exe)], creationflags=flags)
                say("Vivaldi relaunched.")
    print()


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception as e:  # noqa: BLE001 - top-level guard, show the real error
        fail(f"{type(e).__name__}: {e}")
