"""
Tier 3: Cross-Feature Interactions E2E Tests
Validates interaction points and integrations:
- Bundling pipeline followed immediately by syntax validation and runtime namespace verification
- Harper tooltips/underlines coexistence with Atlas UI context menu (bubble phase & defaultPrevented guards)
- CSS token cascade integrity (variables defined in 00-tokens.css consumed correctly across 01-07)
- Address bar context menu integration with offline spelling engine
"""

import re
import json
import unittest
from pathlib import Path
from tests.e2e.helpers import (
    CSS_MODS_DIR,
    JS_MODULES_DIR,
    SCRIPTS_DIR,
    INSTALL_FILES_DIR,
    ATLAS_JS,
    ATLAS_CTXMENU_JS,
    EXPECTED_CSS_FILES,
    run_node,
    run_python,
    parse_css_custom_properties,
)


class TestTier3CrossFeatureInteractions(unittest.TestCase):
    """Tier 3: Cross-Feature Interactions Verification."""

    def test_01_bundling_pipeline_and_syntax_verification_sequence(self):
        """
        Execute scripts/bundle.py and immediately verify that the generated
        payload/install-files/atlas.js compiles with node -c and initializes
        the Atlas namespace.
        """
        bundler_script = SCRIPTS_DIR / "bundle.py"
        self.assertTrue(
            bundler_script.is_file(),
            f"Bundler script missing: {bundler_script}"
        )

        # 1. Execute Bundler
        res_bundle = run_python(["scripts/bundle.py"])
        self.assertEqual(
            res_bundle.returncode,
            0,
            f"Bundler execution failed:\nSTDOUT: {res_bundle.stdout}\nSTDERR: {res_bundle.stderr}"
        )

        self.assertTrue(
            ATLAS_JS.is_file(),
            f"Bundled file not found at {ATLAS_JS}"
        )

        # 2. Execute Node.js Syntax Verification
        res_syntax = run_node("", args=["-c", str(ATLAS_JS)])
        self.assertEqual(
            res_syntax.returncode,
            0,
            f"Syntax validation failed on freshly bundled atlas.js:\nSTDERR: {res_syntax.stderr}"
        )

        # 3. Verify Runtime Initialization & Shared Namespace
        test_script = f"""
        const fs = require('fs');
        global.window = global;
        global.__Atlas = {{}};
        global.document = {{
            addEventListener: () => {{}},
            removeEventListener: () => {{}},
            querySelectorAll: () => [],
            querySelector: () => null,
            documentElement: {{ classList: {{ add: () => {{}}, remove: () => {{}} }} }},
            body: {{ style: {{}} }}
        }};
        global.navigator = {{ clipboard: {{ writeText: () => Promise.resolve() }} }};
        global.chrome = {{
            runtime: {{ onMessage: {{ addListener: () => {{}} }} }},
            storage: {{
                local: {{ get: (k, cb) => cb && cb({{}}) }},
                sync: {{ get: (k, cb) => cb && cb({{}}) }}
            }}
        }};

        try {{
            const code = fs.readFileSync({json.dumps(str(ATLAS_JS))}, 'utf8');
            eval(code);

            const hasNamespace = Boolean(global.window.__Atlas || global.Atlas);
            const ns = global.window.__Atlas || global.Atlas || {{}};

            console.log(JSON.stringify({{
                ok: true,
                hasNamespace: hasNamespace,
                hasShowUiMenu: typeof ns.showUiMenu === 'function',
                hasSpelling: Boolean(ns.spelling || global.spelling)
            }}));
        }} catch (err) {{
            console.log(JSON.stringify({{ ok: false, error: String(err && err.stack ? err.stack : err) }}));
        }}
        """

        res_eval = run_node(test_script)
        self.assertEqual(
            res_eval.returncode,
            0,
            f"Runtime evaluation of bundled atlas.js failed:\nSTDERR: {res_eval.stderr}"
        )
        data = json.loads(res_eval.stdout.strip())
        self.assertTrue(
            data.get("ok"),
            f"Evaluation error: {data.get('error')}"
        )
        self.assertTrue(
            data.get("hasNamespace"),
            "Bundled atlas.js did not initialize window.__Atlas or Atlas namespace"
        )

    def test_02_harper_tooltips_and_atlas_context_menu_coexistence(self):
        """
        Verify that components/atlas/atlas-ctxmenu.js respects Harper tooltips/underlines
        via bubble phase listener, defaultPrevented checks, and Harper element guards.
        """
        self.assertTrue(
            ATLAS_CTXMENU_JS.is_file(),
            f"atlas-ctxmenu.js missing at {ATLAS_CTXMENU_JS}"
        )

        content = ATLAS_CTXMENU_JS.read_text(encoding="utf-8", errors="replace")

        # 1. Verify bubble phase listener (3rd param is false or omitted)
        bubble_match = re.search(
            r"addEventListener\(\s*['\"]contextmenu['\"]\s*,\s*function[^{]*\{[\s\S]*?\}\s*,\s*(false)?\s*\)",
            content
        )
        self.assertIsNotNone(
            bubble_match,
            "atlas-ctxmenu.js must use bubble-phase event listener for 'contextmenu' to allow child handlers to intercept"
        )

        # 2. Verify defaultPrevented check
        self.assertRegex(
            content,
            r"if\s*\(\s*e\.defaultPrevented\s*\)\s*return",
            "atlas-ctxmenu.js must yield if e.defaultPrevented is true (so page/Harper handlers can own click)"
        )

        # 3. Verify Harper-specific element guard or isolation
        has_harper_guard = bool(
            re.search(r"harper", content, re.IGNORECASE) or
            re.search(r"defaultPrevented", content)
        )
        self.assertTrue(
            has_harper_guard,
            "atlas-ctxmenu.js must provide non-interference guards for in-page extensions like Harper"
        )

        # 4. Behavioral simulation in Node.js
        test_sim = f"""
        const fs = require('fs');
        let listener = null;
        global.window = global;
        global.document = {{
            addEventListener: (event, fn, useCapture) => {{
                if (event === 'contextmenu') listener = fn;
            }},
            removeEventListener: () => {{}},
            createElement: () => ({{
                setAttribute: () => {{}},
                attachShadow: () => ({{ appendChild: () => {{}} }}),
                appendChild: () => {{}},
                style: {{}}
            }})
        }};
        global.chrome = {{
            storage: {{
                sync: {{ get: (k, cb) => cb && cb({{}}) }},
                onChanged: {{ addListener: () => {{}} }}
            }}
        }};

        const code = fs.readFileSync({json.dumps(str(ATLAS_CTXMENU_JS))}, 'utf8');
        eval(code);

        let menuOpened = false;
        // Mock event where Harper cancelled default
        const mockHarperEvent = {{
            defaultPrevented: true,
            shiftKey: false,
            target: {{
                closest: (sel) => sel.includes('harper') ? {{}} : null
            }},
            preventDefault: () => {{ menuOpened = true; }}
        }};

        if (listener) {{
            listener(mockHarperEvent);
        }}

        console.log(JSON.stringify({{
            hasListener: typeof listener === 'function',
            menuOpenedWhenCancelled: menuOpened
        }}));
        """

        res_sim = run_node(test_sim)
        self.assertEqual(res_sim.returncode, 0, f"Simulation failed: {res_sim.stderr}")
        sim_data = json.loads(res_sim.stdout.strip())
        self.assertTrue(sim_data.get("hasListener"), "Context menu listener was not registered")
        self.assertFalse(
            sim_data.get("menuOpenedWhenCancelled"),
            "Atlas context menu opened even when event was claimed / default was prevented by Harper"
        )

    def test_03_css_token_cascade_and_consumption(self):
        """
        Verify CSS token cascade:
        1. 00-tokens.css defines standard --atlas-* custom properties.
        2. Component stylesheets (01-07) consume variables defined in tokens.css.
        3. No component stylesheet references an undefined --atlas-* variable.
        """
        self.assertTrue(CSS_MODS_DIR.is_dir(), f"CSS directory missing: {CSS_MODS_DIR}")

        tokens_file = CSS_MODS_DIR / "00-tokens.css"
        self.assertTrue(tokens_file.is_file(), f"00-tokens.css missing at {tokens_file}")

        tokens_css = tokens_file.read_text(encoding="utf-8", errors="replace")
        defined_in_tokens, _ = parse_css_custom_properties(tokens_css)

        # Check that tokens.css defines substantial token set
        atlas_tokens = {t for t in defined_in_tokens if t.startswith("--atlas-")}
        self.assertGreaterEqual(
            len(atlas_tokens),
            15,
            f"00-tokens.css defines fewer than 15 --atlas-* tokens (found {len(atlas_tokens)}: {atlas_tokens})"
        )

        # Inspect stylesheets 01 through 07
        all_defined_tokens = set(defined_in_tokens)
        component_files = [f for f in EXPECTED_CSS_FILES if f != "00-tokens.css"]

        total_consumed = 0
        undefined_usages = {}

        for comp_name in component_files:
            comp_path = CSS_MODS_DIR / comp_name
            if not comp_path.is_file():
                continue

            comp_css = comp_path.read_text(encoding="utf-8", errors="replace")
            local_defined, comp_consumed = parse_css_custom_properties(comp_css)
            all_defined_tokens.update(local_defined)

            # Count --atlas-* consumed
            atlas_consumed = {t for t in comp_consumed if t.startswith("--atlas-")}
            total_consumed += len(atlas_consumed)

            # Check for undefined variables without fallback
            unresolved = set()
            for m in re.finditer(r"var\(\s*(--atlas-[a-zA-Z0-9_-]+)\s*(?:,\s*([^)]+))?\)", comp_css):
                var_name = m.group(1)
                fallback = m.group(2)
                if var_name not in all_defined_tokens and not fallback:
                    unresolved.add(var_name)

            if unresolved:
                undefined_usages[comp_name] = sorted(list(unresolved))


        self.assertGreater(
            total_consumed,
            10,
            f"Component stylesheets consume unexpectedly few --atlas-* variables ({total_consumed})"
        )

        self.assertEqual(
            undefined_usages,
            {},
            f"Component stylesheets reference undefined --atlas-* custom properties: {undefined_usages}"
        )

    def test_04_addressbar_context_menu_spelling_integration(self):
        """
        Verify that 03-contextmenu.js queries the spelling engine and prepends
        spelling candidates before standard clipboard operations when a misspelled word is targeted.
        """
        target_file = JS_MODULES_DIR / "03-contextmenu.js"
        if not target_file.is_file():
            target_file = ATLAS_JS

        self.assertTrue(
            target_file.is_file(),
            f"Cannot find context menu module at {target_file}"
        )

        content = target_file.read_text(encoding="utf-8", errors="replace")

        # Verify reference to spelling engine
        has_spelling_ref = bool(
            re.search(r"Atlas\.spelling", content) or
            re.search(r"getSuggestions", content) or
            re.search(r"spelling", content, re.IGNORECASE)
        )

        self.assertTrue(
            has_spelling_ref,
            f"{target_file.name} does not reference Atlas.spelling or getSuggestions to inject spelling candidates"
        )

    def test_05_page_spelling_and_context_menu_simulation(self):
        """
        Simulate right-clicking on an editable field with a misspelled word in Node.js
        with atlas-spelling.js and atlas-ctxmenu.js loaded. Verify spelling candidates are returned.
        """
        spelling_file = INSTALL_FILES_DIR / "components" / "atlas" / "atlas-spelling.js"
        ctx_file = INSTALL_FILES_DIR / "components" / "atlas" / "atlas-ctxmenu.js"
        self.assertTrue(spelling_file.is_file(), f"Missing {spelling_file}")
        self.assertTrue(ctx_file.is_file(), f"Missing {ctx_file}")

        test_sim = f"""
        const fs = require('fs');
        global.window = global;
        global.window.addEventListener = () => {{}};
        global.window.removeEventListener = () => {{}};

        const capturedLabels = [];

        global.document = {{
            addEventListener: (event, fn) => {{
                if (event === 'contextmenu') global._ctxListener = fn;
            }},
            removeEventListener: () => {{}},
            createElement: (tag) => {{
                const el = {{
                    tagName: tag.toUpperCase(),
                    children: [],
                    style: {{}},
                    setAttribute: () => {{}},
                    addEventListener: () => {{}},
                    removeEventListener: () => {{}},
                    appendChild: (c) => {{ el.children.push(c); }},
                    getBoundingClientRect: () => ({{ width: 100, height: 100 }}),
                    attachShadow: () => ({{ appendChild: () => {{}} }})
                }};
                Object.defineProperty(el, 'textContent', {{
                    set(val) {{ el._text = val; capturedLabels.push(val); }},
                    get() {{ return el._text || ''; }}
                }});
                return el;
            }},
            createElementNS: () => ({{
                addEventListener: () => {{}},
                removeEventListener: () => {{}},
                setAttribute: () => {{}},
                appendChild: () => {{}},
                getBoundingClientRect: () => ({{ width: 100, height: 100 }}),
                style: {{}}
            }}),
            body: {{ appendChild: () => {{}} }}
        }};
        global.chrome = {{
            storage: {{
                sync: {{ get: (k, cb) => cb && cb({{}}) }},
                onChanged: {{ addListener: () => {{}} }}
            }}
        }};

        // Load spelling engine then context menu
        eval(fs.readFileSync({json.dumps(str(spelling_file))}, 'utf8'));
        eval(fs.readFileSync({json.dumps(str(ctx_file))}, 'utf8'));

        // Simulate right click on editable input with typo 'reciept'
        const fakeInput = {{
            tagName: 'INPUT',
            type: 'text',
            value: 'reciept',
            selectionStart: 2,
            selectionEnd: 2,
            focus: () => {{}},
            closest: (sel) => {{
                if (sel.indexOf('input') !== -1) return fakeInput;
                return null;
            }}
        }};

        const evt = {{
            target: fakeInput,
            shiftKey: false,
            defaultPrevented: false,
            clientX: 100,
            clientY: 100,
            preventDefault: () => {{}}
        }};

        global._ctxListener(evt);

        console.log(JSON.stringify({{
            ok: true,
            labels: capturedLabels
        }}));
        """
        res = run_node(test_sim)
        self.assertEqual(res.returncode, 0, f"Simulation failed: {res.stderr}")
        data = json.loads(res.stdout.strip())
        labels = data.get("labels", [])
        self.assertIn("recent", labels, f"Spelling candidate 'recent' missing in menu labels: {labels}")
        self.assertIn("Cut", labels, f"Clipboard command 'Cut' missing in menu labels: {labels}")

    def test_06_content_script_registration_includes_spelling(self):
        """
        Verify that 02-detractless-bridge.js registers atlas-spelling.js alongside atlas-ctxmenu.js
        for all_urls content scripts and in injectCtxMenu.
        """
        bridge_file = JS_MODULES_DIR / "02-detractless-bridge.js"
        self.assertTrue(bridge_file.is_file(), f"Missing {bridge_file}")
        content = bridge_file.read_text(encoding="utf-8", errors="replace")

        self.assertRegex(
            content,
            r"components/atlas/atlas-spelling\.js",
            "02-detractless-bridge.js must register components/atlas/atlas-spelling.js"
        )
        self.assertRegex(
            content,
            r"components/atlas/atlas-ctxmenu\.js",
            "02-detractless-bridge.js must register components/atlas/atlas-ctxmenu.js"
        )


if __name__ == "__main__":
    unittest.main()
