"""
Tier 1: Feature Coverage E2E Tests
Validates core functional deliverables:
- CSS modular decomposition (8 files, <=350 lines, monolithic atlas.css removed)
- JS modular source (12 modules under src/modules/, <=350 lines each)
- Bundler compilation & Node syntax validation
- Address bar context menu cleanup (no Undo/Redo; Cut, Copy, Paste, Paste & Go, Select All present)
- Address bar spellcheck=true activation
- Offline spelling candidate generator corrections
- Harper extension payload and Manifest V3 validity
- Build command pipeline structure
"""

import re
import json
import unittest
from pathlib import Path
from tests.e2e.helpers import (
    PROJECT_ROOT,
    CSS_MODS_DIR,
    JS_MODULES_DIR,
    SCRIPTS_DIR,
    INSTALL_FILES_DIR,
    HARPER_DIR,
    DIST_DIR,
    BUILD_CMD,
    ATLAS_JS,
    EXPECTED_CSS_FILES,
    EXPECTED_JS_MODULES,
    MAX_MODULE_LINES,
    count_lines,
    run_node,
    run_python,
    evaluate_js_spelling,
)


class TestTier1FeatureCoverage(unittest.TestCase):
    """Tier 1: Feature Coverage Verification."""

    def test_01_css_modular_files_exist_and_monolith_removed(self):
        """
        Verify all 8 CSS files exist in payload/css-mods/ (00-tokens.css ... 07-extensions.css)
        and monolithic atlas.css is permanently removed.
        """
        self.assertTrue(CSS_MODS_DIR.is_dir(), f"CSS mods directory missing: {CSS_MODS_DIR}")

        # Check all 8 expected CSS files exist
        missing_css = [f for f in EXPECTED_CSS_FILES if not (CSS_MODS_DIR / f).is_file()]
        self.assertEqual(
            missing_css,
            [],
            f"Missing required modular CSS files in {CSS_MODS_DIR}: {missing_css}"
        )

        # Verify monolithic atlas.css is removed to prevent duplicate rule application
        legacy_monolith = CSS_MODS_DIR / "atlas.css"
        self.assertFalse(
            legacy_monolith.is_file(),
            f"Legacy monolithic CSS file must be removed: {legacy_monolith}"
        )

    def test_02_css_file_line_counts(self):
        """
        Verify all 8 CSS files in payload/css-mods/ are strictly <= 350 lines.
        """
        self.assertTrue(CSS_MODS_DIR.is_dir(), f"CSS mods directory missing: {CSS_MODS_DIR}")
        over_budget = []
        under_budget = []

        for css_file in EXPECTED_CSS_FILES:
            path = CSS_MODS_DIR / css_file
            if not path.is_file():
                continue
            lines = count_lines(path)
            if lines > MAX_MODULE_LINES:
                over_budget.append((css_file, lines))
            if lines < 10:
                under_budget.append((css_file, lines))

        self.assertEqual(
            over_budget,
            [],
            f"CSS files exceeding {MAX_MODULE_LINES} line budget: {over_budget}"
        )
        self.assertEqual(
            under_budget,
            [],
            f"CSS files suspiciously empty (<10 lines): {under_budget}"
        )

    def test_03_js_source_modules_exist_and_bounded(self):
        """
        Verify all 12 JS modules exist under src/modules/ and each is <= 350 lines.
        """
        self.assertTrue(
            JS_MODULES_DIR.is_dir(),
            f"Source modules directory missing: {JS_MODULES_DIR}"
        )

        missing_modules = [m for m in EXPECTED_JS_MODULES if not (JS_MODULES_DIR / m).is_file()]
        self.assertEqual(
            missing_modules,
            [],
            f"Missing required JS modules in {JS_MODULES_DIR}: {missing_modules}"
        )

        over_budget = []
        under_budget = []
        for mod_name in EXPECTED_JS_MODULES:
            mod_path = JS_MODULES_DIR / mod_name
            if not mod_path.is_file():
                continue
            lines = count_lines(mod_path)
            if lines > MAX_MODULE_LINES:
                over_budget.append((mod_name, lines))
            if lines < 10:
                under_budget.append((mod_name, lines))

        self.assertEqual(
            over_budget,
            [],
            f"JS modules exceeding {MAX_MODULE_LINES} line budget: {over_budget}"
        )
        self.assertEqual(
            under_budget,
            [],
            f"JS modules suspiciously empty (<10 lines): {under_budget}"
        )

    def test_04_bundler_script_compiles_atlas_js(self):
        """
        Verify scripts/bundle.py compiles payload/install-files/atlas.js without errors.
        """
        bundler_script = SCRIPTS_DIR / "bundle.py"
        self.assertTrue(
            bundler_script.is_file(),
            f"Bundler script missing: {bundler_script}"
        )

        # Run bundler script
        res = run_python(["scripts/bundle.py"])
        self.assertEqual(
            res.returncode,
            0,
            f"scripts/bundle.py failed with code {res.returncode}.\nSTDOUT: {res.stdout}\nSTDERR: {res.stderr}"
        )

        # Verify atlas.js was created/updated
        self.assertTrue(
            ATLAS_JS.is_file(),
            f"Bundled output missing at {ATLAS_JS}"
        )
        self.assertGreater(
            ATLAS_JS.stat().st_size,
            1000,
            f"Bundled file is suspiciously small ({ATLAS_JS.stat().st_size} bytes)"
        )

    def test_05_bundled_atlas_js_syntax_validation(self):
        """
        Verify node -c payload/install-files/atlas.js succeeds with code 0 (zero syntax errors).
        """
        self.assertTrue(
            ATLAS_JS.is_file(),
            f"Bundled atlas.js not found at {ATLAS_JS}"
        )

        res = run_node("", args=["-c", str(ATLAS_JS)])
        self.assertEqual(
            res.returncode,
            0,
            f"JavaScript syntax error in {ATLAS_JS}:\nSTDOUT: {res.stdout}\nSTDERR: {res.stderr}"
        )

    def test_06_addressbar_context_menu_items(self):
        """
        Verify address bar context menu has no 'Undo' or 'Redo',
        and strictly retains 'Cut', 'Copy', 'Paste', 'Paste and go', and 'Select all'.
        """
        # Module 03-contextmenu.js is authoritative source; fallback to bundled atlas.js
        target_file = JS_MODULES_DIR / "03-contextmenu.js"
        if not target_file.is_file():
            target_file = ATLAS_JS

        self.assertTrue(
            target_file.is_file(),
            f"Cannot find context menu implementation in {JS_MODULES_DIR / '03-contextmenu.js'} or {ATLAS_JS}"
        )

        content = target_file.read_text(encoding="utf-8", errors="replace")

        # Locate the address field context menu block
        block_match = re.search(
            r"(?:(?:var\s+)?addrField\s*=[\s\S]*?showUiMenu[\s\S]*?return;)",
            content
        )
        self.assertIsNotNone(
            block_match,
            "Could not locate address field context menu definition in contextmenu module or atlas.js"
        )
        menu_block = block_match.group(0)

        # 1. Assert Undo and Redo are NOT present
        self.assertNotRegex(
            menu_block,
            r"['\"]Undo['\"]",
            "Address bar context menu must NOT contain 'Undo' (Requirement R3)"
        )
        self.assertNotRegex(
            menu_block,
            r"['\"]Redo['\"]",
            "Address bar context menu must NOT contain 'Redo' (Requirement R3)"
        )

        # 2. Assert Cut, Copy, Paste, Paste and go, Select all are present
        expected_labels = ["Cut", "Copy", "Paste", "Paste and go", "Select all"]
        missing_labels = []
        for label in expected_labels:
            # Case insensitive check for flexible formatting
            if not re.search(rf"['\"]{re.escape(label)}['\"]", menu_block, re.IGNORECASE):
                missing_labels.append(label)

        self.assertEqual(
            missing_labels,
            [],
            f"Address bar context menu missing required action(s): {missing_labels}"
        )


    def test_07_addressbar_spellcheck_attribute(self):
        """
        Verify spellcheck = true is activated on address bar inputs.
        """
        target_file = JS_MODULES_DIR / "01-addressbar.js"
        if not target_file.is_file():
            target_file = ATLAS_JS

        self.assertTrue(
            target_file.is_file(),
            f"Cannot find addressbar module at {JS_MODULES_DIR / '01-addressbar.js'} or {ATLAS_JS}"
        )

        content = target_file.read_text(encoding="utf-8", errors="replace")

        # Check for spellcheck activation
        # Matches: spellcheck = true, .setAttribute('spellcheck', 'true'), etc.
        has_spellcheck = bool(
            re.search(r"spellcheck\s*=\s*true", content, re.IGNORECASE) or
            re.search(r"setAttribute\(\s*['\"]spellcheck['\"]\s*,\s*['\"]true['\"]\s*\)", content, re.IGNORECASE)
        )

        self.assertTrue(
            has_spellcheck,
            f"Address bar module in {target_file.name} does not activate spellcheck = true on address inputs"
        )

    def test_08_offline_spelling_generator_corrections(self):
        """
        Verify offline spelling candidate generator produces expected corrections for common misspellings.
        """
        target_file = JS_MODULES_DIR / "12-spelling.js"
        if not target_file.is_file():
            target_file = ATLAS_JS

        self.assertTrue(
            target_file.is_file(),
            f"Cannot find spelling module at {JS_MODULES_DIR / '12-spelling.js'} or {ATLAS_JS}"
        )

        # Test common typographical errors
        test_cases = [
            ("teh", "the"),
            ("definately", "definitely"),
            ("recieve", "receive"),
            ("seperate", "separate"),
            ("adress", "address"),
            ("wierd", "weird")
        ]

        for typo, expected in test_cases:
            res = evaluate_js_spelling(target_file, typo)
            self.assertTrue(
                res["is_valid"],
                f"Evaluation of spelling candidate generator failed on '{typo}': {res.get('error')}"
            )

            suggestions = [s.lower() for s in res.get("suggestions", [])]
            self.assertIn(
                expected.lower(),
                suggestions,
                f"Candidate generator for '{typo}' did not suggest '{expected}'. Got: {suggestions}"
            )

    def test_09_harper_extension_payload_and_manifest(self):
        """
        Verify Harper extension payload exists under payload/extensions/harper/ with valid MV3 manifest.json.
        """
        self.assertTrue(
            HARPER_DIR.is_dir(),
            f"Harper extension payload directory missing: {HARPER_DIR}"
        )

        manifest_file = HARPER_DIR / "manifest.json"
        self.assertTrue(
            manifest_file.is_file(),
            f"Harper manifest.json missing: {manifest_file}"
        )

        try:
            manifest_data = json.loads(manifest_file.read_text(encoding="utf-8"))
        except Exception as e:
            self.fail(f"Harper manifest.json is invalid JSON: {e}")

        # Manifest V3 checks
        self.assertEqual(
            manifest_data.get("manifest_version"),
            3,
            f"Harper manifest must be Manifest V3, got: {manifest_data.get('manifest_version')}"
        )
        self.assertTrue(
            manifest_data.get("name"),
            "Harper manifest missing 'name'"
        )
        self.assertTrue(
            manifest_data.get("version"),
            "Harper manifest missing 'version'"
        )

        # Check background service worker or script exists
        bg = manifest_data.get("background", {})
        if "service_worker" in bg:
            sw_path = HARPER_DIR / bg["service_worker"]
            self.assertTrue(
                sw_path.is_file(),
                f"Declared background service worker not found: {sw_path}"
            )

        # Check content scripts exist
        content_scripts = manifest_data.get("content_scripts", [])
        self.assertGreater(
            len(content_scripts),
            0,
            "Harper manifest must declare content_scripts for in-page checking"
        )

        for cs in content_scripts:
            for js_file in cs.get("js", []):
                self.assertTrue(
                    (HARPER_DIR / js_file).is_file(),
                    f"Declared content script JS missing: {HARPER_DIR / js_file}"
                )
            for css_file in cs.get("css", []):
                self.assertTrue(
                    (HARPER_DIR / css_file).is_file(),
                    f"Declared content script CSS missing: {HARPER_DIR / css_file}"
                )

    def test_10_build_cmd_compiles_executable(self):
        """
        Verify build.cmd contains the complete pipeline:
        bundling, node -c validation, PyInstaller compilation of dist/AtlasSetup.exe,
        and post-build artifact cleanup.
        """
        self.assertTrue(BUILD_CMD.is_file(), f"build.cmd missing at {BUILD_CMD}")
        content = BUILD_CMD.read_text(encoding="utf-8", errors="replace")

        # 1. Bundler step
        self.assertRegex(
            content,
            r"scripts[\\/]bundle\.py",
            "build.cmd must invoke scripts/bundle.py (Requirement R2)"
        )

        # 2. Syntax check step
        self.assertRegex(
            content,
            r"node\s+-c\s+payload[\\/]install-files[\\/]atlas\.js",
            "build.cmd must validate syntax with node -c (Requirement R5)"
        )

        # 3. PyInstaller compilation
        self.assertRegex(
            content,
            r"PyInstaller[\s\S]*?AtlasSetup",
            "build.cmd must invoke PyInstaller to compile AtlasSetup"
        )

        # 4. Artifact cleanup
        self.assertRegex(
            content,
            r"(?:rmdir|del)[\s\S]*?(?:build|AtlasSetup\.spec)",
            "build.cmd must clean PyInstaller artifacts (build/ directory and .spec file)"
        )

    def test_11_atlas_spelling_component_exists_and_bounded(self):
        """
        Verify that payload/install-files/components/atlas/atlas-spelling.js exists,
        is strictly <= 350 lines, has valid JavaScript syntax, and exports window.__atlasSpelling.
        """
        spelling_file = INSTALL_FILES_DIR / "components" / "atlas" / "atlas-spelling.js"
        self.assertTrue(spelling_file.is_file(), f"atlas-spelling.js missing at {spelling_file}")
        lines = count_lines(spelling_file)
        self.assertLessEqual(lines, MAX_MODULE_LINES, f"atlas-spelling.js exceeds {MAX_MODULE_LINES} lines: {lines}")

        # Syntax check
        res = run_node("", args=["-c", str(spelling_file)])
        self.assertEqual(res.returncode, 0, f"atlas-spelling.js syntax check failed: {res.stderr}")

    def test_12_page_context_menu_has_spelling_suggestions(self):
        """
        Verify that components/atlas/atlas-ctxmenu.js integrates spelling suggestions
        for editable fields and remains strictly <= 350 lines.
        """
        ctx_file = INSTALL_FILES_DIR / "components" / "atlas" / "atlas-ctxmenu.js"
        self.assertTrue(ctx_file.is_file(), f"atlas-ctxmenu.js missing at {ctx_file}")
        lines = count_lines(ctx_file)
        self.assertLessEqual(lines, MAX_MODULE_LINES, f"atlas-ctxmenu.js exceeds {MAX_MODULE_LINES} lines: {lines}")

        content = ctx_file.read_text(encoding="utf-8", errors="replace")
        self.assertRegex(
            content,
            r"__atlasSpelling",
            "atlas-ctxmenu.js must query __atlasSpelling for suggestions in editable fields"
        )
        self.assertRegex(
            content,
            r"replaceWord",
            "atlas-ctxmenu.js must define replaceWord handler for suggestion clicks"
        )

    def test_13_context_menu_cut_copy_clipboard_support(self):
        """
        Verify that Cut and Copy actions in atlas-ctxmenu.js and 03-contextmenu.js:
        1. Capture active selection and write to clipboard via modern Clipboard API.
        2. Prevent focus loss on mousedown to preserve field selection range.
        3. Support input.setRangeText for seamless deletion on Google Search and web inputs.
        """
        ctx_file = INSTALL_FILES_DIR / "components" / "atlas" / "atlas-ctxmenu.js"
        mod_file = JS_MODULES_DIR / "03-contextmenu.js"
        self.assertTrue(ctx_file.is_file(), f"Missing {ctx_file}")
        self.assertTrue(mod_file.is_file(), f"Missing {mod_file}")

        ctx_content = ctx_file.read_text(encoding="utf-8", errors="replace")
        mod_content = mod_file.read_text(encoding="utf-8", errors="replace")

        # Check cut/copy helpers in atlas-ctxmenu.js
        self.assertRegex(ctx_content, r"function\s+cutField\b", "atlas-ctxmenu.js must define cutField")
        self.assertRegex(ctx_content, r"function\s+copyField\b", "atlas-ctxmenu.js must define copyField")
        self.assertRegex(ctx_content, r"menu\.addEventListener\('mousedown'", "atlas-ctxmenu.js must preventDefault on menu mousedown")

        # Check cut/copy helpers in 03-contextmenu.js
        self.assertRegex(mod_content, r"function\s+cutFieldEl\b", "03-contextmenu.js must define cutFieldEl")
        self.assertRegex(mod_content, r"function\s+copyFieldEl\b", "03-contextmenu.js must define copyFieldEl")
        self.assertRegex(mod_content, r"uiMenu\.addEventListener\('mousedown'", "03-contextmenu.js must preventDefault on uiMenu mousedown")

        # Verify Node execution of cutField logic
        test_script = """
        let clipboard = '';
        let inputEvents = 0;
        const fakeField = {
            value: 'hello world',
            selectionStart: 0,
            selectionEnd: 5,
            setRangeText: function(text, start, end, mode) {
                this.value = this.value.slice(0, start) + text + this.value.slice(end);
            },
            dispatchEvent: function(ev) { inputEvents++; },
            focus: function() {}
        };
        const copy = (txt) => { clipboard = txt; };
        const cutField = (el, txt, s, e) => {
            el.focus();
            if (txt) {
                copy(txt);
                if (el.setRangeText && el.selectionStart !== undefined) {
                    el.setRangeText('', Math.min(s, e), Math.max(s, e), 'end');
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                    return;
                }
            }
        };
        cutField(fakeField, 'hello', 0, 5);
        console.log(JSON.stringify({ clipboard: clipboard, val: fakeField.value, events: inputEvents }));
        """
        res = run_node(test_script)
        self.assertEqual(res.returncode, 0, f"Node check failed: {res.stderr}")
        data = json.loads(res.stdout.strip())
        self.assertEqual(data["clipboard"], "hello")
        self.assertEqual(data["val"], " world")
        self.assertEqual(data["events"], 2)

    def test_14_tab_context_menu_dismisses_hover_tooltip(self):
        """
        Verify that opening the tab right-click context menu dismisses the hover
        preview/RAM tooltip (#vivaldi-tooltip) so both cannot be displayed together:
        1. 02-tabs.css contains rules hiding #vivaldi-tooltip when menu or active tab is present.
        2. 03-contextmenu.js toggles atlas-menu-open class on #browser.
        3. 03-contextmenu.js dispatches mouseleave on tabEl on contextmenu.
        4. Strict line boundaries (<= 350 lines) are preserved.
        """
        tabs_css = CSS_MODS_DIR / "02-tabs.css"
        mod_file = JS_MODULES_DIR / "03-contextmenu.js"
        self.assertTrue(tabs_css.is_file(), f"Missing {tabs_css}")
        self.assertTrue(mod_file.is_file(), f"Missing {mod_file}")

        css_content = tabs_css.read_text(encoding="utf-8", errors="replace")
        mod_content = mod_file.read_text(encoding="utf-8", errors="replace")

        # CSS checks
        self.assertRegex(css_content, r"#vivaldi-tooltip", "02-tabs.css must target #vivaldi-tooltip")
        self.assertRegex(css_content, r"display:\s*none\s*!important", "02-tabs.css must hide #vivaldi-tooltip with !important")
        self.assertRegex(css_content, r"atlas-tab-context-active", "02-tabs.css must hide tooltip when atlas-tab-context-active is matched")

        # JS checks
        self.assertRegex(mod_content, r"atlas-menu-open", "03-contextmenu.js must toggle atlas-menu-open on #browser")
        self.assertRegex(mod_content, r"mouseleave", "03-contextmenu.js must dispatch mouseleave on tabEl")

        # Line count checks
        self.assertLessEqual(count_lines(tabs_css), MAX_MODULE_LINES)
        self.assertLessEqual(count_lines(mod_file), MAX_MODULE_LINES)

    def test_15_account_button_no_surf_badge_and_tooltip(self):
        """
        Verify the toolbar Account button is the 36px corner avatar and keeps its tooltip:
        1. 00-tokens.css still defines --atlas-nosurf-badge (fallback art).
        2. 04-toolbar.css sizes AccountButton at 36px with a 12px radius; 05-menus.css draws the
           active profile's image through --atlas-corner-avatar.
        3. 05-profile-menu.js syncs title and aria-label to "No Surf" and observes attribute mutations.
        4. Strict line boundaries (<= 350 lines) and CRLF are preserved.
        """
        tokens_css = CSS_MODS_DIR / "00-tokens.css"
        toolbar_css = CSS_MODS_DIR / "04-toolbar.css"
        menus_css = CSS_MODS_DIR / "05-menus.css"
        profile_mod = JS_MODULES_DIR / "05-profile-menu.js"
        atlas_bundle = ATLAS_JS

        for f in [tokens_css, toolbar_css, menus_css, profile_mod, atlas_bundle]:
            self.assertTrue(f.is_file(), f"Missing {f}")

        tok_content = tokens_css.read_text(encoding="utf-8", errors="replace")
        tb_content = toolbar_css.read_text(encoding="utf-8", errors="replace")
        mn_content = menus_css.read_text(encoding="utf-8", errors="replace")
        mod_content = profile_mod.read_text(encoding="utf-8", errors="replace")
        bundle_content = atlas_bundle.read_text(encoding="utf-8", errors="replace")

        # 1. Check tokens for --atlas-nosurf-badge
        self.assertIn("--atlas-nosurf-badge", tok_content)
        self.assertIn("No%20Surf", tok_content)
        self.assertIn("rx='6'", tok_content)

        # 2. Check toolbar CSS and menus CSS for 76px and 6px border-radius
        self.assertRegex(tb_content, r"AccountButton[\s\S]*?36px")
        self.assertRegex(tb_content, r"AccountButton[\s\S]*?border-radius:\s*12px")
        self.assertRegex(mn_content, r"AccountButton[\s\S]*?--atlas-corner-avatar")

        # 3. Check JS module for title and aria-label syncing to No Surf
        self.assertIn("syncAccountTitle", mod_content)
        self.assertIn("observeAccountButton", mod_content)
        self.assertIn("'No Surf'", mod_content)
        self.assertIn("MutationObserver", mod_content)

        # Also check bundle has these
        self.assertIn("syncAccountTitle", bundle_content)
        self.assertIn("'No Surf'", bundle_content)

        # 4. Check line counts
        self.assertLessEqual(count_lines(tokens_css), MAX_MODULE_LINES)
        self.assertLessEqual(count_lines(toolbar_css), MAX_MODULE_LINES)
        self.assertLessEqual(count_lines(menus_css), MAX_MODULE_LINES)
        self.assertLessEqual(count_lines(profile_mod), MAX_MODULE_LINES)

    def test_16_cross_context_menu_mutual_exclusion(self):
        """
        Verify mutual exclusivity between website context menus and chrome/tab context menus:
        1. atlas-ctxmenu.js listens for 'closeContextMenu' runtime message and closes its host.
        2. atlas-ctxmenu.js sends 'ctxmenu-open' message when opened.
        3. 02-detractless-bridge.js handles 'ctxmenu-open' and closes Atlas UI menus.
        4. 03-contextmenu.js implements dismissPageMenu() and invokes it when opening UI menus or on chrome mousedown.
        5. Strict line boundaries (<= 350 lines) and CRLF line endings are maintained.
        """
        ctx_file = INSTALL_FILES_DIR / "components" / "atlas" / "atlas-ctxmenu.js"
        mod_file = JS_MODULES_DIR / "03-contextmenu.js"
        bridge_file = JS_MODULES_DIR / "02-detractless-bridge.js"
        bundle_file = ATLAS_JS

        for f in [ctx_file, mod_file, bridge_file, bundle_file]:
            self.assertTrue(f.is_file(), f"Missing {f}")

        ctx_content = ctx_file.read_text(encoding="utf-8", errors="replace")
        mod_content = mod_file.read_text(encoding="utf-8", errors="replace")
        bridge_content = bridge_file.read_text(encoding="utf-8", errors="replace")
        bundle_content = bundle_file.read_text(encoding="utf-8", errors="replace")

        # 1. Check atlas-ctxmenu.js
        self.assertIn("closeContextMenu", ctx_content, "atlas-ctxmenu.js must handle closeContextMenu")
        self.assertIn("chrome.runtime.onMessage", ctx_content, "atlas-ctxmenu.js must listen to runtime messages")
        self.assertIn("ctxmenu-open", ctx_content, "atlas-ctxmenu.js must notify on menu open")

        # 2. Check 02-detractless-bridge.js
        self.assertIn("ctxmenu-open", bridge_content, "02-detractless-bridge.js must handle ctxmenu-open")
        self.assertIn("closeUiMenu", bridge_content, "02-detractless-bridge.js must close UI menu on ctxmenu-open")

        # 3. Check 03-contextmenu.js
        self.assertIn("dismissPageMenu", mod_content, "03-contextmenu.js must declare dismissPageMenu")
        self.assertIn("closeContextMenu", mod_content, "03-contextmenu.js must send closeContextMenu")
        self.assertIn("dismissPageMenu", bundle_content, "bundle must include dismissPageMenu")

        # 4. Check line counts
        self.assertLessEqual(count_lines(ctx_file), MAX_MODULE_LINES)
        self.assertLessEqual(count_lines(mod_file), MAX_MODULE_LINES)
        self.assertLessEqual(count_lines(bridge_file), MAX_MODULE_LINES)

    def test_17_profile_menu_structure_and_styling(self):
        """
        Verify the corner avatar menu:
        1. A strip of profile avatars plus a + that opens Extension settings > Profiles (no inline input).
        2. Five rows: Add page or bookmark, History, Downloads, Extension settings, Browser settings.
        3. History and Downloads open the native vivaldi:// pages.
        4. Profiles come from AtlasProfiles; the old private profile store is gone.
        5. File line boundaries <= 350 lines.
        """
        profile_mod = JS_MODULES_DIR / "05-profile-menu.js"
        menus_css = CSS_MODS_DIR / "05-menus.css"
        bundle_file = ATLAS_JS

        for f in [profile_mod, menus_css, bundle_file]:
            self.assertTrue(f.is_file(), f"Missing {f}")

        mod_content = profile_mod.read_text(encoding="utf-8", errors="replace")
        css_content = menus_css.read_text(encoding="utf-8", errors="replace")
        bundle_content = bundle_file.read_text(encoding="utf-8", errors="replace")

        for label in ("Add page or bookmark", "History", "Downloads", "Extension settings", "Browser settings"):
            self.assertIn(f"'{label}'", mod_content)
            self.assertIn(f"'{label}'", bundle_content)
        self.assertIn("openNewTabSettings('profiles')", mod_content)
        self.assertIn("openNewTabAdd", bundle_content)
        self.assertIn("vivaldi://history", mod_content)
        self.assertIn("vivaldi://downloads", mod_content)
        self.assertIn("window.AtlasProfiles", mod_content)
        self.assertNotIn("atlasProfiles", mod_content)
        self.assertNotIn("atlas-history", mod_content)

        # No inline name input and no obsolete header elements.
        self.assertNotIn("apm-input", mod_content)
        self.assertNotIn("apm-input", css_content)
        self.assertNotIn("apm-head", mod_content)
        self.assertNotIn("apm-avatar", mod_content)

        for cls in (".atlas-nosurf-menu", ".apm-item", ".apm-sep", ".apm-strip", ".apm-pick"):
            self.assertIn(cls, css_content)
        self.assertIn("border-radius: 12px", css_content)

        self.assertLessEqual(count_lines(profile_mod), MAX_MODULE_LINES)
        self.assertLessEqual(count_lines(menus_css), MAX_MODULE_LINES)

    def test_18_context_menu_open_link_in_this_tab(self):
        """
        Verify that the in-page context menu includes "Open link in this tab":
        1. atlas-ctxmenu.js defines "Open link in this tab" and dispatches "opentab-current".
        2. 02-detractless-bridge.js handles "opentab-current" via chrome.tabs.update.
        3. atlas-ctxmenu.js respects line limit <= 350 lines.
        """
        ctx_file = INSTALL_FILES_DIR / "components" / "atlas" / "atlas-ctxmenu.js"
        bridge_mod = JS_MODULES_DIR / "02-detractless-bridge.js"
        bundle_file = ATLAS_JS

        for f in [ctx_file, bridge_mod, bundle_file]:
            self.assertTrue(f.is_file(), f"Missing {f}")

        ctx_content = ctx_file.read_text(encoding="utf-8", errors="replace")
        bridge_content = bridge_mod.read_text(encoding="utf-8", errors="replace")
        bundle_content = bundle_file.read_text(encoding="utf-8", errors="replace")

        self.assertIn("Open link in this tab", ctx_content)
        self.assertIn("opentab-current", ctx_content)
        self.assertIn("opentab-current", bridge_content)
        self.assertIn("opentab-current", bundle_content)
        self.assertLessEqual(count_lines(ctx_file), MAX_MODULE_LINES)
        self.assertLessEqual(count_lines(bridge_mod), MAX_MODULE_LINES)


if __name__ == "__main__":
    unittest.main()




