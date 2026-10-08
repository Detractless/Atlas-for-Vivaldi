"""install.py safety tests. Everything runs in temp folders; Vivaldi is never touched.

Run: python3 -m unittest tests/unit/test_install.py
"""

import importlib.util
import json
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[2]
PAYLOAD = ROOT / "payload"


def load_installer(source: str = None, name: str = "atlas_install"):
    """Import install.py (or another version's source text) as a fresh module."""
    if source is None:
        spec = importlib.util.spec_from_file_location(name, ROOT / "install.py")
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        return mod
    mod = type(sys)(name)
    exec(compile(source, f"<{name}>", "exec"), mod.__dict__)
    return mod


SAMPLE_PREFS = {
    "vivaldi": {
        "toolbars": {
            "navigation": ["Reload", "Home", "AddressField", "Extensions", "Downloads"],
            "panel": ["Bookmarks", "Extensions", "WEBPANEL_atlas_sidebar"],
            "tabbar_before": ["Back", "Forward", "TabSearch"],
        },
        "panels": {"web": {"elements": [
            {"id": "WEBPANEL_atlas_sidebar", "url": "x"},
            {"id": "keep", "url": "https://example.com"},
        ]}},
        "themes": {"current": "Dark", "user": [{"id": "Mine"}]},
    },
    "browser": {"keep": True},
}


class InstallerTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.inst = load_installer()
        self.inst.say = lambda *a, **k: None

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def run_step6(self, inst, prefs_file):
        inst.say = lambda *a, **k: None
        with mock.patch.object(inst, "get_prefs_file", return_value=prefs_file):
            inst.step6_preferences(PAYLOAD, self.tmp / "css-mods")

    def test_copy_tree_skips_keys_maps_and_finder_files(self):
        src, dst = self.tmp / "src", self.tmp / "dst"
        src.mkdir()
        for n in ("keep.js", "x.pem", ".DS_Store", "keep.js.map"):
            (src / n).write_text("x")
        self.inst.copy_tree(src, dst)
        self.assertEqual(sorted(p.name for p in dst.iterdir()), ["keep.js"])

    def test_detractless_installs_only_loaded_files(self):
        res = self.tmp / "res"
        res.mkdir()
        self.inst.step3_detractless(PAYLOAD / "detractless", res, skip=False)
        installed = {str(p.relative_to(res)) for p in res.rglob("*") if p.is_file()}
        for rel in self.inst.DETRACTLESS_FILES:
            self.assertIn(rel, installed)
        self.assertFalse([p for p in installed if p.endswith((".map", ".pem"))])
        for dead in ("src/pages/newtab/settingsModal.js", "src/styles/panel.css",
                     "src/pages/gate/gate.js"):
            self.assertNotIn(dead, installed)

    def test_every_page_reference_is_installed(self):
        """Each src/href in index.html and gate.html points at an installed file."""
        res = self.tmp / "res"
        res.mkdir()
        self.inst.step3_detractless(PAYLOAD / "detractless", res, skip=False)
        for page in ("index.html", "gate.html"):
            html = (PAYLOAD / "detractless" / page).read_text(encoding="utf-8")
            for ref in re.findall(r'(?:src|href)="([^"#:]+)"', html):
                self.assertTrue((res / ref).is_file(), f"{page} loads {ref}, not installed")

    def test_unreadable_preferences_stop_the_install_and_stay_untouched(self):
        prefs_file = self.tmp / "Preferences"
        prefs_file.write_text('{"vivaldi": {broken')
        with self.assertRaises(SystemExit):
            self.run_step6(self.inst, prefs_file)
        self.assertEqual(prefs_file.read_text(), '{"vivaldi": {broken')
        self.assertEqual(list(self.tmp.glob("Preferences.atlas-bak*")), [])

    def test_preferences_are_backed_up_before_writing(self):
        prefs_file = self.tmp / "Preferences"
        prefs_file.write_text(json.dumps(SAMPLE_PREFS))
        self.run_step6(self.inst, prefs_file)
        self.assertTrue((self.tmp / "Preferences.atlas-bak").is_file())
        dated = list(self.tmp.glob("Preferences.atlas-bak-*"))
        self.assertEqual(len(dated), 1)
        self.assertEqual(json.loads(dated[0].read_text()), SAMPLE_PREFS)

    def test_split_step6_matches_the_previous_version(self):
        """The refactor must write exactly what the pre-cleanup step 6 wrote."""
        old_src = subprocess.run(
            ["git", "show", "bd80dd9:install.py"], cwd=ROOT,
            capture_output=True, text=True, check=True,
        ).stdout
        old = load_installer(old_src, "atlas_install_old")
        cases = [SAMPLE_PREFS, {}, {"vivaldi": {"toolbars": {"navigation": ["AddressField"]}}}]
        for i, prefs in enumerate(cases):
            a, b = self.tmp / f"old{i}", self.tmp / f"new{i}"
            a.mkdir()
            b.mkdir()
            (a / "Preferences").write_text(json.dumps(prefs))
            (b / "Preferences").write_text(json.dumps(prefs))
            self.run_step6(old, a / "Preferences")
            self.run_step6(self.inst, b / "Preferences")
            self.assertEqual(
                json.loads((b / "Preferences").read_text()),
                json.loads((a / "Preferences").read_text()),
                f"case {i}",
            )

    def test_failed_codesign_stops_the_install(self):
        app = self.tmp / "Vivaldi.app" / "Contents" / "res"
        app.mkdir(parents=True)
        failed = subprocess.CompletedProcess([], 1, "", "boom")
        with mock.patch.object(self.inst.sys, "platform", "darwin"), \
                mock.patch.object(self.inst.subprocess, "run", return_value=failed):
            with self.assertRaises(SystemExit):
                self.inst.step9_macos_codesign(app)


if __name__ == "__main__":
    unittest.main()
