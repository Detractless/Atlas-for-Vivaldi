"""install.py / installer package safety tests. Everything runs in temp folders;
Vivaldi is never touched.

Run: python3 -m unittest tests/unit/test_install.py
"""

import io
import json
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[2]
PAYLOAD = ROOT / "payload"
sys.path.insert(0, str(ROOT))

from installer import util, files, preferences, system  # noqa: E402


def old_installer():
    """install.py as it was before the cleanup (commit bd80dd9), as a module."""
    source = subprocess.run(["git", "show", "bd80dd9:install.py"], cwd=ROOT,
                            capture_output=True, text=True, check=True).stdout
    mod = type(sys)("atlas_install_old")
    exec(compile(source, "<old install.py>", "exec"), mod.__dict__)
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
        util.DRY = False
        self.quiet = redirect_stdout(io.StringIO())
        self.quiet.__enter__()

    def tearDown(self):
        self.quiet.__exit__(None, None, None)
        shutil.rmtree(self.tmp, ignore_errors=True)

    def run_step6(self, module, prefs_file):
        with mock.patch.object(module, "get_prefs_file", return_value=prefs_file):
            module.step6_preferences(PAYLOAD, self.tmp / "css-mods")

    def test_copy_tree_skips_keys_maps_and_finder_files(self):
        src, dst = self.tmp / "src", self.tmp / "dst"
        src.mkdir()
        for n in ("keep.js", "x.pem", ".DS_Store", "keep.js.map"):
            (src / n).write_text("x")
        util.copy_tree(src, dst)
        self.assertEqual(sorted(p.name for p in dst.iterdir()), ["keep.js"])

    def test_detractless_installs_only_loaded_files(self):
        res = self.tmp / "res"
        res.mkdir()
        files.step3_detractless(PAYLOAD / "detractless", res, skip=False)
        installed = {str(p.relative_to(res)) for p in res.rglob("*") if p.is_file()}
        for rel in files.DETRACTLESS_FILES:
            self.assertIn(rel, installed)
        self.assertFalse([p for p in installed if p.endswith((".map", ".pem"))])
        for source_only in ("src/pages/newtab/newtab.js", "src/settings/registry.js",
                            "src/pages/gate/gate.js", "src/constants/atlasKeys.json"):
            self.assertNotIn(source_only, installed)

    def test_every_page_reference_is_installed(self):
        """Each src/href in index.html and gate.html points at an installed file."""
        res = self.tmp / "res"
        res.mkdir()
        files.step3_detractless(PAYLOAD / "detractless", res, skip=False)
        for page in ("index.html", "gate.html"):
            html = (PAYLOAD / "detractless" / page).read_text(encoding="utf-8")
            for ref in re.findall(r'(?:src|href)="([^"#:]+)"', html):
                self.assertTrue((res / ref).is_file(), f"{page} loads {ref}, not installed")

    def test_unreadable_preferences_stop_the_install_and_stay_untouched(self):
        prefs_file = self.tmp / "Preferences"
        prefs_file.write_text('{"vivaldi": {broken')
        with self.assertRaises(SystemExit):
            self.run_step6(preferences, prefs_file)
        self.assertEqual(prefs_file.read_text(), '{"vivaldi": {broken')
        self.assertEqual(list(self.tmp.glob("Preferences.atlas-bak*")), [])

    def test_preferences_are_backed_up_before_writing(self):
        prefs_file = self.tmp / "Preferences"
        prefs_file.write_text(json.dumps(SAMPLE_PREFS))
        self.run_step6(preferences, prefs_file)
        self.assertTrue((self.tmp / "Preferences.atlas-bak").is_file())
        dated = list(self.tmp.glob("Preferences.atlas-bak-*"))
        self.assertEqual(len(dated), 1)
        self.assertEqual(json.loads(dated[0].read_text()), SAMPLE_PREFS)

    def test_step6_writes_what_the_original_installer_wrote(self):
        """Splitting the installer must not change a single Preferences value."""
        old = old_installer()
        cases = [SAMPLE_PREFS, {}, {"vivaldi": {"toolbars": {"navigation": ["AddressField"]}}}]
        for i, prefs in enumerate(cases):
            a, b = self.tmp / f"old{i}", self.tmp / f"new{i}"
            a.mkdir()
            b.mkdir()
            (a / "Preferences").write_text(json.dumps(prefs))
            (b / "Preferences").write_text(json.dumps(prefs))
            self.run_step6(old, a / "Preferences")
            self.run_step6(preferences, b / "Preferences")
            self.assertEqual(json.loads((b / "Preferences").read_text()),
                             json.loads((a / "Preferences").read_text()), f"case {i}")

    def test_failed_codesign_stops_the_install(self):
        app = self.tmp / "Vivaldi.app" / "Contents" / "res"
        app.mkdir(parents=True)
        failed = subprocess.CompletedProcess([], 1, "", "boom")
        with mock.patch.object(system.sys, "platform", "darwin"), \
                mock.patch.object(system.subprocess, "run", return_value=failed):
            with self.assertRaises(SystemExit):
                system.step9_macos_codesign(app)

    def test_dry_run_changes_nothing(self):
        out = subprocess.run([sys.executable, "install.py", "--dry-run", "--no-launch"], cwd=ROOT,
                             capture_output=True, text=True)
        self.assertEqual(out.returncode, 0, out.stdout + out.stderr)
        self.assertIn("Done.  (dry run - nothing was changed)", out.stdout)

    def test_dmg_app_holds_a_working_installer(self):
        """The app build_dmg.py assembles can dry-run on its own (no repo around it)."""
        sys.path.insert(0, str(ROOT / "scripts"))
        import build_dmg
        app = build_dmg.build_app(self.tmp, self.tmp / "no.icns")
        res = app / "Contents" / "Resources"
        self.assertEqual(sorted(p.name for p in res.iterdir()), ["install.py", "installer", "payload"])
        self.assertEqual([p for p in res.rglob("*") if p.suffix in (".pem", ".map") or p.name == "__pycache__"], [])
        out = subprocess.run([sys.executable, str(res / "install.py"), "--dry-run", "--no-launch"],
                             capture_output=True, text=True)
        self.assertEqual(out.returncode, 0, out.stdout + out.stderr)
        self.assertIn("Done.  (dry run - nothing was changed)", out.stdout)


if __name__ == "__main__":
    unittest.main()
