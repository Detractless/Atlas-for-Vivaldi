"""Steps 1-4: Atlas files, window.html, the Detractless new tab, CSS mods."""

import re
import shutil
from pathlib import Path

from . import util
from .paths import get_atlas_root
from .util import _guard, copy_file, copy_tree, fail, read_text, say, write_text


COMPASS = (
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E"
    "%3Ccircle cx='12' cy='12' r='9' fill='none' stroke='%23888888' stroke-width='1.7'/%3E"
    "%3Cpath d='M15.8 8.2l-2.4 5.2-5.2 2.4 2.4-5.2z' fill='%23888888'/%3E%3C/svg%3E"
)


# What step 3 installs from payload/detractless. Only files that index.html,
# gate.html, window.html or the bundles actually load; everything else in the
# payload (old unbundled sources, sourcemaps) stays out of Vivaldi.
DETRACTLESS_DIRS = ("icons", "src/assets")


DETRACTLESS_FILES = (
    "index.html",
    "gate.html",
    "src/dist/newtab.bundle.js",
    "src/dist/newtab.bundle.css",
    "src/dist/gate.bundle.js",
    "src/dist/gate.bundle.css",
    "src/dist/serviceWorker.bundle.js",
    "src/styles/fonts.css",
    "src/pages/shared/themePreinit.js",
    "src/pages/newtab/preinit.js",
    "src/pages/newtab/profilesCore.js",
    "src/pages/newtab/profilesPage.js",
    "src/pages/newtab/profileEditPage.js",
    "src/pages/newtab/profilesPage.css",
    "src/pages/newtab/newtabBridge.js",
)


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
    for d in DETRACTLESS_DIRS:
        if (detract / d).is_dir():
            copy_tree(detract / d, res / d)
    for rel in DETRACTLESS_FILES:
        sp = detract / rel
        if not sp.is_file():
            fail(f"Payload is missing {rel} - package is incomplete.")
        copy_file(sp, (res / rel).parent)
    _remove_archived_sidebar_files(res)

    if util.DRY:
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
