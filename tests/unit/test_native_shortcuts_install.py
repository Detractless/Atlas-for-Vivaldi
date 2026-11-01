"""Native install tests use fake bundles; the parser tests never post input."""
import io
import plistlib
import shutil
import subprocess
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from installer import native_shortcuts as native, files, util


class NativeInstallTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.app = self.root / "Vivaldi.app"
        self.res = self.app / "Contents/Frameworks/Vivaldi Framework.framework/Versions/Current/Resources/vivaldi"
        self.res.mkdir(parents=True)
        self.info = self.app / "Contents/Info.plist"
        self.info.write_bytes(plistlib.dumps({"CFBundleIdentifier": "com.vivaldi.Vivaldi"}))
        self.masters = self.root / "payload"
        source = self.masters / "native/macos/AtlasShortcuts.dylib"
        source.parent.mkdir(parents=True)
        source.write_bytes(b"fixture library")
        self.platform = mock.patch.object(native.sys, "platform", "darwin")
        self.platform.start()
        self.running = mock.patch.object(native, "app_running", return_value=False)
        self.running.start()
        self.quiet = redirect_stdout(io.StringIO())
        self.quiet.__enter__()
        util.DRY = False

    def tearDown(self):
        util.DRY = False
        self.quiet.__exit__(None, None, None)
        self.running.stop()
        self.platform.stop()
        self.temp.cleanup()

    def test_loader_preserves_other_environment_and_is_idempotent(self):
        old = {"LSEnvironment": {"KEEP": "value", "DYLD_INSERT_LIBRARIES": "/other.dylib"}}
        result = native.desired_plist(old)
        self.assertEqual(old["LSEnvironment"]["DYLD_INSERT_LIBRARIES"], "/other.dylib")
        self.assertEqual(result["LSEnvironment"]["KEEP"], "value")
        self.assertEqual(result["LSEnvironment"]["DYLD_INSERT_LIBRARIES"], "/other.dylib:" + native.LOADER_ENTRY)
        self.assertEqual(native.desired_plist(result), result)

    def test_install_is_scoped_to_bundle_and_repeat_needs_no_change(self):
        native.install_native_shortcuts(self.masters, self.res)
        target = self.app / "Contents/Frameworks/AtlasShortcuts.dylib"
        self.assertEqual(target.read_bytes(), b"fixture library")
        self.assertFalse(native.native_shortcuts_needed(self.masters, self.res))
        self.assertEqual(plistlib.loads(self.info.read_bytes())["CFBundleIdentifier"], "com.vivaldi.Vivaldi")

    def test_running_app_blocks_before_writes(self):
        before = self.info.read_bytes()
        with mock.patch.object(native, "app_running", return_value=True):
            with self.assertRaises(SystemExit):
                native.preflight_native_shortcuts(self.masters, self.res)
            with self.assertRaises(SystemExit):
                native.install_native_shortcuts(self.masters, self.res)
        self.assertEqual(self.info.read_bytes(), before)
        self.assertFalse((self.app / "Contents/Frameworks/AtlasShortcuts.dylib").exists())

    def test_dry_run_writes_nothing_even_with_running_app(self):
        before = self.info.read_bytes()
        util.DRY = True
        with mock.patch.object(native, "app_running", return_value=True):
            native.preflight_native_shortcuts(self.masters, self.res)
            native.install_native_shortcuts(self.masters, self.res)
        self.assertEqual(self.info.read_bytes(), before)
        self.assertFalse((self.app / "Contents/Frameworks/AtlasShortcuts.dylib").exists())

    def test_core_bridge_runs_before_vivaldi_and_patches_only_once(self):
        page = self.res / "main.html"
        page.write_text('<script src="background-common-bundle.js"></script>')
        files.step2_core_html(self.res)
        first = page.read_bytes()
        files.step2_core_html(self.res)
        self.assertEqual(page.read_bytes(), first)
        text = first.decode()
        self.assertLess(text.index("atlas-native-menu-bridge.js"), text.index("background-common-bundle.js"))

    def test_changed_core_layout_fails_without_modifying_it(self):
        page = self.res / "main.html"
        page.write_text("<script src='unrecognized.js'></script>")
        before = page.read_bytes()
        with self.assertRaises(SystemExit):
            files.step2_core_html(self.res)
        self.assertEqual(page.read_bytes(), before)

    @unittest.skipUnless(shutil.which("clang"), "C compiler unavailable")
    def test_native_state_and_recorded_duplicate_delivery(self):
        for name in ("core_test", "duplicate_test"):
            executable = self.root / name
            subprocess.run(["clang", "-std=c11", "-Wall", "-Wextra", "-Werror",
                            "-I", str(ROOT / "src/native/macos"),
                            str(ROOT / "tests/native" / (name + ".c")), "-o", str(executable)], check=True)
            subprocess.run([str(executable)], check=True, capture_output=True)


if __name__ == "__main__":
    unittest.main()
