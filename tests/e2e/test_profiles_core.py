"""Runs the Node unit tests for profilesCore.js (profiles, share toggles, backup)."""
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


class TestProfilesCore(unittest.TestCase):
    @unittest.skipUnless(shutil.which("node"), "node is required")
    def test_profiles_core_node_suite(self):
        r = subprocess.run(
            ["node", "--test", str(ROOT / "tests" / "unit" / "profiles_core.test.js")],
            capture_output=True, text=True, timeout=120,
        )
        self.assertEqual(r.returncode, 0, r.stdout[-2000:] + r.stderr[-2000:])


if __name__ == "__main__":
    unittest.main()
