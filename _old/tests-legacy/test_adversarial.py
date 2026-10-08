"""
Adversarial Stress-Testing Suite for Offline Spelling Engine (14-spelling.js)
and Address Bar Context Menu (05-contextmenu.js).

Challenger 1 Verification Suite.
"""

import sys
import json
import time
import unittest
import subprocess
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
SPELLING_JS = PROJECT_ROOT / "src" / "modules" / "14-spelling.js"
CONTEXTMENU_JS = PROJECT_ROOT / "src" / "modules" / "05-contextmenu.js"
ATLAS_JS = PROJECT_ROOT / "payload" / "install-files" / "atlas.js"


def run_node_code(js_code: str) -> dict:
    """Executes JS in Node.js and returns parsed JSON output or raw result."""
    res = subprocess.run(
        ["node", "-e", js_code],
        cwd=str(PROJECT_ROOT),
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=15
    )
    if res.returncode != 0:
        return {"ok": False, "error": f"Node exited with {res.returncode}: {res.stderr.strip()}"}
    try:
        return json.loads(res.stdout.strip())
    except Exception:
        return {"ok": True, "raw": res.stdout.strip()}


class TestAdversarialSpellingEngine(unittest.TestCase):
    """Adversarial stress-testing of Atlas.spelling."""

    @classmethod
    def setUpClass(cls):
        cls.target_spelling = SPELLING_JS if SPELLING_JS.is_file() else ATLAS_JS
        cls.assertTrue(cls.target_spelling.is_file(), f"Spelling file not found: {cls.target_spelling}")

    def _exec_spelling_test(self, test_body: str) -> dict:
        harness = f"""
        const fs = require('fs');
        global.window = global;
        global.__Atlas = {{}};
        global.Atlas = global.__Atlas;
        eval(fs.readFileSync({json.dumps(str(self.target_spelling))}, 'utf8'));
        const spelling = Atlas.spelling;

        try {{
            {test_body}
        }} catch (err) {{
            console.log(JSON.stringify({{ ok: false, error: err.stack || String(err) }}));
        }}
        """
        return run_node_code(harness)

    def test_01_high_edit_distance_and_gibberish(self):
        """Test inputs with edit distance > 5 and random gibberish."""
        js = """
        const words = [
            'abcdefghijk', 'zzqqwwxxvv', 'qwertyuiopasdf',
            'supercalifragilistic', 'antidisestablishmentarianism',
            'xkjqpvwyz12345', 'qqqqqqqqqqqq', 'zzzzzzzzzzzz'
        ];
        const results = [];
        let error = null;
        for (const w of words) {
            const chk = spelling.checkWord(w);
            const suggs = spelling.getSuggestions(w, 3);
            if (suggs.length > 3) {
                error = `Too many suggestions for ${w}: ${suggs.length}`;
                break;
            }
            results.push({ word: w, valid: chk, suggCount: suggs.length, suggs: suggs });
        }
        if (error) {
            console.log(JSON.stringify({ ok: false, error: error }));
        } else {
            console.log(JSON.stringify({ ok: true, results: results }));
        }
        """
        res = self._exec_spelling_test(js)
        self.assertTrue(res.get("ok"), f"High edit distance test failed: {res.get('error')}")
        for r in res.get("results", []):
            self.assertFalse(r["valid"], f"Gibberish '{r['word']}' was marked valid")
            self.assertEqual(r["suggCount"], 0, f"Gibberish '{r['word']}' returned suggestions: {r['suggs']}")

    def test_02_extreme_string_lengths(self):
        """Test extreme string lengths (1,000, 10,000, 100,000 chars) for OOM or buffer overflow."""
        js = """
        const lengths = [1000, 5000, 10000, 50000, 100000];
        const results = [];
        for (const len of lengths) {
            const str = 'x'.repeat(len);
            const t0 = performance.now();
            const chk = spelling.checkWord(str);
            const tChk = performance.now() - t0;

            const t1 = performance.now();
            const suggs = spelling.getSuggestions(str, 3);
            const tSugg = performance.now() - t1;

            results.push({ len, chk, suggsCount: suggs.length, tChkMs: tChk, tSuggMs: tSugg });
        }
        console.log(JSON.stringify({ ok: true, results: results }));
        """
        res = self._exec_spelling_test(js)
        self.assertTrue(res.get("ok"), f"Extreme length test failed: {res.get('error')}")
        for r in res.get("results", []):
            self.assertFalse(r["chk"])
            self.assertEqual(r["suggsCount"], 0)
            self.assertLess(r["tSuggMs"], 50.0, f"Suggestion generation for len={r['len']} took too long: {r['tSuggMs']}ms")

    def test_03_unicode_emojis_and_symbols(self):
        """Test Unicode accents, emojis, non-Latin scripts, and symbols."""
        js = """
        const testCases = [
            '😀😁😂🤣', '🌍🚀✨', 'hello👋world',
            'café', 'naïve', 'résumé',
            '日本語', 'العربية', 'русский',
            '!@#$%^&*()', 'word!', '...test...', '(brackets)', 'hyphen-word'
        ];
        const results = [];
        for (const tc of testCases) {
            const chk = spelling.checkWord(tc);
            const suggs = spelling.getSuggestions(tc, 3);
            results.push({ tc, chk, suggCount: suggs.length, suggs });
        }
        console.log(JSON.stringify({ ok: true, results: results }));
        """
        res = self._exec_spelling_test(js)
        self.assertTrue(res.get("ok"), f"Unicode test failed: {res.get('error')}")
        for r in res.get("results", []):
            self.assertLessEqual(r["suggCount"], 3)

    def test_04_urls_ips_and_ports(self):
        """Test URLs, IPv4/IPv6, ports, query strings, and fragments."""
        js = """
        const urls = [
            'https://admin:pass@example.com:8080/path?q=test#anchor',
            'http://127.0.0.1:3000/api/v1',
            '192.168.1.1',
            'vivaldi://settings/appearance',
            'chrome://extensions',
            'file:///C:/Windows/System32/',
            'ftp://ftp.example.org/pub/files',
            'localhost:8080'
        ];
        const results = [];
        for (const u of urls) {
            const chk = spelling.checkWord(u);
            const suggs = spelling.getSuggestions(u, 3);
            const selInput = { value: u, selectionStart: 0, selectionEnd: u.length };
            const wordSel = spelling.getWordAtInput(selInput);
            results.push({ u, chk, suggCount: suggs.length, wordSel });
        }
        console.log(JSON.stringify({ ok: true, results: results }));
        """
        res = self._exec_spelling_test(js)
        self.assertTrue(res.get("ok"), f"URL test failed: {res.get('error')}")
        for r in res.get("results", []):
            self.assertIsNone(r["wordSel"], f"Full URL '{r['u']}' should return null from getWordAtInput")
            self.assertEqual(r["suggCount"], 0, f"Full URL '{r['u']}' returned suggestions: {r}")

    def test_05_casing_variations(self):
        """Test casing resilience: ALL CAPS, Title Case, camelCase, sPoNgEbOb case."""
        js = """
        const cases = [
            { word: 'SEARCH', expectedCheck: true },
            { word: 'SERCH', expectedCheck: false, expectedSugg: 'search' },
            { word: 'Search', expectedCheck: true },
            { word: 'Serch', expectedCheck: false, expectedSugg: 'search' },
            { word: 'sEaRcH', expectedCheck: true },
            { word: 'sEuRcH', expectedCheck: false, expectedSugg: 'search' },
            { word: 'DEFINATELY', expectedCheck: false, expectedSugg: 'definitely' },
            { word: 'Definately', expectedCheck: false, expectedSugg: 'definitely' },
            { word: 'dEfInAtElY', expectedCheck: false, expectedSugg: 'definitely' },
            { word: 'BROWSER', expectedCheck: true },
            { word: 'BROWSR', expectedCheck: false, expectedSugg: 'browser' },
            { word: 'VIVALDI', expectedCheck: true },
            { word: 'VIVALDII', expectedCheck: false, expectedSugg: 'vivaldi' }
        ];
        const results = [];
        for (const c of cases) {
            const chk = spelling.checkWord(c.word);
            const suggs = spelling.getSuggestions(c.word, 3);
            results.push({
                word: c.word,
                chk,
                expectedCheck: c.expectedCheck,
                suggs,
                hasExpectedSugg: c.expectedSugg ? suggs.includes(c.expectedSugg) : true
            });
        }
        console.log(JSON.stringify({ ok: true, results: results }));
        """
        res = self._exec_spelling_test(js)
        self.assertTrue(res.get("ok"), f"Casing test failed: {res.get('error')}")
        for r in res.get("results", []):
            self.assertEqual(r["chk"], r["expectedCheck"], f"Check mismatch on '{r['word']}'")
            self.assertTrue(r["hasExpectedSugg"], f"Typo '{r['word']}' did not suggest target. Suggs: {r['suggs']}")

    def test_06_throughput_benchmarks(self):
        """Benchmark calls/sec and latency for checkWord and getSuggestions to guarantee sub-millisecond runtime."""
        js = """
        const wordsToCheck = ['search', 'vivaldi', 'atlas', 'serch', 'browsr', 'definately', '12345', '', 'zzqqww', 'longwordtest'];
        const wordsToSuggest = ['serch', 'browsr', 'definately', 'sarch', 'windw', 'zzqqww', 'search', '12345', 'teh', 'seperate'];

        // Warm up
        for (let i = 0; i < 500; i++) {
            spelling.checkWord('serch');
            spelling.getSuggestions('serch', 3);
        }

        const N_CHECK = 50000;
        const t0 = performance.now();
        for (let i = 0; i < N_CHECK; i++) {
            spelling.checkWord(wordsToCheck[i % wordsToCheck.length]);
        }
        const tCheck = performance.now() - t0;
        const checkOpsPerSec = N_CHECK / (tCheck / 1000);
        const checkAvgUs = (tCheck / N_CHECK) * 1000;

        const N_SUGG = 3000;
        const t1 = performance.now();
        for (let i = 0; i < N_SUGG; i++) {
            spelling.getSuggestions(wordsToSuggest[i % wordsToSuggest.length], 3);
        }
        const tSugg = performance.now() - t1;
        const suggOpsPerSec = N_SUGG / (tSugg / 1000);
        const suggAvgMs = tSugg / N_SUGG;

        console.log(JSON.stringify({
            ok: true,
            checkOpsPerSec,
            checkAvgUs,
            suggOpsPerSec,
            suggAvgMs
        }));
        """
        res = self._exec_spelling_test(js)
        self.assertTrue(res.get("ok"), f"Benchmark failed: {res.get('error')}")
        sugg_avg_ms = res.get("suggAvgMs", 999)
        self.assertLess(
            sugg_avg_ms,
            1.0,
            f"getSuggestions must execute in <1ms on average. Measured: {sugg_avg_ms:.4f}ms"
        )
        self.assertGreater(
            res.get("checkOpsPerSec", 0),
            100000,
            f"checkWord throughput too low: {res.get('checkOpsPerSec')}"
        )


class TestAdversarialContextMenuIntegration(unittest.TestCase):
    """Adversarial stress-testing of 05-contextmenu.js address bar interactions."""

    def _exec_contextmenu_test(self, test_body: str) -> dict:
        harness = f"""
        const fs = require('fs');
        global.window = global;
        global.window.innerWidth = 1280;
        global.window.innerHeight = 800;
        global.__Atlas = {{}};
        global.Atlas = global.__Atlas;
        eval(fs.readFileSync({json.dumps(str(SPELLING_JS))}, 'utf8'));

        function makeMockElement(tag) {{
            return {{
                tagName: (tag || 'DIV').toUpperCase(),
                className: '',
                classList: {{
                    add: function(c) {{ this.className += ' ' + c; }},
                    remove: function(c) {{ this.className = this.className.replace(c, '').trim(); }},
                    contains: function(c) {{ return this.className.includes(c); }}
                }},
                style: {{}},
                setAttribute: () => {{}},
                setAttributeNS: () => {{}},
                children: [],
                appendChild: function(ch) {{
                    this.children.push(ch);
                }},
                addEventListener: () => {{}},
                removeEventListener: () => {{}},
                remove: function() {{
                    this.children = [];
                }},
                getBoundingClientRect: () => ({{ width: 180, height: 220, top: 50, left: 50 }}),
                contains: () => false
            }};
        }}

        let hostElement = makeMockElement('body');
        let listeners = {{}};
        global.document = {{
            addEventListener: (n, f) => {{ listeners[n] = f; }},
            removeEventListener: () => {{}},
            querySelectorAll: () => [],
            getElementById: () => hostElement,
            body: hostElement,
            createElement: (t) => makeMockElement(t),
            createElementNS: (ns, t) => makeMockElement(t)
        }};

        eval(fs.readFileSync({json.dumps(str(CONTEXTMENU_JS))}, 'utf8'));
        const ctxListener = listeners['contextmenu'];

        try {{
            {test_body}
        }} catch (err) {{
            console.log(JSON.stringify({{ ok: false, error: err.stack || String(err) }}));
        }}
        """
        return run_node_code(harness)

    def test_01_empty_input_and_caret_positions(self):
        """Test address bar right-click on empty input, and caret at start/end of words."""
        js = """
        const scenarios = [
            { name: 'empty_input', val: '', selStart: 0, selEnd: 0 },
            { name: 'caret_at_start', val: 'definately', selStart: 0, selEnd: 0 },
            { name: 'caret_at_end', val: 'definately', selStart: 10, selEnd: 10 },
            { name: 'caret_in_middle', val: 'definately', selStart: 4, selEnd: 4 },
            { name: 'caret_after_space', val: 'definately ', selStart: 11, selEnd: 11 }
        ];

        const outcomes = [];
        for (const sc of scenarios) {
            hostElement.children = [];
            const mockInput = {
                tagName: 'INPUT',
                value: sc.val,
                selectionStart: sc.selStart,
                selectionEnd: sc.selEnd,
                closest: (sel) => sel.includes('AddressField') ? { querySelector: () => mockInput } : null,
                focus: () => {}
            };
            const mockEvent = {
                target: mockInput,
                clientX: 50,
                clientY: 50,
                preventDefault: () => {},
                stopImmediatePropagation: () => {}
            };
            ctxListener(mockEvent);

            const menu = hostElement.children.find(c => c.className.includes('atlas-profile-menu'));
            const items = [];
            if (menu) {
                for (const ch of menu.children) {
                    if (ch.tagName === 'BUTTON') {
                        const labelSpan = ch.children[0];
                        items.push({
                            label: labelSpan ? labelSpan.textContent : '',
                            dis: ch.className.includes('dis')
                        });
                    }
                }
            }

            outcomes.push({
                scenario: sc.name,
                menuOpened: Boolean(menu),
                items
            });
        }
        console.log(JSON.stringify({ ok: true, outcomes: outcomes }));
        """
        res = self._exec_contextmenu_test(js)
        self.assertTrue(res.get("ok"), f"Caret test failed: {res.get('error')}")
        outcomes = {o["scenario"]: o for o in res.get("outcomes", [])}

        # Empty input should open menu without spelling suggestions
        empty_items = [it["label"] for it in outcomes["empty_input"]["items"] if it.get("label")]
        self.assertNotIn("definitely", empty_items)
        self.assertIn("Paste", empty_items)

        # Caret at start, middle, and end of 'definately' should prepend 'definitely'
        for sc in ["caret_at_start", "caret_in_middle", "caret_at_end"]:
            labels = [it["label"] for it in outcomes[sc]["items"] if it.get("label")]
            self.assertEqual(labels[0], "definitely", f"Scenario {sc} did not prepend 'definitely'. Labels: {labels}")

    def test_02_selection_spanning_multiple_words(self):
        """Test right-click when user selection spans multiple words."""
        js = """
        const multiWordScenarios = [
            { val: 'hello world here', selStart: 0, selEnd: 11 }, // 'hello world'
            { val: 'go to the store', selStart: 0, selEnd: 5 },   // 'go to'
            { val: 'in it', selStart: 0, selEnd: 5 }               // 'in it'
        ];
        const results = [];
        for (const sc of multiWordScenarios) {
            hostElement.children = [];
            const mockInput = {
                tagName: 'INPUT',
                value: sc.val,
                selectionStart: sc.selStart,
                selectionEnd: sc.selEnd,
                closest: (sel) => sel.includes('AddressField') ? { querySelector: () => mockInput } : null,
                focus: () => {}
            };
            const mockEvent = {
                target: mockInput,
                clientX: 50,
                clientY: 50,
                preventDefault: () => {},
                stopImmediatePropagation: () => {}
            };
            ctxListener(mockEvent);

            const menu = hostElement.children.find(c => c.className.includes('atlas-profile-menu'));
            const items = [];
            if (menu) {
                for (const ch of menu.children) {
                    if (ch.tagName === 'BUTTON') {
                        const labelSpan = ch.children[0];
                        items.push({
                            label: labelSpan ? labelSpan.textContent : '',
                            dis: ch.className.includes('dis')
                        });
                    }
                }
            }

            results.push({
                val: sc.val,
                menuOpened: Boolean(menu),
                items
            });
        }
        console.log(JSON.stringify({ ok: true, results: results }));
        """
        res = self._exec_contextmenu_test(js)
        self.assertTrue(res.get("ok"), f"Multi-word selection test failed: {res.get('error')}")
        for r in res.get("results", []):
            self.assertTrue(r["menuOpened"], "Menu should open even on multi-word selection")
            labels = [it["label"] for it in r["items"] if it.get("label")]
            self.assertIn("Cut", labels)
            self.assertIn("Copy", labels)
            self.assertIn("Paste", labels)

    def test_03_non_string_values_and_type_coercion(self):
        """
        Adversarial test: non-string values passed to spelling API or input.value.
        Verifies behavior under non-standard inputs.
        """
        js = """
        const nonStrings = [12345, true, {}, [], () => {}];
        const apiResults = [];
        for (const val of nonStrings) {
            let chkErr = null, suggErr = null;
            try {
                Atlas.spelling.checkWord(val);
            } catch (e) {
                chkErr = e.message;
            }
            try {
                Atlas.spelling.getSuggestions(val, 3);
            } catch (e) {
                suggErr = e.message;
            }
            apiResults.push({ type: typeof val, chkErr, suggErr });
        }

        // Test non-string input.value in context menu
        let menuCrashed = false;
        let menuCrashMsg = null;
        try {
            const mockInput = {
                tagName: 'INPUT',
                value: 12345, // numeric value
                selectionStart: 0,
                selectionEnd: 0,
                closest: (sel) => sel.includes('AddressField') ? { querySelector: () => mockInput } : null,
                focus: () => {}
            };
            const mockEvent = {
                target: mockInput,
                clientX: 50,
                clientY: 50,
                preventDefault: () => {},
                stopImmediatePropagation: () => {}
            };
            ctxListener(mockEvent);
        } catch (e) {
            menuCrashed = true;
            menuCrashMsg = e.message;
        }

        console.log(JSON.stringify({
            ok: true,
            apiResults,
            menuCrashedWithNumericValue: menuCrashed,
            menuCrashMsg
        }));
        """
        res = self._exec_contextmenu_test(js)
        self.assertTrue(res.get("ok"), f"Non-string test failed: {res.get('error')}")
        self.assertTrue(
            res.get("menuCrashedWithNumericValue"),
            "Empirically verified that non-string input.value crashes contextmenu listener due to missing type-guard"
        )


if __name__ == "__main__":
    unittest.main(verbosity=2)
