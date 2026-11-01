"""The installer adds the Downloads sidebar as a web panel and silences Vivaldi's own."""
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from installer import preferences


class DownloadsPanelPrefsTest(unittest.TestCase):
    def test_adds_the_panel_its_button_and_turns_the_vivaldi_one_off(self):
        v = {}
        preferences._prefs_downloads_panel(v)
        els = v["panels"]["web"]["elements"]
        self.assertEqual([e["id"] for e in els], ["WEBPANEL_atlas_downloads"])
        self.assertTrue(els[0]["url"].endswith("/components/atlas/downloads-panel.html"))
        self.assertTrue(els[0]["url"].startswith("chrome-extension://"))
        self.assertEqual(v["toolbars"]["panel"], ["WEBPANEL_atlas_downloads"])
        self.assertIs(v["downloads"]["open_panel_on_new"], False)

    def test_running_twice_changes_nothing_and_keeps_the_users_panels(self):
        mine = {"id": "EXT_PANEL_x", "url": "chrome-extension://x/p.html"}
        v = {"panels": {"web": {"elements": [mine]}}, "toolbars": {"panel": ["EXT_PANEL_x"]}}
        preferences._prefs_downloads_panel(v)
        once = repr(v)
        preferences._prefs_downloads_panel(v)
        self.assertEqual(once, repr(v))
        self.assertEqual([e["id"] for e in v["panels"]["web"]["elements"]], ["EXT_PANEL_x", "WEBPANEL_atlas_downloads"])
        self.assertEqual(v["toolbars"]["panel"], ["EXT_PANEL_x", "WEBPANEL_atlas_downloads"])

    def test_a_stale_address_is_corrected(self):
        v = {"panels": {"web": {"elements": [{"id": "WEBPANEL_atlas_downloads", "url": "chrome://downloads/"}]}}}
        preferences._prefs_downloads_panel(v)
        self.assertTrue(v["panels"]["web"]["elements"][0]["url"].endswith("downloads-panel.html"))


if __name__ == "__main__":
    unittest.main()
